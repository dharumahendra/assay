#!/usr/bin/env bash
# Follow-up checks for testnet-spike.sh: state recorded, and non-owner is rejected with E01.
ROOT=${1:?root account}; C=spike.$ROOT
near contract call-function as-read-only "$C" get_created json-args '{}' network-config testnet now 2>&1 | grep -v '^\s*$' | head -6
echo "--- non-owner create_verifier:"
near contract call-function as-transaction "$C" create_verifier \
  json-args '{"name":"v2","public_key":"ed25519:D2eeugwLzsEVBCkwq3iN9YxA9KdKWeCrDu6VBxP2xKzo"}' \
  prepaid-gas '100 Tgas' attached-deposit '0.1 NEAR' sign-as "$C" network-config testnet \
  sign-with-legacy-keychain send 2>&1 | grep -Eio 'E01: NotOwner|Smart contract panicked[^"]*' | head -2
