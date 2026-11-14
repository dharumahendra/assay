//! Integration tests on a local NEAR sandbox (04 §11 "Integration test (near-workspaces)"):
//!   1. Deploy, register_verifier ×4 → sub-accounts exist, their only key is an FCAK for
//!      commit_vote / reveal_vote / withdraw on the contract.
//!   2. Full lifecycle: create → submit → start → 3 commit → 3 reveal → finalize → withdraw
//!      (worker and verifier payout account).
//!   3. A verifier's FCAK cannot call create_job or withdraw_treasury (rejected by the runtime).
//!
//! Deploys contracts/juri/res/juri.wasm (gitignored): build it first with
//! `cargo near build non-reproducible-wasm` in contracts/juri. CI does this before the tests.

use near_workspaces::network::Sandbox;
use near_workspaces::types::{KeyType, NearToken, SecretKey};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const WASM: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../juri/res/juri.wasm");
const MUST: u8 = 0;
const SHOULD: u8 = 1;
const PASS: u8 = 1;

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
fn sha(s: &str) -> String {
    hex(&Sha256::digest(s.as_bytes()))
}
/// 04 §5: hex(sha256("{job_id}|{verifier}|{verdicts_csv}|{inj}|{evidence_hash}|{salt}")).
fn commitment(job_id: u64, verifier: &str, verdicts: &[u8], inj: bool, evidence: &str, salt: &str) -> String {
    let csv = verdicts.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(",");
    sha(&format!("{job_id}|{verifier}|{csv}|{}|{evidence}|{salt}", if inj { 1 } else { 0 }))
}
fn near(n: &str) -> String {
    // decimal NEAR → yocto string, e.g. "0.1" → "100000000000000000000000"
    let (w, f) = n.split_once('.').unwrap_or((n, ""));
    format!("{}{:0<24}", w, f).trim_start_matches('0').to_string()
}

struct Env {
    worker: Worker<Sandbox>,
    contract: Contract,
    owner: Account,
    /// (verifier account signed with its FCAK, payout account)
    verifiers: Vec<(Account, Account)>,
}

async fn setup() -> anyhow::Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let wasm = std::fs::read(WASM).map_err(|e| anyhow::anyhow!("{WASM}: {e}. Build it first: cd contracts/juri && cargo near build non-reproducible-wasm"))?;
    let contract = worker.dev_deploy(&wasm).await?;
    let root = worker.root_account()?;
    let owner = root.create_subaccount("owner").initial_balance(NearToken::from_near(30)).transact().await?.into_result()?;

    let params = json!({
        "fee_bps": 300, "jury_share_bps": 8000, "jury_size": 3,
        "commit_secs": 180, "reveal_secs": 180,
        "min_stake": near("0.1"), "verifier_seed_balance": near("0.2"), "min_amount": near("0.1"),
        "max_criteria": 13, "max_restarts": 1
    });
    contract.call("new").args_json(json!({ "owner_id": owner.id(), "params": params })).transact().await?.into_result()?;

    let mut verifiers = Vec::new();
    for i in 1..=4 {
        let sk = SecretKey::from_random(KeyType::ED25519);
        let payout = root.create_subaccount(&format!("payout{i}")).initial_balance(NearToken::from_near(1)).transact().await?.into_result()?;
        let r = owner
            .call(contract.id(), "register_verifier")
            .args_json(json!({ "name": format!("v{i}"), "public_key": sk.public_key().to_string(), "payout_account": payout.id(), "model_label": format!("test-model-{i}") }))
            .deposit(NearToken::from_millinear(300))
            .max_gas()
            .transact()
            .await?;
        assert!(r.is_success(), "register_verifier v{i}: {r:?}");
        assert_eq!(r.json::<bool>()?, true, "on_verifier_created returned false for v{i}");
        let id = format!("v{i}.{}", contract.id()).parse()?;
        verifiers.push((Account::from_secret_key(id, sk, &worker), payout));
    }
    Ok(Env { worker, contract, owner, verifiers })
}

async fn job(c: &Contract, id: u64) -> anyhow::Result<Value> {
    Ok(c.view("get_job").args_json(json!({ "job_id": id })).await?.json::<Value>()?)
}
async fn claimable(c: &Contract, who: &str) -> anyhow::Result<u128> {
    let s: String = c.view("get_claimable").args_json(json!({ "account_id": who })).await?.json()?;
    Ok(s.parse()?)
}

