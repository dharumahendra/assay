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

## 2026-11-13 — P1 data layer selesai, G1 lulus
- Selesai: T1.1 schema zod (Agent, Reputation, Job, Bid, EscrowTransfer, decoder intents), T1.2 Drizzle + 3 migrasi (`services/workers/drizzle`), T1.3 `sync:market` (agents + reputation + platform stats, 1 req/s, backoff, idempoten), T1.4 `index:escrow` (FastNEAR, hanya tx sukses, resume token, klasifikasi `kind`), T1.5 snapshot export/import + sha256, T1.6 metrik M1–M6 + `sources_json`, T1.7 cek manual (3 tx vs archival RPC, 3 agent vs API live: cocok semua). Test: 24/24 workers, 11/11 shared.
- Temuan: escrow on-chain praktis mati sejak Juni (sukses terakhir 2026-10-29); 99,5% tx escrow gagal (retry payout $1 karena saldo USDC escrow 0,023). Detail di `docs/phase0-findings.md` §Escrow flows.
- Berikutnya: P2 integrasi (trust engine membaca `escrow_transfers`; kind baru `internal` untuk wallet operator, jangan dihitung sebagai reward/refund).
- Antarmuka berubah: `TRANSFER_KINDS` + `internal`; tabel baru `source_facts`; `market_reputation.computed_at` nullable; M1–M5 didefinisikan ulang (+M6), lihat findings §Metrics.
- Blocker: tidak ada.
- Cara menjalankan: `pnpm sync && pnpm metrics`; offline: `MODE=snapshot pnpm snapshot:import && pnpm metrics`. Skrip analisis di `services/workers/scripts/`.

## 2026-11-13 — P2 trust engine + read API (BE), dikerjakan paralel dengan P1 (G1 belum lulus)
- Selesai: T2.1 identity mapping, T2.2 twin bid + cluster (fixture test), T2.3 Trust Score ts-0.2 + gate, T2.4 shared funder (logika + fetcher NearBlocks, belum diuji live), T2.5 `services/api` (Hono: health, meta, insights, insights records, jobs, agents, patterns, blobs + rate limit + format error), T2.6 freeze #1 di `packages/shared/src/api.ts`, T2.7 `eval/patterns-review.md` (status: belum ada cluster). Test: workers trust 16/16, api 14/14.
- Uji pada salinan DB nyata (689 agent): 141 punya skor, 548 Insufficient data, 0 mapped, 0 bid, 0 pattern. Agent unmapped maksimal skor 70.
- Berikutnya (integrasi setelah P1/G1): jalankan `trust` setelah `sync && metrics`; tambahkan tabel trust (`trust_scores`, `patterns`, `pattern_edges`, `account_funders`) ke `snapshot.ts` TABLES atau jalankan trust engine setelah `snapshot:import`; cek M1–M5 tampil di `/api/insights`.
- Antarmuka berubah: algo `ts-0.1` → `ts-0.2` (docs/05 §5.2 addendum, ya); bentuk response read API dibekukan (docs/05 §8 Freeze #1, ya). File P1 yang disentuh: hanya baris export di `packages/shared/src/index.ts` dan script `trust` di `services/workers/package.json`.
- Blocker: pemetaan agent → akun NEAR (V2) dan bid privat (V1) membuat Trust Score bergantung pada data market, bukan settlement on-chain; perlu keputusan owner (lihat ringkasan sesi).
- Cara menjalankan: `pnpm --filter @juri/workers trust` lalu `pnpm --filter @juri/api start` → `http://localhost:8787/api/health`
