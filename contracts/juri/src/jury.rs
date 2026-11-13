//! Jury: selection, commit, reveal, finalize, restart (04 §4.3, §6, §7; FR-D5, FR-D6, FR-E2, FR-E6,
//! FR-E7, FR-E10, FR-E11, FR-G1).

use crate::events::emit;
use crate::tally::{majority, tally};
use crate::*;
use near_sdk::json_types::U64;
use near_sdk::serde_json::json;

impl Contract {
    /// 04 §6: Fisher–Yates over active verifiers (minus requester/worker/excluded), seeded by
    /// sha256(random_seed ‖ job_id_le ‖ restarts). Falls back to ignoring `exclude` if too few.
    pub(crate) fn select_jury(&self, job: &Job, exclude: &[AccountId]) -> Vec<AccountId> {
        let size = self.params.jury_size as usize;
        let eligible = |v: &&Verifier| v.active && v.account_id != job.requester && v.account_id != job.worker;
        let mut cand: Vec<AccountId> = self
            .verifiers
            .values()
            .filter(eligible)
            .filter(|v| !exclude.contains(&v.account_id))
            .map(|v| v.account_id.clone())
            .collect();
        if cand.len() < size && !exclude.is_empty() {
            cand = self.verifiers.values().filter(eligible).map(|v| v.account_id.clone()).collect();
        }
        require!(cand.len() >= size, E14);

        let mut seed_in = env::random_seed();
        seed_in.extend_from_slice(&job.id.to_le_bytes());
        seed_in.push(job.restarts);
        let mut seed = env::sha256(&seed_in);
        for i in (1..cand.len()).rev() {
            let r = u64::from_le_bytes(seed[0..8].try_into().unwrap());
            let j = (r % (i as u64 + 1)) as usize;
            cand.swap(i, j);
            seed = env::sha256(&seed);
        }
        cand.truncate(size);
        cand
    }

    fn open_jury(&self, job: &mut Job, exclude: &[AccountId]) {
        job.jury = self.select_jury(job, exclude);
        let now = env::block_timestamp();
        let commit_deadline = now + self.params.commit_secs as u64 * NS_PER_SEC;
        job.commit_deadline = U64(commit_deadline);
        job.reveal_deadline = U64(commit_deadline + self.params.reveal_secs as u64 * NS_PER_SEC);
        job.commits.clear();
        job.reveals.clear();
        job.status = JobStatus::Committing;
        emit(
            "jury_selected",
            json!({
                "job_id": job.id,
                "jury": job.jury,
                "commit_deadline": job.commit_deadline,
                "reveal_deadline": job.reveal_deadline,
                "restarts": job.restarts,
            }),
        );
    }

    fn mark_missed(&mut self, job: &Job) {
        for v in &job.jury {
            if !job.reveals.iter().any(|r| &r.verifier == v) {
                if let Some(ver) = self.verifiers.get_mut(v) {
                    ver.missed_reveals += 1;
                }
            }
        }
    }

    fn settle(&mut self, job: &mut Job) {
        let reveals: Vec<Vec<u8>> = job.reveals.iter().map(|r| r.verdicts.clone()).collect();
        let t = match tally(
            &job.criteria_kinds,
            &reveals,
            job.jury.len(),
            &job.payout_mode,
            job.amount.0,
            self.params.fee_bps,
            self.params.jury_share_bps,
        ) {
            Some(t) => t,
            None => {
                self.mark_missed(job);
                job.status = JobStatus::Stalled;
                emit(
                    "job_stalled",
                    json!({ "job_id": job.id, "revealed": job.reveals.len(), "required": majority(job.jury.len()) }),
                );
                return;
            }
        };

        let k = job.criteria_kinds.len() as u32;
        let mut shares = Vec::with_capacity(job.reveals.len());
        for (i, r) in job.reveals.iter().enumerate() {
            let amount = t.shares[i];
            self.credit(&r.verifier, amount);
            if let Some(v) = self.verifiers.get_mut(&r.verifier) {
                v.votes += 1;
                if t.agree[i] * 2 > k {
                    v.majority_agreements += 1;
                }
                v.earned = add_u128(v.earned, amount);
            }
            shares.push(Share { verifier: r.verifier.clone(), agree: t.agree[i], amount: U128(amount) });
        }
        self.mark_missed(job);
        self.treasury = self.treasury.checked_add(t.to_treasury).unwrap_or_else(|| env::panic_str(E15));
        let (worker, requester) = (job.worker.clone(), job.requester.clone());
        self.credit(&worker, t.to_worker);
        self.credit(&requester, t.to_requester);

        let passed = matches!(t.outcome, Outcome::Released | Outcome::Split);
        let st = self.stats_mut(&worker);
        st.worker_settled += 1;
        if passed {
            st.worker_passed += 1;
            st.worker_earned = add_u128(st.worker_earned, t.to_worker);
        } else {
            st.worker_failed += 1;
        }
        self.totals.total_fee = add_u128(self.totals.total_fee, t.fee);
        self.totals.total_jury_pool = add_u128(self.totals.total_jury_pool, t.jury_pool);
        self.totals.settled_jobs += 1;

        job.injection_flagged = job.reveals.iter().any(|r| r.injection_flag);
        job.criteria_result = t.result.clone();
        job.outcome = Some(t.outcome.clone());
        job.status = JobStatus::Settled;
        job.settlement = Some(Settlement {
            fee: U128(t.fee),
            jury_pool: U128(t.jury_pool),
            net: U128(t.net),
            to_worker: U128(t.to_worker),
            to_requester: U128(t.to_requester),
            to_treasury: U128(t.to_treasury),
            shares,
        });
        emit(
            "job_settled",
            json!({
                "job_id": job.id,
                "outcome": t.outcome,
                "criteria_result": t.result,
                "fee": U128(t.fee),
                "jury_pool": U128(t.jury_pool),
                "net": U128(t.net),
                "injection_flagged": job.injection_flagged,
            }),
        );
    }
}

