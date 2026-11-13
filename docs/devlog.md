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

## 2026-11-13 — Integrasi P0/P1 ↔ P2
- Selesai:
  - `services/workers/src/pipeline.ts`: `derive()` = metrics + trust engine; `loadSnapshot()` = import + derive. `sync` sekarang otomatis menjalankan derive (05 §1: trust setelah setiap sync).
  - CLI baru: `trust`, `derive`, `load:snapshot` (root: `pnpm trust | derive | load:snapshot | api`).
  - API (`services/api/src/index.ts`): pada `MODE=snapshot` dengan DB kosong, otomatis memuat snapshot terbaru lalu derive, jadi clone baru langsung jalan tanpa jaringan/key.
  - `.env` repo dimuat otomatis (`src/load-env.ts`, tanpa override env shell) di CLI, trust-engine, dan API, sehingga config P0 (akun testnet, `JURI_CONTRACT_ID`, key) sampai ke worker + API.
  - Source drawer: `by_token` (M2) jadi satu record per token (dengan simbol + desimal); M6 memakai bentuk `endpoint` + record tx sukses terakhir yang bisa diklik.
  - Test integrasi `services/api/src/integration.test.ts`: snapshot nyata → derive → read API (M1–M6, records, agents, trust; leg `internal` tidak pernah dihitung sebagai bayaran).
- Uji e2e: API di port 8799 dengan DB kosong → snapshot dimuat otomatis (691 agent, 7 baris metrik), `/api/health` ok, `/api/insights` M1–M6 nilai nyata, `/api/agents` skor ts-0.2 (maks 70, semua unmapped).
- Antarmuka berubah: M6 `sources_json` = `{endpoint, fetched_at, last_success_tx}`; perintah `metrics` tidak lagi menjalankan trust (pakai `derive`).
- Blocker: 0 agent ter-mapping ke akun NEAR (market tidak memuat akun, leg escrow tanpa memo job) → Trust Score tanpa komponen on-chain. Perlu keputusan owner. `.env` belum ada: salin dari `.env.example` agar `contract_id` muncul di `/api/meta`.
- Cara menjalankan: `pnpm load:snapshot && pnpm api` (offline) atau `pnpm sync && pnpm api` (live).