#[tokio::test]
async fn verifiers_get_function_call_keys_only() -> anyhow::Result<()> {
    let env = setup().await?;
    let vs: Vec<Value> = env.contract.view("get_verifiers").await?.json()?;
    assert_eq!(vs.len(), 4);
    for (v, payout) in &env.verifiers {
        let keys = env.worker.view_access_keys(v.id()).await?;
        assert_eq!(keys.len(), 1, "{} should have exactly one key", v.id());
        let perm = format!("{:?}", keys[0].access_key.permission);
        assert!(!perm.contains("FullAccess"), "{}: {perm}", v.id());
        for m in ["commit_vote", "reveal_vote", "withdraw"] {
            assert!(perm.contains(m), "{} key lacks {m}: {perm}", v.id());
        }
        assert!(perm.contains(env.contract.id().as_str()), "{} key not scoped to the contract: {perm}", v.id());
        let info: Value = env.contract.view("get_verifier").args_json(json!({ "account_id": v.id() })).await?.json()?;
        assert_eq!(info["payout_account"], json!(payout.id()));
        assert_eq!(info["active"], json!(true));
    }
    let _ = &env.owner;
    Ok(())
}

#[tokio::test]
async fn full_lifecycle_released_and_withdrawn() -> anyhow::Result<()> {
    let env = setup().await?;
    let c = &env.contract;
    let root = env.worker.root_account()?;
    let requester = root.create_subaccount("requester").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?;
    let worker_acc = root.create_subaccount("worker").initial_balance(NearToken::from_near(2)).transact().await?.into_result()?;

    // create
    let kinds = vec![MUST, MUST, SHOULD];
    let r = requester
        .call(c.id(), "create_job")
        .args_json(json!({ "worker": worker_acc.id(), "criteria_hash": sha("criteria"), "criteria_uri": "https://example.test/c", "criteria_kinds": kinds, "submit_deadline_secs": 3600 }))
        .deposit(NearToken::from_millinear(1010))
        .max_gas()
        .transact()
        .await?;
    assert!(r.is_success(), "create_job: {r:?}");
    let id: u64 = r.json()?;
    let j = job(c, id).await?;
    assert_eq!(j["status"], "Funded");
    let amount: u128 = j["amount"].as_str().unwrap().parse()?;
    assert!(amount >= NearToken::from_millinear(900).as_yoctonear(), "amount after storage: {amount}");

    // submit (worker only) → start
    let r = worker_acc
        .call(c.id(), "submit_deliverable")
        .args_json(json!({ "job_id": id, "deliverable_hash": sha("deliverable"), "deliverable_uri": "https://example.test/d" }))
        .transact()
        .await?;
    assert!(r.is_success(), "submit_deliverable: {r:?}");
    requester.call(c.id(), "start_judging").args_json(json!({ "job_id": id })).max_gas().transact().await?.into_result()?;
    let j = job(c, id).await?;
    assert_eq!(j["status"], "Committing");
    let jury: Vec<String> = serde_json::from_value(j["jury"].clone())?;
    assert_eq!(jury.len(), 3);

    // 3 commits, then 3 reveals, each signed with the juror's FCAK
    let jurors: Vec<&(Account, Account)> = env.verifiers.iter().filter(|(v, _)| jury.contains(&v.id().to_string())).collect();
    assert_eq!(jurors.len(), 3);
    let verdicts = vec![PASS, PASS, PASS];
    let plan: Vec<(String, String)> = jurors.iter().enumerate().map(|(i, _)| (sha(&format!("evidence{i}")), sha(&format!("salt{i}")))).collect();
    for ((v, _), (ev, salt)) in jurors.iter().zip(&plan) {
        let cm = commitment(id, v.id().as_str(), &verdicts, false, ev, salt);
        let r = v.call(c.id(), "commit_vote").args_json(json!({ "job_id": id, "commitment": cm })).gas(near_workspaces::types::Gas::from_tgas(30)).transact().await?;
        assert!(r.is_success(), "commit_vote {}: {r:?}", v.id());
    }
    for ((v, _), (ev, salt)) in jurors.iter().zip(&plan) {
        let r = v
            .call(c.id(), "reveal_vote")
            .args_json(json!({ "job_id": id, "verdicts": verdicts, "injection_flag": false, "evidence_hash": ev, "salt": salt, "attestation_hash": null, "model": "test-model" }))
            .gas(near_workspaces::types::Gas::from_tgas(30))
            .transact()
            .await?;
        assert!(r.is_success(), "reveal_vote {}: {r:?}", v.id());
    }

    // finalize (anyone, early because every juror revealed)
    requester.call(c.id(), "finalize").args_json(json!({ "job_id": id })).max_gas().transact().await?.into_result()?;
    let j = job(c, id).await?;
    assert_eq!(j["status"], "Settled");
    assert_eq!(j["outcome"], "Released");
    let s = &j["settlement"];
    let net: u128 = s["net"].as_str().unwrap().parse()?;
    let fee: u128 = s["fee"].as_str().unwrap().parse()?;
    assert_eq!(fee, amount * 300 / 10_000);
    assert_eq!(net, amount - fee);
    assert_eq!(claimable(c, worker_acc.id().as_str()).await?, net);

    // worker withdraws
    let before = worker_acc.view_account().await?.balance;
    worker_acc.call(c.id(), "withdraw").max_gas().transact().await?.into_result()?;
    env.worker.fast_forward(3).await?; // balances are read at final finality, a few blocks behind
    let after = worker_acc.view_account().await?.balance;
    assert!(after.as_yoctonear() > before.as_yoctonear() + net - NearToken::from_millinear(5).as_yoctonear(), "worker balance {before} → {after}, net {net}");
    assert_eq!(claimable(c, worker_acc.id().as_str()).await?, 0);

    // a juror withdraws with its FCAK; the money lands on its payout account
    let (v, payout) = jurors[0];
    let share = claimable(c, v.id().as_str()).await?;
    assert!(share > 0, "juror share should be claimable");
    let before = payout.view_account().await?.balance;
    let r = v.call(c.id(), "withdraw").gas(near_workspaces::types::Gas::from_tgas(30)).transact().await?;
    assert!(r.is_success(), "verifier withdraw: {r:?}");
    env.worker.fast_forward(3).await?;
    let after = payout.view_account().await?.balance;
    assert_eq!(after.as_yoctonear(), before.as_yoctonear() + share, "payout account should receive exactly the share");

    let stats: Value = c.view("get_agent_stats").args_json(json!({ "account_id": worker_acc.id() })).await?.json()?;
    assert_eq!(stats["worker_passed"], 1);
    Ok(())
}

