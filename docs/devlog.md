# Devlog

## 2026-11-13 — P0 setup & spike (DevOps + BE), paused at G0
- Selesai: struktur monorepo, docs dipindah ke `docs/`, LICENSE MIT, `.env.example`, CI skeleton, `packages/shared` (canonical JSON + sha256 + commitment builder + schema market v2), spike FCAK (`contracts/spike-fcak`), probe V1–V9 → `docs/phase0-findings.md`.
- Berikutnya: keputusan sumber data (lihat findings §Decisions), lalu P1.
- Antarmuka berubah: schema market di `packages/shared/src/schemas/market.ts` mengikuti API v2 (docs/05 §3.1–3.2 belum diperbarui).
- Blocker: market sekarang USD/USDC + jobs/bids butuh token `aat_`; escrow settle via intents.near; ToS §9.2 larang scraping at scale; Rust toolchain; akun testnet.
- Cara menjalankan: `pnpm install && pnpm test`

## 2026-11-13 — P0 selesai, G0 lulus dengan fallback
- Selesai: spike FCAK lulus unit test (3/3) dan di testnet (allow `commit_vote`; deny method lain, transfer, receiver lain). Akun testnet T0.6 dibuat di bawah `juri-assay-jdir.testnet`. Sampel NearBlocks + decode intent + NEAR AI Cloud publik disimpan di `docs/samples/`.
- Berikutnya: P1 (schema DB, indexer intents, agent sync, snapshot, metrics) dengan sumber data on-chain (keputusan 1a).
- Antarmuka berubah: build kontrak lewat Docker `contracts/Dockerfile.build` (host Windows tanpa MSVC). Indexer harus memperhitungkan escrow sebagai relayer (`signer_id` ≠ escrow, token juga `wrap.near`).
- Blocker (aksi owner): `MARKET_API_KEY` (T0.3, hanya V5, ada fallback), `NEARAI_API_KEY` + kredit (T0.5, sementara fallback "Not attested").
- Cara menjalankan:
  - `docker build -t juri-near-build -f contracts/Dockerfile.build contracts`
  - `docker run --rm -v "$PWD/contracts/spike-fcak:/w" -w /w juri-near-build cargo near build non-reproducible-wasm --no-abi`
  - Testnet: mount `~/.near-credentials` ke `/root/.near-credentials`, jalankan `bash testnet-spike.sh juri-assay-jdir.testnet`
