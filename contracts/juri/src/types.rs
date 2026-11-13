//! Types, constants and error codes (04 §2, §9).

use near_sdk::json_types::{U128, U64};
use near_sdk::{near, AccountId, NearToken};

// ---------- verdicts and criterion kinds ----------
pub const FAIL: u8 = 0;
pub const PASS: u8 = 1;
pub const UNSURE: u8 = 2;
pub const MUST: u8 = 0;
pub const SHOULD: u8 = 1;

// ---------- limits ----------
pub const MAX_URI_LEN: usize = 512;
pub const MAX_MARKET_JOB_ID_LEN: usize = 64;
pub const MAX_MODEL_LEN: usize = 96;
pub const MAX_NAME_LEN: usize = 16;
pub const MIN_SUBMIT_SECS: u64 = 60;
pub const MAX_SUBMIT_SECS: u64 = 30 * 86_400;
pub const MAX_JURY: usize = 5;
pub const PAGE_MAX: u64 = 50;
pub const NS_PER_SEC: u64 = 1_000_000_000;

/// Methods a verifier key may call (FR-E1, D5).
pub const VERIFIER_METHODS: &str = "commit_vote,reveal_vote,withdraw";
/// Gas allowance on each verifier FCAK (04 §4.1). Spent from the verifier account's own balance.
pub const VERIFIER_KEY_ALLOWANCE: NearToken = NearToken::from_millinear(250);

