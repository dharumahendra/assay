//! Verifier registry: each verifier is `{name}.{contract}`, created by this contract, whose only
//! key is a Function Call Access Key for commit_vote / reveal_vote / withdraw (FR-E1, D5, 04 §4.1).

use crate::events::emit;
use crate::*;
use near_sdk::serde_json::json;
use near_sdk::{Allowance, Gas, NearToken, Promise, PromiseError, PublicKey};

const CALLBACK_GAS: Gas = Gas::from_tgas(15);

#[near]
impl Contract {
    /// Owner; deposit ≥ min_stake + verifier_seed_balance. Stake = deposit − seed.
    #[payable]
    pub fn register_verifier(
        &mut self,
        name: String,
        public_key: PublicKey,
        payout_account: AccountId,
        model_label: String,
    ) -> Promise {
        self.assert_owner();
        require!(
            !name.is_empty()
                && name.len() <= MAX_NAME_LEN
                && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-'),
            E15
        );
        check_len(&model_label, MAX_MODEL_LEN);
        let account_id: AccountId = format!("{}.{}", name, env::current_account_id())
            .parse()
            .unwrap_or_else(|_| env::panic_str(E15));
        require!(!self.verifiers.contains_key(&account_id), E20);
        let deposit = env::attached_deposit().as_yoctonear();
        let seed = self.params.verifier_seed_balance.0;
        require!(deposit >= self.params.min_stake.0 + seed, E13);

        let allowance = Allowance::limited(VERIFIER_KEY_ALLOWANCE).unwrap_or_else(|| env::panic_str(E15));
        Promise::new(account_id.clone())
            .create_account()
            .transfer(NearToken::from_yoctonear(seed))
            .add_access_key_allowance(public_key, allowance, env::current_account_id(), VERIFIER_METHODS.to_string())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_verifier_created(account_id, payout_account, model_label, U128(deposit - seed), U128(deposit)),
            )
    }

    /// Stores the verifier when the sub-account + key were created; otherwise the whole deposit
    /// (the failed create returns the seed to this contract) becomes claimable by the owner.
    #[private]
    pub fn on_verifier_created(
        &mut self,
        account_id: AccountId,
        payout_account: AccountId,
        model_label: String,
        stake: U128,
        deposit: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_err() || self.verifiers.contains_key(&account_id) {
            let owner = self.owner.clone();
            self.credit(&owner, deposit.0);
            return false;
        }
        self.verifiers.insert(
            account_id.clone(),
            Verifier {
                account_id: account_id.clone(),
                payout_account: payout_account.clone(),
                model_label: model_label.clone(),
                stake,
                active: true,
                votes: 0,
                majority_agreements: 0,
                missed_reveals: 0,
                earned: U128(0),
            },
        );
        emit(
            "verifier_registered",
            json!({ "account_id": account_id, "payout_account": payout_account, "model_label": model_label, "stake": stake }),
        );
        true
    }

    pub fn set_verifier_active(&mut self, account_id: AccountId, active: bool) {
        self.assert_owner();
        let v = self.verifiers.get_mut(&account_id).unwrap_or_else(|| env::panic_str(E23));
        v.active = active;
        emit("verifier_updated", json!({ "account_id": account_id, "active": active }));
    }
}
