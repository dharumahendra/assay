//! Unit tests (04 §11). Settlement math has its own tests in `tally.rs`.

use crate::*;
use near_sdk::json_types::U64;
use near_sdk::serde_json::{self, Value};
use near_sdk::test_utils::{get_created_receipts, get_logs, VMContextBuilder};
use near_sdk::{testing_env, NearToken, PromiseError, PublicKey};

const CONTRACT: &str = "juri.alice.testnet";
const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
const SEC: u64 = 1_000_000_000;
const T0: u64 = 1_800_000_000 * SEC;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn owner() -> AccountId {
    acc("alice.testnet")
}
fn req() -> AccountId {
    acc("req.testnet")
}
fn wkr() -> AccountId {
    acc("worker.testnet")
}
fn vid(i: usize) -> AccountId {
    acc(&format!("v{}.{}", i, CONTRACT))
}
fn h(s: &str) -> String {
    to_hex(&env::sha256(s.as_bytes()))
}

struct T {
    c: Contract,
    now: u64,
}

impl T {
    fn new(verifiers: usize) -> Self {
        let mut t = T { c: T::fresh(), now: T0 };
        for i in 1..=verifiers {
            t.at(&acc(CONTRACT), 0);
            assert!(t.c.on_verifier_created(vid(i), acc(&format!("payout{}.testnet", i)), format!("model-{}", i), U128(NEAR), U128(NEAR + NEAR / 2), Ok(())));
        }
        t
    }

    fn fresh() -> Contract {
        let mut b = VMContextBuilder::new();
        b.current_account_id(acc(CONTRACT)).predecessor_account_id(owner()).block_timestamp(T0);
        testing_env!(b.build());
        Contract::new(owner(), None)
    }

    fn at(&mut self, pred: &AccountId, deposit: u128) {
        let mut b = VMContextBuilder::new();
        b.current_account_id(acc(CONTRACT))
            .predecessor_account_id(pred.clone())
            .signer_account_id(pred.clone())
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(self.now)
            .random_seed([7u8; 32]);
        testing_env!(b.build());
    }

    fn advance(&mut self, secs: u64) {
        self.now += secs * SEC;
    }

    fn create(&mut self, kinds: Vec<u8>) -> u64 {
        self.at(&req(), 5 * NEAR);
        self.c.create_job(wkr(), h("criteria"), "https://api.test/blobs/x".into(), kinds, 3600, Some("mkt-1".into()), None)
    }

    fn submitted(&mut self, kinds: Vec<u8>) -> u64 {
        let id = self.create(kinds);
        self.at(&wkr(), 0);
        self.c.submit_deliverable(id, h("deliverable"), "https://api.test/blobs/d".into());
        id
    }

    fn judging(&mut self, kinds: Vec<u8>) -> (u64, Vec<AccountId>) {
        let id = self.submitted(kinds);
        self.at(&acc("keeper.testnet"), 0);
        self.c.start_judging(id);
        (id, self.c.get_job(id).unwrap().jury)
    }

    fn commit(&mut self, id: u64, v: &AccountId, verdicts: &[u8], inj: bool) {
        self.at(v, 0);
        let c = commitment_hex(id, v.as_str(), verdicts, inj, &h(&format!("ev-{}", v)), &h(&format!("salt-{}", v)));
        self.c.commit_vote(id, c);
    }

    fn reveal(&mut self, id: u64, v: &AccountId, verdicts: &[u8], inj: bool) {
        self.at(v, 0);
        self.c.reveal_vote(id, verdicts.to_vec(), inj, h(&format!("ev-{}", v)), h(&format!("salt-{}", v)), None, "m".into());
    }

    fn vote_all(&mut self, id: u64, jury: &[AccountId], votes: &[(&[u8], bool)]) {
        for (v, (d, inj)) in jury.iter().zip(votes) {
            self.commit(id, v, d, *inj);
        }
        for (v, (d, inj)) in jury.iter().zip(votes) {
            self.reveal(id, v, d, *inj);
        }
    }