#[near]
impl Contract {
    /// Anyone, while Submitted (FR-D5).
    pub fn start_judging(&mut self, job_id: u64) {
        let mut job = self.load_job(job_id);
        require!(job.status == JobStatus::Submitted, E05);
        self.open_jury(&mut job, &[]);
        self.jobs.insert(job_id, job);
    }

    /// Jurors only, via their FCAK (FR-E6).
    pub fn commit_vote(&mut self, job_id: u64, commitment: String) {
        let mut job = self.load_job(job_id);
        let me = env::predecessor_account_id();
        require!(job.status == JobStatus::Committing, E05);
        require!(job.jury.contains(&me), E04);
        require!(env::block_timestamp() <= job.commit_deadline.0, E06);
        require!(!job.commits.iter().any(|c| c.verifier == me), E08);
        check_hash(&commitment);
        job.commits.push(Commit { verifier: me.clone(), commitment });
        self.jobs.insert(job_id, job);
        emit("vote_committed", json!({ "job_id": job_id, "verifier": me }));
    }

    /// Opens once all jurors committed or the commit deadline passed (FR-E7).
    #[allow(clippy::too_many_arguments)]
    pub fn reveal_vote(
        &mut self,
        job_id: u64,
        verdicts: Vec<u8>,
        injection_flag: bool,
        evidence_hash: String,
        salt: String,
        attestation_hash: Option<String>,
        model: String,
    ) {
        let mut job = self.load_job(job_id);
        let me = env::predecessor_account_id();
        let now = env::block_timestamp();
        require!(job.status == JobStatus::Committing, E05);
        require!(job.jury.contains(&me), E04);
        require!(job.commits.len() == job.jury.len() || now > job.commit_deadline.0, E07);
        require!(now <= job.reveal_deadline.0, E06);
        let commit = job.commits.iter().find(|c| c.verifier == me).map(|c| c.commitment.clone());
        let commit = commit.unwrap_or_else(|| env::panic_str(E09));
        require!(!job.reveals.iter().any(|r| r.verifier == me), E21);
        require!(
            verdicts.len() == job.criteria_kinds.len() && verdicts.iter().all(|&v| v == FAIL || v == PASS || v == UNSURE),
            E12
        );
        check_hash(&evidence_hash);
        check_hash(&salt);
        if let Some(a) = &attestation_hash {
            check_hash(a);
        }
        check_len(&model, MAX_MODEL_LEN);
        let expected = commitment_hex(job_id, me.as_str(), &verdicts, injection_flag, &evidence_hash, &salt);
        require!(expected == commit, E10);

        job.reveals.push(Reveal {
            verifier: me.clone(),
            verdicts: verdicts.clone(),
            injection_flag,
            evidence_hash: evidence_hash.clone(),
            attestation_hash: attestation_hash.clone(),
            model: model.clone(),
        });
        self.jobs.insert(job_id, job);
        emit(
            "vote_revealed",
            json!({
                "job_id": job_id,
                "verifier": me,
                "verdicts": verdicts,
                "injection_flag": injection_flag,
                "evidence_hash": evidence_hash,
                "attestation_hash": attestation_hash,
                "model": model,
            }),
        );
    }

    /// Anyone: early when every juror committed and revealed, otherwise after the reveal deadline.
    pub fn finalize(&mut self, job_id: u64) {
        let mut job = self.load_job(job_id);
        require!(job.status == JobStatus::Committing, E05);
        let all_in = job.commits.len() == job.jury.len() && job.reveals.len() == job.commits.len();
        require!(all_in || env::block_timestamp() > job.reveal_deadline.0, E07);
        self.settle(&mut job);
        self.jobs.insert(job_id, job);
    }

    /// Anyone, while Stalled (FR-E10): a new jury once, then refund without fee.
    pub fn restart_jury(&mut self, job_id: u64) {
        let mut job = self.load_job(job_id);
        require!(job.status == JobStatus::Stalled, E05);
        if job.restarts < self.params.max_restarts {
            let exclude: Vec<AccountId> =
                job.jury.iter().filter(|v| !job.reveals.iter().any(|r| &r.verifier == *v)).cloned().collect();
            job.restarts += 1;
            self.open_jury(&mut job, &exclude);
        } else {
            self.credit(&job.requester.clone(), job.amount.0);
            job.status = JobStatus::Settled;
            job.outcome = Some(Outcome::RefundedNoFee);
            job.settlement = Some(Settlement {
                fee: U128(0),
                jury_pool: U128(0),
                net: job.amount,
                to_worker: U128(0),
                to_requester: job.amount,
                to_treasury: U128(0),
                shares: vec![],
            });
            emit(
                "job_settled",
                json!({
                    "job_id": job_id,
                    "outcome": Outcome::RefundedNoFee,
                    "criteria_result": Vec::<u8>::new(),
                    "fee": U128(0),
                    "jury_pool": U128(0),
                    "net": job.amount,
                    "injection_flagged": false,
                }),
            );
        }
        self.jobs.insert(job_id, job);
    }
}
