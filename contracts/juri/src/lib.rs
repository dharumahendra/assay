//! Juri contract — escrow for Protected Jobs, an AI jury with commit-reveal, fee split and
//! on-chain reputation. Specification: docs/04-SMART-CONTRACT-SPEC.md.
//!
//! Layout: `types` (state types, errors), `tally` (pure settlement math), `job` (requester/worker),
//! `jury` (selection, commit, reveal, finalize, restart), `verifier` (sub-account + FCAK registry),
//! `funds` (withdraw, treasury, params), `views`, `events`.

mod events;
mod funds;
mod job;
mod jury;
pub mod tally;
pub mod types;
mod verifier;
mod views;

#[cfg(test)]
mod tests;

pub use types::*;

use near_sdk::json_types::U128;
use near_sdk::store::{IterableMap, LookupMap, Vector};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, PanicOnDefault};

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
pub(crate) enum Key {
    Jobs,
    Verifiers,
    Claimable,
    AgentStats,
    ByRequester,
    ByWorker,
    Snapshots,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub(crate) owner: AccountId,
    pub(crate) params: Params,
    pub(crate) next_job_id: u64,
    pub(crate) jobs: LookupMap<u64, Job>,
    pub(crate) verifiers: IterableMap<AccountId, Verifier>,
    pub(crate) claimable: LookupMap<AccountId, u128>,
    pub(crate) treasury: u128,
    pub(crate) agent_stats: LookupMap<AccountId, AgentStats>,
    pub(crate) by_requester: LookupMap<AccountId, Vec<u64>>,
    pub(crate) by_worker: LookupMap<AccountId, Vec<u64>>,
    pub(crate) snapshot_poster: Option<AccountId>,
    pub(crate) snapshots: Vector<SnapshotRoot>,
    pub(crate) totals: Totals,
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, params: Option<Params>) -> Self {
        let params = params.unwrap_or_default();
        require!(params.is_valid(), E15);
        Self {
            owner: owner_id,
            params,
            next_job_id: 1,
            jobs: LookupMap::new(Key::Jobs),
            verifiers: IterableMap::new(Key::Verifiers),
            claimable: LookupMap::new(Key::Claimable),
            treasury: 0,
            agent_stats: LookupMap::new(Key::AgentStats),
            by_requester: LookupMap::new(Key::ByRequester),
            by_worker: LookupMap::new(Key::ByWorker),
            snapshot_poster: None,
            snapshots: Vector::new(Key::Snapshots),
            totals: Totals::default(),
        }
    }
}

// ---------- internal helpers ----------
impl Contract {
    pub(crate) fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, E01);
    }

    pub(crate) fn load_job(&self, id: u64) -> Job {
        self.jobs.get(&id).cloned().unwrap_or_else(|| env::panic_str(E22))
    }

    pub(crate) fn credit(&mut self, account: &AccountId, amount: u128) {
        if amount == 0 {
            return;
        }
        let cur = self.claimable.get(account).copied().unwrap_or(0);
        let next = cur.checked_add(amount).unwrap_or_else(|| env::panic_str(E15));
        self.claimable.insert(account.clone(), next);
    }

    pub(crate) fn stats_mut(&mut self, account: &AccountId) -> &mut AgentStats {
        if !self.agent_stats.contains_key(account) {
            self.agent_stats.insert(account.clone(), AgentStats::default());
        }
        self.agent_stats.get_mut(account).unwrap()
    }
}

pub(crate) fn add_u128(a: U128, b: u128) -> U128 {
    U128(a.0.checked_add(b).unwrap_or_else(|| env::panic_str(E15)))
}

pub(crate) fn check_len(s: &str, max: usize) {
    require!(s.len() <= max, E18);
}

pub(crate) fn check_hash(s: &str) {
    require!(is_hex64(s), E17);
}