    fn claimable(&self, a: &AccountId) -> u128 {
        self.c.get_claimable(a.clone()).0
    }
}

fn event_names() -> Vec<String> {
    get_logs()
        .iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .map(|j| serde_json::from_str::<Value>(j).unwrap()["event"].as_str().unwrap().to_string())
        .collect()
}

// ---------- commitment (04 §5) ----------

#[test]
fn commitment_vectors_match_typescript() {
    let raw = include_str!("../../../packages/shared/src/commitment-vectors.json");
    let v: Value = serde_json::from_str(raw).unwrap();
    let vectors = v["vectors"].as_array().unwrap();
    assert!(!vectors.is_empty());
    T::fresh();
    for x in vectors {
        let verdicts: Vec<u8> = x["verdicts"].as_array().unwrap().iter().map(|n| n.as_u64().unwrap() as u8).collect();
        let args = (
            x["job_id"].as_u64().unwrap(),
            x["verifier_id"].as_str().unwrap(),
            x["injection_flag"].as_bool().unwrap(),
            x["evidence_hash"].as_str().unwrap(),
            x["salt_hex"].as_str().unwrap(),
        );
        assert_eq!(commitment_preimage(args.0, args.1, &verdicts, args.2, args.3, args.4), x["preimage"].as_str().unwrap());
        assert_eq!(commitment_hex(args.0, args.1, &verdicts, args.2, args.3, args.4), x["commitment"].as_str().unwrap());
    }
}

// ---------- init / params ----------

#[test]
#[should_panic(expected = "E15: InvalidParams")]
fn init_rejects_bad_params() {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc(CONTRACT)).predecessor_account_id(owner());
    testing_env!(b.build());
    Contract::new(owner(), Some(Params { jury_size: 4, ..Params::default() }));
}

#[test]
fn set_params_bounds() {
    let mut t = T::new(0);
    t.at(&owner(), 0);
    t.c.set_params(Params { fee_bps: 1000, commit_secs: 60, reveal_secs: 86_400, jury_size: 5, ..Params::default() });
    assert_eq!(t.c.get_params().jury_size, 5);
    for bad in [
        Params { fee_bps: 1001, ..Params::default() },
        Params { jury_share_bps: 10_001, ..Params::default() },
        Params { commit_secs: 59, ..Params::default() },
        Params { reveal_secs: 86_401, ..Params::default() },
        Params { max_criteria: 14, ..Params::default() },
    ] {
        assert!(!bad.is_valid());
    }
}

#[test]
#[should_panic(expected = "E01: NotOwner")]
fn set_params_owner_only() {
    let mut t = T::new(0);
    t.at(&req(), 0);
    t.c.set_params(Params::default());
}

// ---------- create / cancel / submit / reclaim ----------

#[test]
fn create_job_stores_escrow_minus_storage() {
    let mut t = T::new(0);
    let id = t.create(vec![MUST, MUST, SHOULD]);
    assert_eq!(id, 1);
    let j = t.c.get_job(id).unwrap();
    assert_eq!(j.status, JobStatus::Funded);
    assert!(j.amount.0 < 5 * NEAR && j.amount.0 > 4 * NEAR, "storage cost deducted");
    assert_eq!(j.submit_deadline.0, T0 + 3600 * SEC);
    assert_eq!(j.market_job_id.as_deref(), Some("mkt-1"));
    assert_eq!(t.c.get_agent_stats(req()).requester_jobs, 1);
    assert_eq!(event_names(), vec!["job_created"]);
    assert_eq!(t.c.get_jobs_by_account(req(), "requester".into(), None, None).len(), 1);
    assert_eq!(t.c.get_jobs_by_account(wkr(), "worker".into(), None, None).len(), 1);
    assert_eq!(t.c.get_jobs(None, None).len(), 1);
    assert_eq!(t.c.get_job_count(), 1);
}

