//! Tally and settlement math (04 §7). Pure, so every branch is unit-tested without a VM.

use crate::types::{Outcome, PayoutMode, MUST, PASS, SHOULD};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tally {
    /// Per criterion: 1 = passed by majority, 0 = not.
    pub result: Vec<u8>,
    pub outcome: Outcome,
    pub fee: u128,
    pub jury_pool: u128,
    pub net: u128,
    /// Per reveal, same order as the input.
    pub agree: Vec<u32>,
    pub shares: Vec<u128>,
    pub to_treasury: u128,
    pub to_worker: u128,
    pub to_requester: u128,
}

pub fn majority(jury_size: usize) -> usize {
    jury_size / 2 + 1
}

/// `a * b / c` with overflow checks (NFR-SEC-6). `c` must be > 0.
pub fn mul_div(a: u128, b: u128, c: u128) -> u128 {
    a.checked_mul(b).and_then(|x| x.checked_div(c)).unwrap_or_else(|| near_sdk::env::panic_str("E15: InvalidParams"))
}

/// Returns `None` when fewer than a majority revealed (→ Stalled).
pub fn tally(
    kinds: &[u8],
    reveals: &[Vec<u8>],
    jury_size: usize,
    mode: &PayoutMode,
    amount: u128,
    fee_bps: u16,
    jury_share_bps: u16,
) -> Option<Tally> {
    let maj = majority(jury_size);
    if reveals.len() < maj {
        return None;
    }
    let k = kinds.len();

    // 1) per criterion: PASS iff #PASS ≥ majority (UNSURE counts as not PASS)
    let result: Vec<u8> = (0..k)
        .map(|i| u8::from(reveals.iter().filter(|r| r.get(i) == Some(&PASS)).count() >= maj))
        .collect();
    let must_ok = (0..k).all(|i| kinds[i] != MUST || result[i] == 1);
    let should_total = kinds.iter().filter(|&&x| x == SHOULD).count() as u128;
    let should_pass = (0..k).filter(|&i| kinds[i] == SHOULD && result[i] == 1).count() as u128;
    let outcome = if !must_ok {
        Outcome::Refunded
    } else if matches!(mode, PayoutMode::Partial { .. }) && should_total > 0 {
        Outcome::Split
    } else {
        Outcome::Released
    };

    // 2) fee
    let fee = mul_div(amount, fee_bps as u128, 10_000);
    let jury_pool = mul_div(fee, jury_share_bps as u128, 10_000);
    let net = amount - fee;

    // 3) verifier shares ∝ agreement with the result
    let agree: Vec<u32> = reveals
        .iter()
        .map(|r| (0..k).filter(|&i| (r.get(i) == Some(&PASS)) == (result[i] == 1)).count() as u32)
        .collect();
    let sum_agree: u128 = agree.iter().map(|&a| a as u128).sum();
    let shares: Vec<u128> = if sum_agree == 0 {
        vec![0; reveals.len()]
    } else {
        agree.iter().map(|&a| mul_div(jury_pool, a as u128, sum_agree)).collect()
    };
    let to_treasury = fee - shares.iter().sum::<u128>();

    // 4) payout
    let (to_worker, to_requester) = match (&outcome, mode) {
        (Outcome::Released, _) => (net, 0),
        (Outcome::Split, PayoutMode::Partial { base_pct }) => {
            let base = *base_pct as u128;
            let pct_x100 = base * 100 + (100 - base) * should_pass * 100 / should_total;
            let w = mul_div(net, pct_x100, 10_000);
            (w, net - w)
        }
        _ => (0, net),
    };

    Some(Tally { result, outcome, fee, jury_pool, net, agree, shares, to_treasury, to_worker, to_requester })
}

#[cfg(test)]
mod tests {
    use super::*;
    const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
    const F: u8 = 0;
    const P: u8 = 1;
    const U: u8 = 2;

    fn conserved(t: &Tally, amount: u128) {
        assert_eq!(t.to_worker + t.to_requester + t.to_treasury + t.shares.iter().sum::<u128>(), amount, "no yocto lost");
    }