// ---------- error codes (04 §9; E21–E23 added in P3) ----------
pub const E01: &str = "E01: NotOwner";
pub const E02: &str = "E02: NotRequester";
pub const E03: &str = "E03: NotWorker";
pub const E04: &str = "E04: NotJuror";
pub const E05: &str = "E05: InvalidStatus";
pub const E06: &str = "E06: DeadlinePassed";
pub const E07: &str = "E07: DeadlineNotReached";
pub const E08: &str = "E08: AlreadyCommitted";
pub const E09: &str = "E09: NotCommitted";
pub const E10: &str = "E10: CommitmentMismatch";
pub const E11: &str = "E11: InvalidCriteria";
pub const E12: &str = "E12: InvalidVerdicts";
pub const E13: &str = "E13: InsufficientDeposit";
pub const E14: &str = "E14: NotEnoughVerifiers";
pub const E15: &str = "E15: InvalidParams";
pub const E16: &str = "E16: NothingToWithdraw";
pub const E17: &str = "E17: InvalidHash";
pub const E18: &str = "E18: StringTooLong";
pub const E19: &str = "E19: SelfDealing";
pub const E20: &str = "E20: VerifierExists";
pub const E21: &str = "E21: AlreadyRevealed";
pub const E22: &str = "E22: JobNotFound";
pub const E23: &str = "E23: VerifierNotFound";

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum JobStatus {
    Funded,
    Submitted,
    Committing,
    Stalled,
    Settled,
    Cancelled,
    Expired,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Outcome {
    Released,
    Refunded,
    Split,
    RefundedNoFee,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PayoutMode {
    Binary,
    /// SHOULD (FR-D9): all MUST pass → worker gets base_pct + (100 − base_pct) × SHOULD pass ratio.
    Partial { base_pct: u8 },
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Commit {
    pub verifier: AccountId,
    pub commitment: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Reveal {
    pub verifier: AccountId,
    pub verdicts: Vec<u8>,
    pub injection_flag: bool,
    pub evidence_hash: String,
    pub attestation_hash: Option<String>,
    pub model: String,
}

/// What `finalize` paid out, for the Verdict panel (07 §2.9).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Settlement {
    pub fee: U128,
    pub jury_pool: U128,
    pub net: U128,
    pub to_worker: U128,
    pub to_requester: U128,
    pub to_treasury: U128,
    pub shares: Vec<Share>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Share {
    pub verifier: AccountId,
    pub agree: u32,
    pub amount: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Job {
    pub id: u64,
    pub requester: AccountId,
    pub worker: AccountId,
    /// Escrow after storage cost (yoctoNEAR).
    pub amount: U128,
    pub criteria_hash: String,
    pub criteria_uri: String,
    pub criteria_kinds: Vec<u8>,
    pub market_job_id: Option<String>,
    pub payout_mode: PayoutMode,
    /// Timestamps are nanoseconds, as strings in JSON (U64) so JS does not lose precision.
    pub created_at: U64,
    pub submit_deadline: U64,
    pub deliverable_hash: Option<String>,
    pub deliverable_uri: Option<String>,
    pub submitted_at: Option<U64>,
    pub jury: Vec<AccountId>,
    pub commit_deadline: U64,
    pub reveal_deadline: U64,
    pub restarts: u8,
    pub commits: Vec<Commit>,
    pub reveals: Vec<Reveal>,
    pub status: JobStatus,
    pub outcome: Option<Outcome>,
    pub criteria_result: Vec<u8>,
    pub injection_flagged: bool,
    pub settlement: Option<Settlement>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Verifier {
    pub account_id: AccountId,
    pub payout_account: AccountId,
    pub model_label: String,
    pub stake: U128,
    pub active: bool,
    pub votes: u32,
    pub majority_agreements: u32,
    pub missed_reveals: u32,
    pub earned: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AgentStats {
    pub worker_settled: u32,
    pub worker_passed: u32,
    pub worker_failed: u32,
    pub worker_earned: U128,
    pub requester_jobs: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Params {
    pub fee_bps: u16,
    pub jury_share_bps: u16,
    pub jury_size: u8,
    pub commit_secs: u32,
    pub reveal_secs: u32,
    pub min_stake: U128,
    pub verifier_seed_balance: U128,
    pub min_amount: U128,
    pub max_criteria: u8,
    pub max_restarts: u8,
}

impl Default for Params {
    fn default() -> Self {
        Self {
            fee_bps: 300,
            jury_share_bps: 8000,
            jury_size: 3,
            commit_secs: 180,
            reveal_secs: 180,
            min_stake: U128(NearToken::from_near(1).as_yoctonear()),
            verifier_seed_balance: U128(NearToken::from_millinear(500).as_yoctonear()),
            min_amount: U128(NearToken::from_millinear(100).as_yoctonear()),
            max_criteria: 13,
            max_restarts: 1,
        }
    }
}

impl Params {
    /// Safe bounds (FR-G2).
    pub fn is_valid(&self) -> bool {
        let win = |s: u32| (60..=86_400).contains(&s);
        self.fee_bps <= 1000
            && self.jury_share_bps <= 10_000
            && (self.jury_size == 3 || self.jury_size == 5)
            && win(self.commit_secs)
            && win(self.reveal_secs)
            && (1..=13).contains(&self.max_criteria)
            && self.max_restarts <= 3
            && self.min_amount.0 > 0
            && self.verifier_seed_balance.0 >= NearToken::from_millinear(10).as_yoctonear()
    }
}

/// SHOULD (FR-F2): Merkle root of a Trust Score snapshot.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SnapshotRoot {
    pub root: String,
    pub computed_at: U64,
    pub algo_version: String,
    pub source_hash: String,
    pub posted_at: U64,
}

/// Running totals for the Treasury page (FR-G4).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Totals {
    pub total_fee: U128,
    pub total_jury_pool: U128,
    pub settled_jobs: u32,
}

// ---------- helpers ----------

pub fn is_hex64(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

pub fn to_hex(bytes: &[u8]) -> String {
    const H: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(H[(b >> 4) as usize] as char);
        s.push(H[(b & 0xf) as usize] as char);
    }
    s
}

/// 04 §5: hex(sha256("{job_id}|{verifier_id}|{verdicts_csv}|{inj}|{evidence_hash}|{salt_hex}")).
pub fn commitment_preimage(job_id: u64, verifier: &str, verdicts: &[u8], inj: bool, evidence_hash: &str, salt_hex: &str) -> String {
    let csv = verdicts.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(",");
    format!("{}|{}|{}|{}|{}|{}", job_id, verifier, csv, if inj { 1 } else { 0 }, evidence_hash, salt_hex)
}

pub fn commitment_hex(job_id: u64, verifier: &str, verdicts: &[u8], inj: bool, evidence_hash: &str, salt_hex: &str) -> String {
    to_hex(&near_sdk::env::sha256(commitment_preimage(job_id, verifier, verdicts, inj, evidence_hash, salt_hex).as_bytes()))
}
