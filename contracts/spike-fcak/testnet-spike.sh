#!/usr/bin/env bash
# V7 spike on testnet: deploy, create a verifier sub-account with an FCAK, prove allow/deny.
# Run inside juri-near-build with host ~/.near-credentials mounted at /root/.near-credentials:
#   docker run --rm -v ~/.near-credentials:/root/.near-credentials -v $PWD/contracts/spike-fcak:/w -w /w \
#     juri-near-build bash testnet-spike.sh <root>.testnet
set -uo pipefail
ROOT=${1:?root account}
C=spike.$ROOT
V=v1.$C
NET="network-config testnet"
step() { echo; echo "=== $* ==="; }

step "1. create contract account $C (3 NEAR)"
near account create-account fund-myself "$C" '3 NEAR' autogenerate-new-keypair save-to-legacy-keychain \
  sign-as "$ROOT" $NET sign-with-legacy-keychain send 2>&1 | grep -Ei 'created|error|exists' | head -3

step "2. deploy + init"
near contract deploy "$C" use-file target/near/spike_fcak.wasm with-init-call new \
  json-args "{\"owner_id\":\"$ROOT\"}" prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  $NET sign-with-legacy-keychain send 2>&1 | grep -Ei 'deployed|error|succeeded|failure' | head -3

step "3. generate verifier keypair"
rm -rf /tmp/k && mkdir -p /tmp/k
near account create-account fund-later use-auto-generation save-to-folder /tmp/k >/dev/null 2>&1
KF=$(ls /tmp/k/*.json | head -1)
PK=$(sed -n 's/.*"public_key": *"\([^"]*\)".*/\1/p' "$KF")
SK=$(sed -n 's/.*"private_key": *"\([^"]*\)".*/\1/p' "$KF")
echo "verifier public key: $PK"

step "4. create_verifier (owner, 0.1 NEAR)"
near contract call-function as-transaction "$C" create_verifier \
  json-args "{\"name\":\"v1\",\"public_key\":\"$PK\"}" prepaid-gas '100 Tgas' attached-deposit '0.1 NEAR' \
  sign-as "$ROOT" $NET sign-with-legacy-keychain send 2>&1 | grep -Ei 'transaction id|returned|true|false|error|fail' | head -5

step "5. non-owner create_verifier must fail (E01)"
near contract call-function as-transaction "$C" create_verifier \
  json-args "{\"name\":\"v2\",\"public_key\":\"$PK\"}" prepaid-gas '100 Tgas' attached-deposit '0.1 NEAR' \
  sign-as "$C" $NET sign-with-legacy-keychain send 2>&1 | grep -Eio 'E01: NotOwner|error.*' | head -2

step "6. access keys on $V (expect one FunctionCall key, receiver $C)"
near account list-keys "$V" $NET now 2>&1 | tail -8

step "7. get_created"
near contract call-function as-read-only "$C" get_created json-args '{}' $NET now 2>&1 | tail -4

SIGN="sign-with-plaintext-private-key $SK"

step "8. ALLOW: FCAK calls commit_vote"
near contract call-function as-transaction "$C" commit_vote json-args '{}' prepaid-gas '30 Tgas' \
  attached-deposit '0 NEAR' sign-as "$V" $NET $SIGN send 2>&1 | grep -Ei 'returned|commit_vote by|error|fail' | head -3

step "9. DENY: FCAK calls owner_only (method not in key list)"
near contract call-function as-transaction "$C" owner_only json-args '{}' prepaid-gas '30 Tgas' \
  attached-deposit '0 NEAR' sign-as "$V" $NET $SIGN send 2>&1 | grep -Ei 'error|fail|method|denied|not allowed' | head -3

step "10. DENY: FCAK tries to transfer NEAR"
near tokens "$V" send-near "$ROOT" '0.01 NEAR' $NET $SIGN send 2>&1 | grep -Ei 'error|fail|not allowed|access' | head -3

step "11. DENY: FCAK calls another contract (wrap.testnet)"
near contract call-function as-transaction wrap.testnet near_deposit json-args '{}' prepaid-gas '30 Tgas' \
  attached-deposit '0 NEAR' sign-as "$V" $NET $SIGN send 2>&1 | grep -Ei 'error|fail|receiver|access' | head -3