fn create_with(kinds: Vec<u8>, hash: String, uri: String, worker: AccountId, deposit: u128, secs: u64) {
    let mut t = T::new(0);
    t.at(&req(), deposit);
    t.c.create_job(worker, hash, uri, kinds, secs, None, None);
}

#[test]
#[should_panic(expected = "E19: SelfDealing")]
fn create_self_dealing() {
    create_with(vec![MUST], h("c"), "u".into(), req(), NEAR, 3600);
}
#[test]
#[should_panic(expected = "E17: InvalidHash")]
fn create_bad_hash() {
    create_with(vec![MUST], "ABC".into(), "u".into(), wkr(), NEAR, 3600);
}
#[test]
#[should_panic(expected = "E17: InvalidHash")]
fn create_uppercase_hash() {
    create_with(vec![MUST], h("c").to_uppercase(), "u".into(), wkr(), NEAR, 3600);
}
#[test]
#[should_panic(expected = "E18: StringTooLong")]
fn create_long_uri() {
    create_with(vec![MUST], h("c"), "x".repeat(513), wkr(), NEAR, 3600);
}
#[test]
#[should_panic(expected = "E11: InvalidCriteria")]
fn create_no_must() {
    create_with(vec![SHOULD, SHOULD], h("c"), "u".into(), wkr(), NEAR, 3600);
}
#[test]
#[should_panic(expected = "E11: InvalidCriteria")]
fn create_too_many_criteria() {
    create_with(vec![MUST; 14], h("c"), "u".into(), wkr(), NEAR, 3600);
}
#[test]
#[should_panic(expected = "E11: InvalidCriteria")]
fn create_bad_kind() {
    create_with(vec![MUST, 2], h("c"), "u".into(), wkr(), NEAR, 3600);
}
#[test]
#[should_panic(expected = "E13: InsufficientDeposit")]
fn create_small_deposit() {
    create_with(vec![MUST], h("c"), "u".into(), wkr(), NEAR / 10, 3600);
}
#[test]
#[should_panic(expected = "E15: InvalidParams")]
fn create_short_deadline() {
    create_with(vec![MUST], h("c"), "u".into(), wkr(), NEAR, 59);
}

#[test]
fn cancel_refunds_requester() {
    let mut t = T::new(0);
    let id = t.create(vec![MUST]);
    let amount = t.c.get_job(id).unwrap().amount.0;
    t.at(&req(), 0);
    t.c.cancel_job(id);
    assert_eq!(t.c.get_job(id).unwrap().status, JobStatus::Cancelled);
    assert_eq!(t.claimable(&req()), amount);
}

#[test]
#[should_panic(expected = "E02: NotRequester")]
fn cancel_not_requester() {
    let mut t = T::new(0);
    let id = t.create(vec![MUST]);
    t.at(&wkr(), 0);
    t.c.cancel_job(id);
}

#[test]
#[should_panic(expected = "E05: InvalidStatus")]
fn cancel_after_submit() {
    let mut t = T::new(0);
    let id = t.submitted(vec![MUST]);
    t.at(&req(), 0);
    t.c.cancel_job(id);
}

#[test]
#[should_panic(expected = "E03: NotWorker")]
fn submit_not_worker() {
    let mut t = T::new(0);
    let id = t.create(vec![MUST]);
    t.at(&req(), 0);
    t.c.submit_deliverable(id, h("d"), "u".into());
}

#[test]
#[should_panic(expected = "E06: DeadlinePassed")]
fn submit_after_deadline() {
    let mut t = T::new(0);
    let id = t.create(vec![MUST]);
    t.advance(3601);
    t.at(&wkr(), 0);
    t.c.submit_deliverable(id, h("d"), "u".into());
}

#[test]
#[should_panic(expected = "E07: DeadlineNotReached")]
fn reclaim_before_deadline() {
    let mut t = T::new(0);
    let id = t.create(vec![MUST]);
    t.advance(3600);
    t.at(&acc("anyone.testnet"), 0);
    t.c.reclaim_expired(id);
}

