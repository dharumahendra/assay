#!/usr/bin/env bash
# T0.6: create the project's testnet sub-accounts under ROOT (keys saved to the legacy keychain).
# Run inside juri-near-build with ~/.near-credentials mounted at /root/.near-credentials.
set -uo pipefail
ROOT=${1:?root account}
create() {
  near account create-account fund-myself "$1.$ROOT" "$2" autogenerate-new-keypair save-to-legacy-keychain \
    sign-as "$ROOT" network-config testnet sign-with-legacy-keychain send 2>&1 \
    | grep -Eio 'successfully created|already exists|error.*' | head -1 | sed "s/^/$1.$ROOT: /"
}
create juri '1 NEAR'
create keeper '1 NEAR'
create demo-requester '0.5 NEAR'
create demo-worker-honest '0.5 NEAR'
create demo-worker-injector '0.5 NEAR'
near account view-account-summary "$ROOT" network-config testnet now 2>&1 | grep -i 'balance' | head -2
