//! View methods (04 §4.5).

use crate::*;

#[near]
impl Contract {
    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn get_params(&self) -> Params {
        self.params.clone()
    }

    pub fn get_job(&self, job_id: u64) -> Option<Job> {
        self.jobs.get(&job_id).cloned()
    }

    /// Jobs by id ascending, starting at `from_index` (job ids start at 1). `limit` ≤ 50.
    pub fn get_jobs(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<Job> {
        let from = from_index.unwrap_or(1).max(1);
        let limit = limit.unwrap_or(PAGE_MAX).min(PAGE_MAX);
        (from..self.next_job_id).take(limit as usize).filter_map(|id| self.jobs.get(&id).cloned()).collect()
    }

    /// `role` = "requester" | "worker"; `from_index` is an offset into that account's job list.
    pub fn get_jobs_by_account(&self, account_id: AccountId, role: String, from_index: Option<u64>, limit: Option<u64>) -> Vec<Job> {
        let ids = match role.as_str() {
            "requester" => self.by_requester.get(&account_id),
            "worker" => self.by_worker.get(&account_id),
            _ => env::panic_str(E15),
        };
        let limit = limit.unwrap_or(PAGE_MAX).min(PAGE_MAX) as usize;
        ids.map(|ids| {
            ids.iter()
                .skip(from_index.unwrap_or(0) as usize)
                .take(limit)
                .filter_map(|id| self.jobs.get(id).cloned())
                .collect()
        })
        .unwrap_or_default()
    }

    pub fn get_job_count(&self) -> u64 {
        self.next_job_id - 1
    }

    pub fn get_verifier(&self, account_id: AccountId) -> Option<Verifier> {
        self.verifiers.get(&account_id).cloned()
    }

    pub fn get_verifiers(&self) -> Vec<Verifier> {
        self.verifiers.values().cloned().collect()
    }

    pub fn get_claimable(&self, account_id: AccountId) -> U128 {
        U128(self.claimable.get(&account_id).copied().unwrap_or(0))
    }

    pub fn get_treasury(&self) -> U128 {
        U128(self.treasury)
    }

    pub fn get_totals(&self) -> Totals {
        self.totals.clone()
    }

    pub fn get_agent_stats(&self, account_id: AccountId) -> AgentStats {
        self.agent_stats.get(&account_id).cloned().unwrap_or_default()
    }

    pub fn get_snapshots(&self, limit: Option<u32>) -> Vec<SnapshotRoot> {
        let n = self.snapshots.len();
        let limit = limit.unwrap_or(10).min(50);
        (n.saturating_sub(limit)..n).rev().filter_map(|i| self.snapshots.get(i).cloned()).collect()
    }
}