#[tokio::test]
async fn verifier_key_cannot_call_other_methods() -> anyhow::Result<()> {
    let env = setup().await?;
    let (v, _) = &env.verifiers[0];
    let worker_acc = env.worker.dev_create_account().await?;

    // create_job: the key's method list doesn't include it → the runtime refuses the transaction
    let r = v
        .call(env.contract.id(), "create_job")
        .args_json(json!({ "worker": worker_acc.id(), "criteria_hash": sha("c"), "criteria_uri": "u", "criteria_kinds": [MUST], "submit_deadline_secs": 3600 }))
        .gas(near_workspaces::types::Gas::from_tgas(30))
        .transact()
        .await;
    assert!(matches!(&r, Err(_)) || matches!(&r, Ok(o) if o.is_failure()), "create_job with an FCAK should be rejected: {r:?}");

    let r = v
        .call(env.contract.id(), "withdraw_treasury")
        .args_json(json!({ "amount": "1", "to": v.id() }))
        .gas(near_workspaces::types::Gas::from_tgas(30))
        .transact()
        .await;
    assert!(matches!(&r, Err(_)) || matches!(&r, Ok(o) if o.is_failure()), "withdraw_treasury with an FCAK should be rejected: {r:?}");

    // and the key can't attach a deposit even to an allowed method
    let r = v.call(env.contract.id(), "withdraw").deposit(NearToken::from_yoctonear(1)).gas(near_workspaces::types::Gas::from_tgas(30)).transact().await;
    assert!(matches!(&r, Err(_)) || matches!(&r, Ok(o) if o.is_failure()), "a deposit through an FCAK should be rejected: {r:?}");
    Ok(())
}
