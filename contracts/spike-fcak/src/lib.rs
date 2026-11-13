//! Phase 0 spike (V7). Answers: which near-sdk 5.x calls create a sub-account
//! and attach a Function Call Access Key with a gas allowance, from a contract.
//!
//! Throwaway code: the real implementation lives in contracts/juri (P3).

use near_sdk::{
    env, near, require, AccountId, Allowance, NearToken, PanicOnDefault, Promise, PromiseError,
    PublicKey,
};

/// Methods a verifier key may call (FR-E1).
pub const VERIFIER_METHODS: &str = "commit_vote,reveal_vote,withdraw";
/// Gas allowance per verifier key (04 §4.1: 0.25 NEAR).
pub const KEY_ALLOWANCE: NearToken = NearToken::from_millinear(250);
/// Balance sent to the new sub-account so it can exist.
pub const SEED_BALANCE: NearToken = NearToken::from_millinear(100);

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Spike {
    owner: AccountId,
    created: Vec<AccountId>,
}

#[near]
impl Spike {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self { owner: owner_id, created: Vec::new() }
    }

    /// Creates `{name}.{this contract}` with a single FCAK restricted to this contract.
    #[payable]
    pub fn create_verifier(&mut self, name: String, public_key: PublicKey) -> Promise {
        require!(env::predecessor_account_id() == self.owner, "E01: NotOwner");
        require!(
            !name.is_empty()
                && name.len() <= 16
                && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-'),
            "E15: InvalidParams"
        );
        require!(env::attached_deposit() >= SEED_BALANCE, "E13: InsufficientDeposit");

        let sub: AccountId = format!("{}.{}", name, env::current_account_id())
            .parse()
            .unwrap_or_else(|_| env::panic_str("E15: InvalidParams"));
        let allowance = Allowance::limited(KEY_ALLOWANCE).expect("non-zero allowance");

        Promise::new(sub.clone())
            .create_account()
            .transfer(SEED_BALANCE)
            .add_access_key_allowance(
                public_key,
                allowance,
                env::current_account_id(),
                VERIFIER_METHODS.to_string(),
            )
            .then(Self::ext(env::current_account_id()).on_created(sub))
    }

    #[private]
    pub fn on_created(
        &mut self,
        account_id: AccountId,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_ok() {
            self.created.push(account_id);
            true
        } else {
            false
        }
    }

    pub fn get_created(&self) -> Vec<AccountId> {
        self.created.clone()
    }

    // Stand-ins for the methods the FCAK may call, so the spike can prove allow/deny.
    pub fn commit_vote(&mut self) -> String {
        format!("commit_vote by {}", env::predecessor_account_id())
    }
    pub fn owner_only(&mut self) {
        require!(env::predecessor_account_id() == self.owner, "E01: NotOwner");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(pred: AccountId, deposit: NearToken) {
        let mut b = VMContextBuilder::new();
        b.current_account_id("juri.alice.testnet".parse().unwrap())
            .predecessor_account_id(pred)
            .attached_deposit(deposit);
        testing_env!(b.build());
    }

    fn pk() -> PublicKey {
        "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap()
    }

    #[test]
    fn owner_can_create_verifier() {
        ctx(accounts(0), NearToken::from_near(1));
        let mut c = Spike::new(accounts(0));
        let _ = c.create_verifier("v1".into(), pk());
    }

    #[test]
    #[should_panic(expected = "E01: NotOwner")]
    fn non_owner_rejected() {
        ctx(accounts(1), NearToken::from_near(1));
        let mut c = Spike::new(accounts(0));
        let _ = c.create_verifier("v1".into(), pk());
    }

    #[test]
    #[should_panic(expected = "E15: InvalidParams")]
    fn bad_name_rejected() {
        ctx(accounts(0), NearToken::from_near(1));
        let mut c = Spike::new(accounts(0));
        let _ = c.create_verifier("V1!".into(), pk());
    }
}