#[test]
fn reclaim_after_deadline() {
    let mut t = T::new(0);
    let id = t.create(vec![MUST]);
    let amount = t.c.get_job(id).unwrap().amount.0;
    t.advance(3601);
    t.at(&acc("anyone.testnet"), 0);
    t.c.reclaim_expired(id);
    assert_eq!(t.c.get_job(id).unwrap().status, JobStatus::Expired);
    assert_eq!(t.claimable(&req()), amount);
}

#[test]
#[should_panic(expected = "E22: JobNotFound")]
fn unknown_job() {
    let mut t = T::new(0);
    t.at(&req(), 0);
    t.c.cancel_job(99);
}

// ---------- verifier registry ----------

#[test]
fn register_verifier_creates_subaccount_with_fcak() {
    let mut t = T::new(0);
    t.at(&owner(), NEAR + NEAR / 2);
    let pk: PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap();
    let _ = t.c.register_verifier("v1".into(), pk, acc("payout.testnet"), "nearai:qwen".into());
    let receipts = get_created_receipts();
    assert_eq!(receipts[0].receiver_id, vid(1));
    let dbg = format!("{:?}", receipts[0].actions);
    assert!(dbg.contains("CreateAccount"), "{}", dbg);
    assert!(dbg.contains(r#"AddKeyWithFunctionCall"#) && dbg.contains(r#"method_names: ["commit_vote", "reveal_vote", "withdraw"]"#), "{}", dbg);
    assert!(dbg.contains(r#"receiver_id: AccountId("juri.alice.testnet")"#), "{}", dbg);
    assert!(!dbg.contains("AddKeyWithFullAccess"), "verifier must not get a full access key");
}

#[test]
#[should_panic(expected = "E01: NotOwner")]
fn register_verifier_owner_only() {
    let mut t = T::new(0);
    t.at(&req(), 2 * NEAR);
    let pk: PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap();
    let _ = t.c.register_verifier("v1".into(), pk, req(), "m".into());
}

#[test]
#[should_panic(expected = "E15: InvalidParams")]
fn register_verifier_bad_name() {
    let mut t = T::new(0);
    t.at(&owner(), 2 * NEAR);
    let pk: PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap();
    let _ = t.c.register_verifier("V1.x".into(), pk, req(), "m".into());
}

#[test]
#[should_panic(expected = "E13: InsufficientDeposit")]
fn register_verifier_low_deposit() {
    let mut t = T::new(0);
    t.at(&owner(), NEAR);
    let pk: PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap();
    let _ = t.c.register_verifier("v1".into(), pk, req(), "m".into());
}

#[test]
#[should_panic(expected = "E20: VerifierExists")]
fn register_verifier_twice() {
    let mut t = T::new(1);
    t.at(&owner(), 2 * NEAR);
    let pk: PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap();
    let _ = t.c.register_verifier("v1".into(), pk, req(), "m".into());
}

#[test]
fn failed_verifier_creation_credits_owner() {
    let mut t = T::new(0);
    t.at(&acc(CONTRACT), 0);
    let ok = t.c.on_verifier_created(vid(1), req(), "m".into(), U128(NEAR), U128(2 * NEAR), Err(PromiseError::Failed));
    assert!(!ok);
    assert!(t.c.get_verifier(vid(1)).is_none());
    assert_eq!(t.claimable(&owner()), 2 * NEAR);
}

#[test]
fn deactivate_verifier() {
    let mut t = T::new(4);
    t.at(&owner(), 0);
    t.c.set_verifier_active(vid(2), false);
    assert!(!t.c.get_verifier(vid(2)).unwrap().active);
    let (_, jury) = t.judging(vec![MUST]);
    assert!(!jury.contains(&vid(2)));
}

// ---------- jury ----------

#[test]
#[should_panic(expected = "E14: NotEnoughVerifiers")]
fn start_needs_enough_verifiers() {
    let mut t = T::new(2);
    t.judging(vec![MUST]);
}

#[test]
fn jury_excludes_requester_and_worker() {
    let mut t = T::new(4);
    t.at(&req(), 5 * NEAR);
    let id = t.c.create_job(vid(1), h("c"), "u".into(), vec![MUST], 3600, None, None);
    t.at(&vid(1), 0);
    t.c.submit_deliverable(id, h("d"), "u".into());
    t.at(&req(), 0);
    t.c.start_judging(id);
    let j = t.c.get_job(id).unwrap();
    assert_eq!(j.status, JobStatus::Committing);
    assert_eq!(j.jury.len(), 3);
    assert!(!j.jury.contains(&vid(1)));
    let mut d = j.jury.clone();
    d.dedup();
    assert_eq!(d.len(), 3);
    assert_eq!(j.commit_deadline.0, T0 + 180 * SEC);
    assert_eq!(j.reveal_deadline.0, T0 + 360 * SEC);
}

#[test]
fn full_lifecycle_released_and_fee_split() {
    let mut t = T::new(4);
    let (id, jury) = t.judging(vec![MUST, MUST, SHOULD]);
    let amount = t.c.get_job(id).unwrap().amount.0;
    t.vote_all(id, &jury, &[(&[1, 1, 1], false), (&[1, 1, 0], false), (&[1, 1, 1], false)]);
    t.at(&acc("keeper.testnet"), 0);
    t.c.finalize(id);
    let j = t.c.get_job(id).unwrap();
    assert_eq!(j.status, JobStatus::Settled);
    assert_eq!(j.outcome, Some(Outcome::Released));
    assert_eq!(j.criteria_result, vec![1, 1, 1]);
    let s = j.settlement.unwrap();
    assert_eq!(t.claimable(&wkr()), s.net.0);
    let shares: u128 = jury.iter().map(|v| t.claimable(v)).sum();
    assert_eq!(t.claimable(&wkr()) + shares + t.c.get_treasury().0, amount, "every yocto accounted for");
    assert_eq!(t.c.get_agent_stats(wkr()).worker_passed, 1);
    assert_eq!(t.c.get_totals().settled_jobs, 1);
    let v = t.c.get_verifier(jury[1].clone()).unwrap();
    assert_eq!((v.votes, v.majority_agreements), (1, 1));
    assert!(t.claimable(&jury[0]) > t.claimable(&jury[1]), "full agreement earns more");
    assert!(event_names().contains(&"job_settled".to_string()));
}

#[test]
fn injection_is_refunded_and_flagged() {
    let mut t = T::new(4);
    // C0 integrity criterion is MUST; two jurors fail it and flag injection; one is fooled.
    let (id, jury) = t.judging(vec![MUST, MUST]);
    t.vote_all(id, &jury, &[(&[0, 1], true), (&[0, 1], true), (&[1, 1], false)]);
    t.at(&req(), 0);
    t.c.finalize(id);
    let j = t.c.get_job(id).unwrap();
    assert_eq!(j.outcome, Some(Outcome::Refunded));
    assert!(j.injection_flagged);
    assert_eq!(t.claimable(&req()), j.settlement.unwrap().net.0);
    assert_eq!(t.claimable(&wkr()), 0);
    assert_eq!(t.c.get_agent_stats(wkr()).worker_failed, 1);
}

#[test]
#[should_panic(expected = "E04: NotJuror")]
fn commit_not_juror() {
    let mut t = T::new(4);
    let (id, _) = t.judging(vec![MUST]);
    t.at(&req(), 0);
    t.c.commit_vote(id, h("x"));
}

#[test]
#[should_panic(expected = "E08: AlreadyCommitted")]
fn commit_twice() {
    let mut t = T::new(4);
    let (id, jury) = t.judging(vec![MUST]);
    t.commit(id, &jury[0], &[1], false);
    t.commit(id, &jury[0], &[1], false);
}

#[test]
#[should_panic(expected = "E06: DeadlinePassed")]
fn commit_after_deadline() {
    let mut t = T::new(4);
    let (id, jury) = t.judging(vec![MUST]);
    t.advance(181);
    t.commit(id, &jury[0], &[1], false);
}

#[test]
#[should_panic(expected = "E07: DeadlineNotReached")]
fn reveal_before_all_committed() {
    let mut t = T::new(4);
    let (id, jury) = t.judging(vec![MUST]);
    t.commit(id, &jury[0], &[1], false);
    t.reveal(id, &jury[0], &[1], false);
}

#[test]
#[should_panic(expected = "E10: CommitmentMismatch")]
fn reveal_wrong_salt_fails() {
    let mut t = T::new(4);
    let (id, jury) = t.judging(vec![MUST]);
    for v in &jury {
        t.commit(id, v, &[1], false);
    }
    t.at(&jury[0], 0);
    t.c.reveal_vote(id, vec![1], false, h(&format!("ev-{}", jury[0])), h("wrong salt"), None, "m".into());
}

#[test]
#[should_panic(expected = "E10: CommitmentMismatch")]
fn reveal_changed_vote_fails() {
    let mut t = T::new(4);
    let (id, jury) = t.judging(vec![MUST]);
    for v in &jury {
        t.commit(id, v, &[0], false);
    }
    t.reveal(id, &jury[0], &[1], false);
}

#[test]
#[should_panic(expected = "E09: NotCommitted")]
fn reveal_without_commit() {
    let mut t = T::new(4);
    let (id, jury) = t.judging(vec![MUST]);
    t.commit(id, &jury[0], &[1], false);
    t.advance(181);
    t.reveal(id, &jury[1], &[1], false);
}

#[test]
#[should_panic(expected = "E21: AlreadyRevealed")]
fn reveal_twice() {
    let mut t = T::new(4);
    let (id, jury) = t.judging(vec![MUST]);
    for v in &jury {
        t.commit(id, v, &[1], false);
    }
    t.reveal(id, &jury[0], &[1], false);
    t.reveal(id, &jury[0], &[1], false);
}

#[test]
#[should_panic(expected = "E12: InvalidVerdicts")]
fn reveal_wrong_length() {
    let mut t = T::new(4);
    let (id, jury) = t.judging(vec![MUST, MUST]);
    for v in &jury {
        t.commit(id, v, &[1], false);
    }
    t.reveal(id, &jury[0], &[1], false);
}

#[test]
#[should_panic(expected = "E07: DeadlineNotReached")]
fn finalize_too_early() {
    let mut t = T::new(4);
    let (id, jury) = t.judging(vec![MUST]);
    for v in &jury {
        t.commit(id, v, &[1], false);
    }
    t.reveal(id, &jury[0], &[1], false);
    t.at(&req(), 0);
    t.c.finalize(id);
}

#[test]
fn finalize_after_deadline_with_majority_counts_missed() {
    let mut t = T::new(4);
    let (id, jury) = t.judging(vec![MUST]);
    for v in &jury {
        t.commit(id, v, &[1], false);
    }
    t.reveal(id, &jury[0], &[1], false);
    t.reveal(id, &jury[1], &[1], false);
    t.advance(361);
    t.at(&req(), 0);
    t.c.finalize(id);
    assert_eq!(t.c.get_job(id).unwrap().outcome, Some(Outcome::Released));
    assert_eq!(t.c.get_verifier(jury[2].clone()).unwrap().missed_reveals, 1);
}

#[test]
#[should_panic(expected = "E05: InvalidStatus")]
fn finalize_is_idempotent() {
    let mut t = T::new(4);
    let (id, jury) = t.judging(vec![MUST]);
    t.vote_all(id, &jury, &[(&[1], false), (&[1], false), (&[1], false)]);
    t.at(&req(), 0);
    t.c.finalize(id);
    t.c.finalize(id);
}

#[test]
fn stall_restart_excludes_non_revealers_then_settles() {
    let mut t = T::new(5);
    let (id, jury) = t.judging(vec![MUST]);
    t.commit(id, &jury[0], &[1], false);
    t.advance(181);
    t.reveal(id, &jury[0], &[1], false);
    t.advance(180);
    t.at(&req(), 0);
    t.c.finalize(id);
    assert_eq!(t.c.get_job(id).unwrap().status, JobStatus::Stalled);
    t.c.restart_jury(id);
    let j = t.c.get_job(id).unwrap();
    assert_eq!((j.status.clone(), j.restarts), (JobStatus::Committing, 1));
    assert!(!j.jury.contains(&jury[1]) && !j.jury.contains(&jury[2]), "non-revealers excluded");
    assert!(j.commits.is_empty() && j.reveals.is_empty());
    let jury2 = j.jury;
    t.vote_all(id, &jury2, &[(&[1], false), (&[1], false), (&[0], false)]);
    t.at(&req(), 0);
    t.c.finalize(id);
    assert_eq!(t.c.get_job(id).unwrap().outcome, Some(Outcome::Released));
}

#[test]
fn stall_twice_refunds_without_fee() {
    let mut t = T::new(4);
    let (id, _) = t.judging(vec![MUST]);
    let amount = t.c.get_job(id).unwrap().amount.0;
    for _ in 0..2 {
        t.advance(361);
        t.at(&req(), 0);
        t.c.finalize(id);
        assert_eq!(t.c.get_job(id).unwrap().status, JobStatus::Stalled);
        t.c.restart_jury(id);
    }
    let j = t.c.get_job(id).unwrap();
    assert_eq!(j.outcome, Some(Outcome::RefundedNoFee));
    assert_eq!(t.claimable(&req()), amount);
    assert_eq!(t.c.get_treasury().0, 0);
}

// ---------- withdraw / treasury ----------

#[test]
fn verifier_withdraw_goes_to_payout_account() {
    let mut t = T::new(4);
    let (id, jury) = t.judging(vec![MUST]);
    t.vote_all(id, &jury, &[(&[1], false), (&[1], false), (&[1], false)]);
    t.at(&req(), 0);
    t.c.finalize(id);
    let v = jury[0].clone();
    let earned = t.claimable(&v);
    assert!(earned > 0);
    t.at(&v, 0);
    let _ = t.c.withdraw();
    assert_eq!(t.claimable(&v), 0);
    let r = get_created_receipts();
    let payout = t.c.get_verifier(v.clone()).unwrap().payout_account;
    assert_eq!(r[0].receiver_id, payout);
    // failed transfer restores the balance
    t.at(&acc(CONTRACT), 0);
    assert!(!t.c.on_withdraw(v.clone(), payout, U128(earned), Err(PromiseError::Failed)));
    assert_eq!(t.claimable(&v), earned);
}

#[test]
#[should_panic(expected = "E16: NothingToWithdraw")]
fn withdraw_nothing() {
    let mut t = T::new(0);
    t.at(&req(), 0);
    let _ = t.c.withdraw();
}

#[test]
fn treasury_withdraw_owner_only_and_restores_on_failure() {
    let mut t = T::new(4);
    let (id, jury) = t.judging(vec![MUST]);
    t.vote_all(id, &jury, &[(&[1], false), (&[1], false), (&[1], false)]);
    t.at(&req(), 0);
    t.c.finalize(id);
    let tr = t.c.get_treasury().0;
    assert!(tr > 0);
    t.at(&owner(), 0);
    let _ = t.c.withdraw_treasury(U128(tr), owner());
    assert_eq!(t.c.get_treasury().0, 0);
    t.at(&acc(CONTRACT), 0);
    t.c.on_treasury_withdrawn(owner(), U128(tr), Err(PromiseError::Failed));
    assert_eq!(t.c.get_treasury().0, tr);
}

#[test]
fn snapshot_roots() {
    let mut t = T::new(0);
    t.at(&owner(), 0);
    t.c.set_snapshot_poster(Some(acc("poster.testnet")));
    t.at(&acc("poster.testnet"), 0);
    t.c.post_snapshot(h("root"), U64(1), "ts-0.2".into(), h("src"));
    assert_eq!(t.c.get_snapshots(None)[0].algo_version, "ts-0.2");
}
