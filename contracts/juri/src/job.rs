//! Requester and worker methods (04 §4.2, FR-D1–D4).

use crate::events::emit;
use crate::*;
use near_sdk::json_types::U64;
use near_sdk::serde_json::json;

#[near]
impl Contract {
    /// Creates and funds a Protected Job. `amount = deposit − storage cost` (04 §4.2).
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn create_job(
        &mut self,
        worker: AccountId,
        criteria_hash: String,
        criteria_uri: String,
        criteria_kinds: Vec<u8>,
        submit_deadline_secs: u64,
        market_job_id: Option<String>,
        payout_mode: Option<PayoutMode>,
    ) -> u64 {
        let requester = env::predecessor_account_id();
        require!(worker != requester, E19);
        check_hash(&criteria_hash);
        check_len(&criteria_uri, MAX_URI_LEN);
        if let Some(m) = &market_job_id {
            check_len(m, MAX_MARKET_JOB_ID_LEN);
        }
        let k = criteria_kinds.len();
        require!(
            k >= 1
                && k <= self.params.max_criteria as usize
                && criteria_kinds.iter().all(|&x| x == MUST || x == SHOULD)
                && criteria_kinds.contains(&MUST),
            E11
        );
        require!((MIN_SUBMIT_SECS..=MAX_SUBMIT_SECS).contains(&submit_deadline_secs), E15);
        let payout_mode = payout_mode.unwrap_or(PayoutMode::Binary);
        if let PayoutMode::Partial { base_pct } = payout_mode {
            require!(base_pct <= 100, E15);
        }

        let deposit = env::attached_deposit().as_yoctonear();
        let before = env::storage_usage();
        let id = self.next_job_id;
        self.next_job_id += 1;
        let now = env::block_timestamp();
        let submit_deadline = now + submit_deadline_secs * NS_PER_SEC;
        self.jobs.insert(
            id,
            Job {
                id,
                requester: requester.clone(),
                worker: worker.clone(),
                amount: U128(0),
                criteria_hash: criteria_hash.clone(),
                criteria_uri,
                criteria_kinds: criteria_kinds.clone(),
                market_job_id: market_job_id.clone(),
                payout_mode,
                created_at: U64(now),
                submit_deadline: U64(submit_deadline),
                deliverable_hash: None,
                deliverable_uri: None,
                submitted_at: None,
                jury: vec![],
                commit_deadline: U64(0),
                reveal_deadline: U64(0),
                restarts: 0,
                commits: vec![],
                reveals: vec![],
                status: JobStatus::Funded,
                outcome: None,
                criteria_result: vec![],
                injection_flagged: false,
                settlement: None,
            },
        );
        let mut r = self.by_requester.get(&requester).cloned().unwrap_or_default();
        r.push(id);
        self.by_requester.insert(requester.clone(), r);
        let mut w = self.by_worker.get(&worker).cloned().unwrap_or_default();
        w.push(id);
        self.by_worker.insert(worker.clone(), w);
        self.stats_mut(&requester).requester_jobs += 1;

        // store collections write lazily: flush so storage_usage() sees the new bytes
        self.jobs.flush();
        self.by_requester.flush();
        self.by_worker.flush();
        self.agent_stats.flush();
        let used = env::storage_usage().saturating_sub(before) as u128;
        let cost = used * env::storage_byte_cost().as_yoctonear();
        require!(deposit > cost && deposit - cost >= self.params.min_amount.0, E13);
        let amount = deposit - cost;
        self.jobs.get_mut(&id).unwrap().amount = U128(amount);

        emit(
            "job_created",
            json!({
                "job_id": id,
                "requester": requester,
                "worker": worker,
                "amount": U128(amount),
                "criteria_hash": criteria_hash,
                "criteria_kinds": criteria_kinds,
                "market_job_id": market_job_id,
                "submit_deadline": U64(submit_deadline),
            }),
        );
        id
    }

    pub fn cancel_job(&mut self, job_id: u64) {
        let mut job = self.load_job(job_id);
        require!(env::predecessor_account_id() == job.requester, E02);
        require!(job.status == JobStatus::Funded, E05);
        job.status = JobStatus::Cancelled;
        self.credit(&job.requester, job.amount.0);
        self.jobs.insert(job_id, job);
        emit("job_cancelled", json!({ "job_id": job_id }));
    }

    pub fn submit_deliverable(&mut self, job_id: u64, deliverable_hash: String, deliverable_uri: String) {
        let mut job = self.load_job(job_id);
        require!(env::predecessor_account_id() == job.worker, E03);
        require!(job.status == JobStatus::Funded, E05);
        let now = env::block_timestamp();
        require!(now <= job.submit_deadline.0, E06);
        check_hash(&deliverable_hash);
        check_len(&deliverable_uri, MAX_URI_LEN);
        job.deliverable_hash = Some(deliverable_hash.clone());
        job.deliverable_uri = Some(deliverable_uri.clone());
        job.submitted_at = Some(U64(now));
        job.status = JobStatus::Submitted;
        self.jobs.insert(job_id, job);
        emit(
            "deliverable_submitted",
            json!({ "job_id": job_id, "deliverable_hash": deliverable_hash, "deliverable_uri": deliverable_uri }),
        );
    }

    /// Anyone, after the submit deadline, while still Funded: 100% back to the requester.
    pub fn reclaim_expired(&mut self, job_id: u64) {
        let mut job = self.load_job(job_id);
        require!(job.status == JobStatus::Funded, E05);
        require!(env::block_timestamp() > job.submit_deadline.0, E07);
        job.status = JobStatus::Expired;
        self.credit(&job.requester, job.amount.0);
        self.jobs.insert(job_id, job);
        emit("job_expired", json!({ "job_id": job_id }));
    }
}