## 2026-11-13 — P3 smart contract selesai, G3 lulus
- Selesai: T3.1–T3.7 kontrak `contracts/juri` (near-sdk 5.30), T3.8 unit test 60/60 (51 kontrak + 9 tally; integration near-workspaces belum), T3.9 deploy `juri.juri-assay-jdir.testnet` + v1–v4 (masing-masing hanya 1 FCAK) + FCAK keeper, T3.10 ABI `contracts/juri/abi/juri.abi.json` + `packages/shared/src/contract.ts` + vektor commitment bersama TS/Rust (**freeze #2**, shared test 21/21), T3.11 `scripts/demo-lifecycle.ts`.
- Bukti G3 (testnet):
  - Deploy tx `BXFGu7qUTar9ktM4gCNAC8MBwMhtAmEooZiuPtnGhpAj`, init tx `BRs5J7bUaJj4nMCyHSQp8ah6J5AF2VbVpJ2tCddQeykv`. wasm 296.895 byte, sha256 `344ea38c3142a92cc002d7de20b6edcc43794c512f23115350e4cfd7d8da4da9`.
  - Job #1 honest → Settled/Released, finalize tx `G8Gr5Th7GHxvAaNB2rtf3ZHaRhgXX11HLtRSatZ3h6bT`; withdraw worker + verifier sukses.
  - Job #2 injector → Settled/Refunded, `injection_flagged=true`, finalize tx `kTkZfuSgp3Yw7u7rnRtwpiCtt2phEs9n8xPkAqWd8pC`; withdraw requester tx `FQ6WHhPhJQL9m9AdVwjzT5uaR4VxnC2kq3SwJnSYAEyK`.
  - FCAK verifier ditolak runtime (2 run): `set_params`/`create_job` ("method name … isn't allowed by the access key"), transfer NEAR (butuh full access), receiver lain `wrap.testnet` ("Wrong AccessKey").
- Temuan: seed verifier 0,1 NEAR tidak cukup untuk prepaid 100 Tgas → verifier memakai 30 Tgas. `rpc.testnet.near.org` -429 → default RPC FastNEAR (`.env.example` diperbarui).
- Antarmuka berubah: lihat docs/04 §13 (U64 timestamp, Commit/Settlement, E21–E23, `new(params?)`, id mulai 1, view baru, param demo). Package baru `scripts/` (`@juri/scripts`, near-api-js 5.1.1). `.gitignore` + `contracts/*/res/`.
- Blocker: saldo testnet tipis (root ≈0,28 NEAR, demo-requester ≈0,2 NEAR) — top up via faucet sebelum demo P6.
- Cara menjalankan:
  - Build: `docker run --rm -v "$PWD:/repo" -v juri-cargo-registry:/usr/local/cargo/registry -v juri-juri-target:/repo/contracts/juri/target -w /repo/contracts/juri juri-near-build cargo near build non-reproducible-wasm` (output `res/juri.wasm`, ABI di `abi/`)
  - Test: `... juri-near-build cargo test` (mount sama)
  - Testnet: `pnpm --filter @juri/scripts deploy && pnpm --filter @juri/scripts register-verifiers && pnpm --filter @juri/scripts demo:lifecycle -- --scenario honest|injector`

## 2026-11-13 — P5 frontend read-only (FE), G5 lulus dengan catatan
- Selesai: `apps/web` (Next.js 15.5 App Router + Tailwind v4). Halaman `/`, `/insights` (+ Source drawer per metrik, FR-A5), `/jobs`, `/jobs/[id]` (Generate/Regenerate/Edit/Copy criteria, tabel bid dengan sort + sembunyikan pattern), `/agents`, `/agents/[id]` (rincian D/H/I/P + input mentah + sumbernya), `/patterns/[id]` (graf SVG + bukti), `/methodology` (anchor 07 §2.12). Bonus read-only langsung dari kontrak testnet: `/protected` (job #1 Released, #2 Refunded + injeksi) dan `/jury` (verifier, treasury, parameter). Loading/empty/error state + Retry di semua halaman. Mode gelap/terang, cek lebar 390px.
- Desain: setiap angka = barang bukti dengan tanda kuning (marker id metrik) yang membuka drawer record; tipografi Archivo lebar untuk judul; satu warna aksi teal. Badge selalu ikon + teks (NFR-A11Y-1).
- Antarmuka: FE memakai freeze #1 (`api.ts`) dan freeze #3 (`CriteriaDocSchema` dari P4) di server; komponen client hanya `import type` dari `@juri/shared` (barrel memuat `node:crypto`). Browser memanggil `/api/*` lewat rewrite Next ke `API_URL`.
- Belum / menyimpang: scaffold manual (create-near-app diblokir izin sesi) — wallet di P6. `/jobs` kosong karena bid/job privat sejak market API v2 (dijelaskan di empty state), jadi `/jobs/[id]` dan `/patterns/[id]` belum diuji dengan data. Grafik insights belum (API tidak punya data seri). Compile criteria saat ini 503 `no_llm` (ditampilkan sebagai pesan + Retry).
- Cara menjalankan: `pnpm api` (MODE=snapshot) lalu `pnpm --filter @juri/web build && pnpm --filter @juri/web start` → http://localhost:3000 (env opsional: `API_URL`, `JURI_CONTRACT_ID`, `NEAR_RPC_URL`).

## 2026-11-13 — P4 Spec Compiler + jury runner (BE/AI), G4 belum lulus (butuh kunci LLM)
- Selesai:
  - T4.1 `packages/jury` (`@juri/jury`): provider `nearai` / `openai_compat` (fetch, retry 2× + backoff, fallback tanpa `response_format`), `recorded` (cek sha256 respons + hash prompt), `RecordingProvider`, plus juri offline `rules:v1` (tanpa LLM, tidak attested, kriteria LLM → UNSURE).
  - T4.2 compiler (prompt 05 §6.3, temp 0,2, 1500 token, 1× retry dengan error lalu 422) + `POST /api/criteria/compile` (5/menit; 503 `no_llm` bila tanpa kunci). Schema `CriteriaDoc` v1 + `Evidence` = **freeze #3** di `packages/shared/src/criteria.ts`.
  - T4.3 aturan deterministik (min/max_words, contains_sections, regex, contains_links, url_reachable, format_is) + SSRF guard (skema/port, IP privat/metadata, allowlist, redirect dicek ulang, batas ukuran).
  - T4.4 pre-scan injection (instruksi ke juri, zero-width, HTML tersembunyi, komentar HTML berperintah, base64/hex/Morse yang ter-decode jadi teks).
  - T4.5 judge (prompt 05 §7.3, delimiter nonce) + override deterministik + output invalid → UNSURE + hash mismatch → semua FAIL.
  - T4.6 runner `services/workers/src/jury-runner.ts` (`pnpm jury`): start_judging → judge paralel → blob evidence → commit → reveal → finalize; idempoten via `runner_state` (kunci `job#restart`) + status on-chain; salt disimpan sebelum commit.
  - T4.7 (sebagian) attestation: nonce 05 §7.5, simpan report sebagai blob, verifikasi signature ecdsa (personal_sign) / ed25519. Endpoint NEAR AI belum pernah dipanggil live.
  - T4.8 (sebagian) eval set 24 kasus (`eval/`, label kita sendiri) + harness `pnpm eval --rules|--recorded|--live`. Baseline tanpa model: `eval/report-rules-baseline.md` (akurasi outcome 67%, injection false-PASS 0%, deteksi injection 100%, 0 false flag pada V1–V4; semua miss = kriteria LLM MUST yang UNSURE). `eval/report.md` (LLM) belum ada.
- Bukti testnet (runner otomatis, juri `rules:v1`, kriteria deterministik + C0):
  - Job #4 honest → Settled/Released `1,1,1,1`: start `BeCqt6KcNmdMBu4BDnMyeCwFNRZNM9465Chk7uiP27Tq`, finalize `9mT89AffpJUEYEFfePAVLs3d9J8MKEJNgxmErBJSCqYQ`.
  - Job #3 → Settled/Refunded `1,0,1,1`: deliverable 77 kata < aturan 80 (kesalahan fixture kita; aturan bekerja benar). Finalize `DqTWm1xm7PSgRQAw8jDT18uwhhqo3KLh8xrrA3VFbKVC`.
- Test: jury 21/21, workers 30/30, api 24/24.
- Antarmuka berubah: blob store pindah ke `services/workers/src/blobs.ts` (API me-re-export); freeze #3 `criteria.ts`; deposit `create_job` harus > storage + `min_amount` (0,1 NEAR) → pakai 0,15.
- Blocker (aksi owner): `NEARAI_API_KEY` + kredit atau `FALLBACK_LLM_*` untuk G4 (3 model), `pnpm eval --live`, `eval/report.md`, attestation live, dan compile endpoint.
- Cara menjalankan: `pnpm jury:demo [-- --scenario injector]` lalu `pnpm jury`; `pnpm eval`; `pnpm --filter @juri/workers withdraw <akun>`.