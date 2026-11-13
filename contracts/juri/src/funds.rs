//! Pull payments, treasury, params and snapshot roots (FR-D10, FR-E12, FR-G2, FR-G3, FR-F2).
//! State is changed before every transfer; callbacks restore it if the transfer fails (D10).

use crate::events::emit;
use crate::*;
use near_sdk::json_types::U64;
use near_sdk::serde_json::json;
use near_sdk::{Gas, NearToken, Promise, PromiseError};

const CALLBACK_GAS: Gas = Gas::from_tgas(10);

#[near]
impl Contract {
    /// Sends the caller's whole claimable balance; verifiers are paid to their payout account.
    pub fn withdraw(&mut self) -> Promise {
        let caller = env::predecessor_account_id();
        let amount = self.claimable.get(&caller).copied().unwrap_or(0);
        require!(amount > 0, E16);
        self.claimable.remove(&caller);
        let to = self.verifiers.get(&caller).map(|v| v.payout_account.clone()).unwrap_or_else(|| caller.clone());
        Promise::new(to.clone()).transfer(NearToken::from_yoctonear(amount)).then(
            Self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS).on_withdraw(caller, to, U128(amount)),
        )
    }

    #[private]
    pub fn on_withdraw(
        &mut self,
        account_id: AccountId,
        to: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_ok() {
            emit("withdrawn", json!({ "account_id": account_id, "to": to, "amount": amount }));
            true
        } else {
            self.credit(&account_id, amount.0);
            false
        }
    }

    pub fn withdraw_treasury(&mut self, amount: U128, to: AccountId) -> Promise {
        self.assert_owner();
        require!(amount.0 > 0 && amount.0 <= self.treasury, E16);
        self.treasury -= amount.0;
        Promise::new(to.clone()).transfer(NearToken::from_yoctonear(amount.0)).then(
            Self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS).on_treasury_withdrawn(to, amount),
        )
    }

    #[private]
    pub fn on_treasury_withdrawn(
        &mut self,
        to: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_ok() {
            emit("treasury_withdrawn", json!({ "to": to, "amount": amount }));
            true
        } else {
            self.treasury += amount.0;
            false
        }
    }

    /// Owner; running jobs keep the deadlines they already stored.
    pub fn set_params(&mut self, params: Params) {
        self.assert_owner();
        require!(params.is_valid(), E15);
        self.params = params.clone();
        emit("params_updated", json!(params));
    }

    pub fn set_snapshot_poster(&mut self, account_id: Option<AccountId>) {
        self.assert_owner();
        self.snapshot_poster = account_id;
    }

    /// SHOULD (FR-F2): Merkle root of a Trust Score snapshot.
    pub fn post_snapshot(&mut self, root: String, computed_at: U64, algo_version: String, source_hash: String) {
        require!(Some(env::predecessor_account_id()) == self.snapshot_poster, E01);
        check_hash(&root);
        check_hash(&source_hash);
        check_len(&algo_version, 32);
        let s = SnapshotRoot { root, computed_at, algo_version, source_hash, posted_at: U64(env::block_timestamp()) };
        self.snapshots.push(s.clone());
        emit("snapshot_posted", json!(s));
    }
}