    #[test]
    fn example_from_spec() {
        // 10 NEAR, 3% fee, 80% to jury, 5 criteria (3 MUST, 2 SHOULD); agreements 5, 5, 3.
        let kinds = [MUST, MUST, MUST, SHOULD, SHOULD];
        let r = vec![vec![P, P, P, P, P], vec![P, P, P, P, P], vec![P, P, P, F, F]];
        let t = tally(&kinds, &r, 3, &PayoutMode::Binary, 10 * NEAR, 300, 8000).unwrap();
        assert_eq!(t.result, vec![1, 1, 1, 1, 1]);
        assert_eq!(t.outcome, Outcome::Released);
        assert_eq!(t.fee, 3 * NEAR / 10);
        assert_eq!(t.jury_pool, 24 * NEAR / 100);
        assert_eq!(t.net, 97 * NEAR / 10);
        assert_eq!(t.agree, vec![5, 5, 3]);
        assert_eq!(t.shares[0], t.jury_pool * 5 / 13);
        assert_eq!(t.to_worker, t.net);
        conserved(&t, 10 * NEAR);
    }

    #[test]
    fn one_must_fails_refunds() {
        let t = tally(&[MUST, MUST], &[vec![P, F], vec![P, F], vec![P, P]], 3, &PayoutMode::Binary, NEAR, 300, 8000).unwrap();
        assert_eq!(t.result, vec![1, 0]);
        assert_eq!(t.outcome, Outcome::Refunded);
        assert_eq!((t.to_worker, t.to_requester), (0, t.net));
        conserved(&t, NEAR);
    }

    #[test]
    fn unsure_is_not_pass() {
        let t = tally(&[MUST], &[vec![P], vec![U], vec![U]], 3, &PayoutMode::Binary, NEAR, 300, 8000).unwrap();
        assert_eq!(t.outcome, Outcome::Refunded);
    }

    #[test]
    fn each_verifier_fails_a_different_criterion_still_passes() {
        let r = vec![vec![F, P, P], vec![P, F, P], vec![P, P, F]];
        let t = tally(&[MUST, MUST, MUST], &r, 3, &PayoutMode::Binary, NEAR, 300, 8000).unwrap();
        assert_eq!(t.result, vec![1, 1, 1]);
        assert_eq!(t.outcome, Outcome::Released);
    }

    #[test]
    fn should_failure_does_not_block_binary_release() {
        let r = vec![vec![P, F], vec![P, F], vec![P, F]];
        let t = tally(&[MUST, SHOULD], &r, 3, &PayoutMode::Binary, NEAR, 300, 8000).unwrap();
        assert_eq!(t.outcome, Outcome::Released);
    }

    #[test]
    fn stall_when_less_than_majority() {
        assert!(tally(&[MUST], &[vec![P]], 3, &PayoutMode::Binary, NEAR, 300, 8000).is_none());
        assert!(tally(&[MUST], &[vec![P], vec![P]], 5, &PayoutMode::Binary, NEAR, 300, 8000).is_none());
        assert!(tally(&[MUST], &[vec![P], vec![P], vec![P]], 5, &PayoutMode::Binary, NEAR, 300, 8000).is_some());
    }

    #[test]
    fn sum_agree_zero_sends_fee_to_treasury() {
        // k = 0 cannot happen on-chain; empty criteria force sum_agree = 0 here.
        let t = tally(&[], &[vec![], vec![], vec![]], 3, &PayoutMode::Binary, NEAR, 300, 8000).unwrap();
        assert_eq!(t.shares, vec![0, 0, 0]);
        assert_eq!(t.to_treasury, t.fee);
        conserved(&t, NEAR);
    }

    #[test]
    fn partial_payout_split() {
        // base 50%, 1 of 2 SHOULD pass → 75% of net to worker
        let r = vec![vec![P, P, F], vec![P, P, F], vec![P, F, P]];
        let t = tally(&[MUST, SHOULD, SHOULD], &r, 3, &PayoutMode::Partial { base_pct: 50 }, 10 * NEAR, 300, 8000).unwrap();
        assert_eq!(t.outcome, Outcome::Split);
        assert_eq!(t.to_worker, t.net * 75 / 100);
        conserved(&t, 10 * NEAR);
    }

    #[test]
    fn fees_conserve_odd_amounts() {
        for amount in [1u128, 7, 9_999, 123_456_789_012_345_678_901, 3 * NEAR + 17] {
            for (fee_bps, share) in [(0u16, 0u16), (300, 8000), (1000, 10_000), (999, 3333)] {
                let r = vec![vec![P, F, U], vec![P, P, F], vec![F, P, P]];
                let t = tally(&[MUST, SHOULD, SHOULD], &r, 3, &PayoutMode::Partial { base_pct: 33 }, amount, fee_bps, share).unwrap();
                conserved(&t, amount);
            }
        }
    }
}
