# 02 — Functional & Non-Functional Requirements

Format: setiap requirement punya ID, prioritas (MUST/SHOULD/COULD), dan acceptance criteria (AC) yang bisa dites. Lapisan yang mengerjakan ditandai: **SC** (smart contract), **BE** (backend/worker), **AI** (LLM), **FE** (frontend).

---

## A. Data & Market Insight

| ID | Requirement | Prio | Lapisan | Acceptance criteria |
|---|---|---|---|---|
| FR-A1 | Sinkronisasi job, bid, dan agent dari API market.near.ai ke database lokal | MUST | BE | Perintah `sync:market` menyimpan job berstatus open/in_progress/completed/closed/disputed beserta bid-nya; idempoten (dijalankan 2× tidak menggandakan baris); `sync_state` mencatat waktu terakhir |
| FR-A2 | Mengindeks transfer token `wrap.near` masuk/keluar `escrow.ai.near` dari NearBlocks v3 | MUST | BE | Semua transfer tersimpan dengan `tx_hash`, `block_timestamp`, `from`, `to`, `amount`, dan `kind` ∈ {deposit, reward, refund, fee, unknown}; pagination cursor dilanjutkan dari posisi terakhir |
| FR-A3 | Menghitung metrik masalah M1–M5 | MUST | BE | M1 completion rate, M2 refund ratio on-chain, M3 median bid per job, M4 persentase bid kembar, M5 jumlah job disputed; tiap metrik punya `computed_at`, `source`, dan daftar record penyusunnya |
| FR-A4 | Ekspor dan impor snapshot data nyata | MUST | BE | `snapshot:export` membuat `data/snapshots/<timestamp>.json` + sha256; `MODE=snapshot` menjalankan seluruh aplikasi tanpa API key memakai file tersebut |
| FR-A5 | Setiap angka di UI bisa ditelusuri ke sumbernya | MUST | FE/BE | Klik angka → drawer berisi record penyusun dengan link ke halaman job market atau tx NearBlocks |
| FR-A6 | Label mode data | MUST | FE | Badge LIVE / SNAPSHOT (dengan tanggal) / RECORDED-JURY selalu terlihat di navbar |

## B. Trust Score & Linked Bidding Pattern

| ID | Requirement | Prio | Lapisan | Acceptance criteria |
|---|---|---|---|---|
| FR-B1 | Pemetaan agent (handle market) ↔ NEAR account | MUST | BE | Tiap agent punya `near_account` beserta `mapping_method` ∈ {api, reward_tx, unknown}; agent tanpa pemetaan tetap tampil dengan label "Unmapped" |
| FR-B2 | Trust Score 0–100 dengan rincian komponen | MUST | BE | Skor = fungsi deterministik dari komponen D, P, H, I (lihat 05 §5); API mengembalikan nilai tiap komponen dan input mentahnya; versi algoritma tercatat |
| FR-B3 | Status "Insufficient data" | MUST | BE/FE | Agent dengan <3 bid dan 0 settlement tidak diberi angka; UI menampilkan "Insufficient data", bukan skor rendah |
| FR-B4 | Deteksi co-bidding (bid kembar) | MUST | BE | Pasangan agent ditandai bila ≥3 job bersama dan ≥60% berupa bid kembar (selisih jumlah ≤1%, `eta_seconds` sama, waktu bid ≤10 menit); cluster = connected component |
| FR-B5 | Deteksi shared funder | SHOULD | BE | Pendana pertama tiap NEAR account dicari; agent dengan pendana sama (di luar daftar exchange/faucet) diberi edge `shared_funder` |
| FR-B6 | Bukti untuk setiap flag | MUST | FE/BE | Halaman pattern menampilkan tabel job, jumlah, ETA, timestamp yang menjadi dasar flag |
| FR-B7 | Penjelasan bahasa alami untuk Trust Score | SHOULD | AI | LLM hanya merangkum komponen yang sudah dihitung; tidak boleh mengubah angka; ditandai "AI summary" |
| FR-B8 | Bahasa netral | MUST | FE | Label memakai "Linked bidding pattern (heuristic)"; tidak ada kata "scam", "fraud", atau "sybil" pada profil agent |

## C. Spec Compiler

| ID | Requirement | Prio | Lapisan | Acceptance criteria |
|---|---|---|---|---|
| FR-C1 | Compile deskripsi job menjadi kriteria | MUST | AI/BE | Input teks (atau ID job market) → JSON valid sesuai schema (05 §6) berisi kriteria integritas C0 + 2–12 kriteria dari job, masing-masing `kind` MUST/SHOULD dan `method` deterministic/llm |
| FR-C2 | Aturan deterministik bila memungkinkan | MUST | AI/BE | Minimal tipe: `min_words`, `max_words`, `contains_sections`, `regex`, `url_reachable`, `format_is` (markdown/json/csv); dieksekusi tanpa LLM |
| FR-C3 | Tandai kriteria yang tidak bisa diverifikasi | MUST | AI | Kriteria seperti "publish to Medium" atau "get 100 likes" masuk `unverifiable[]` beserta usulan pengganti |
| FR-C4 | Requester bisa mengedit kriteria | MUST | FE | Tambah, hapus, ubah teks, ubah MUST/SHOULD, ubah urutan; validasi maks 13 item (termasuk C0) dan minimal 1 MUST selain C0; menghapus C0 memunculkan peringatan |
| FR-C5 | Kriteria final di-hash dan disimpan | MUST | BE/SC | JSON dikanonikalisasi (key terurut, tanpa spasi) → sha256 → disimpan sebagai blob `/blobs/<sha256>`; hash dan `criteria_kinds` dikirim ke kontrak saat `create_job` |

## D. Protected Job Escrow

| ID | Requirement | Prio | Lapisan | Acceptance criteria |
|---|---|---|---|---|
| FR-D1 | Buat dan danai job | MUST | SC/FE | `create_job` payable; menyimpan requester, worker, amount, criteria hash/uri/kinds, deadline submit, `market_job_id` opsional; event `job_created` |
| FR-D2 | Batalkan sebelum submit | MUST | SC | Hanya requester; status `Funded`; dana masuk `claimable` requester 100%; event `job_cancelled` |
| FR-D3 | Worker submit deliverable | MUST | SC/FE | Hanya worker; status `Funded`; sebelum deadline; menyimpan hash + uri; status → `Submitted` |
| FR-D4 | Reclaim bila worker tidak submit | MUST | SC | Siapa pun boleh memanggil setelah `submit_deadline`; dana 100% ke `claimable` requester; status `Expired` |
| FR-D5 | Mulai penjurian | MUST | SC | Siapa pun boleh memanggil saat `Submitted`; kontrak memilih `jury_size` verifier aktif secara acak (mengecualikan requester/worker); status `Committing` |
| FR-D6 | Finalisasi dan settlement | MUST | SC | Setelah reveal window (atau semua reveal masuk): tally per kriteria; semua MUST lolos → `Released` ke worker; selain itu → `Refunded` ke requester; fee dipotong dan dibagi; idempoten |
| FR-D7 | Event NEP-297 untuk tiap transisi | MUST | SC | Format `EVENT_JSON:{"standard":"juri","version":"1.0.0","event":...,"data":[...]}` |
| FR-D8 | Pendanaan dengan wNEAR (NEP-141) | SHOULD | SC | `ft_on_transfer` dari `wrap.testnet` membuat job; payout dalam token yang sama |
| FR-D9 | Partial payout berbasis kriteria SHOULD | SHOULD | SC | Mode `partial`: semua MUST lolos → worker menerima `base_pct + (100-base_pct) × rasio SHOULD lolos` |
| FR-D10 | Penarikan saldo (pull) | MUST | SC/FE | `withdraw()` mengirim seluruh `claimable` milik pemanggil; verifier dikirim ke `payout_account` |

## E. AI Jury

| ID | Requirement | Prio | Lapisan | Acceptance criteria |
|---|---|---|---|---|
| FR-E1 | Registrasi verifier sebagai sub-account + FCAK | MUST | SC | `register_verifier` (owner, payable stake) membuat `<name>.<contract>` dengan FCAK yang hanya boleh memanggil `commit_vote`, `reveal_vote`, `withdraw` di kontrak Juri; tanpa full access key |
| FR-E2 | Pemilihan juri | MUST | SC | Acak dari verifier aktif via `env::random_seed`; tidak ada verifier ganda; jumlah = `jury_size` |
| FR-E3 | Pre-check deterministik | MUST | BE | Aturan `method=deterministic` dijalankan sekali; hasilnya diberikan identik ke semua verifier sebagai "facts" |
| FR-E4 | Penilaian independen lintas model | MUST | AI/BE | Tiap verifier memakai model/provider berbeda; tidak berbagi konteks; output JSON tervalidasi schema; output tidak valid → semua kriteria `UNSURE` |
| FR-E5 | Deteksi prompt injection pada deliverable | MUST | BE/AI | Pre-scan regex (instruksi ke evaluator, zero-width char, base64 panjang, pola Morse, komentar HTML tersembunyi) + flag dari tiap verifier; hasil `injection_suspected` dan cuplikan bukti dipublikasikan |
| FR-E6 | Commit vote | MUST | SC/BE | Commitment = `sha256("{job_id}|{verifier_id}|{verdicts_csv}|{salt_hex}")`; hanya anggota juri; satu kali; sebelum `commit_deadline` |
| FR-E7 | Reveal vote | MUST | SC/BE | Kontrak mencocokkan hash; menyimpan verdicts, `evidence_hash`, `attestation_hash` opsional, label model; sebelum `reveal_deadline` |
| FR-E8 | Tangkap attestation | SHOULD | BE/FE | Untuk provider NEAR AI Cloud: simpan attestation report (dengan nonce terikat job) + signature chat; verifikasi signer = `signing_address`; badge "Attested ✓" / "Not attested" |
| FR-E9 | Publikasi bukti penilaian | MUST | BE/FE | JSON penilaian lengkap tiap verifier disimpan sebagai blob; hash-nya sama dengan `evidence_hash` on-chain |
| FR-E10 | Penanganan reveal kurang | MUST | SC | Reveal < mayoritas → `Stalled`; `restart_jury` sekali dengan juri baru (verifier yang gagal reveal dikecualikan bila jumlah cukup); stall kedua → refund requester tanpa fee |
| FR-E11 | Statistik verifier | MUST | SC | `votes`, `majority_agreements`, `missed_reveals`, `earned` diperbarui saat finalize |
| FR-E12 | Penarikan fee verifier | MUST | SC | Via `withdraw` ke `payout_account` |
| FR-E13 | Slashing stake | COULD | SC | Missed reveal mengurangi stake sebesar `slash_bps` |
| FR-E14 | Banding | COULD | SC | Pihak kalah membayar biaya banding → juri 5 baru; putusan banding final |

## F. Reputation Ledger

| ID | Requirement | Prio | Lapisan | Acceptance criteria |
|---|---|---|---|---|
| FR-F1 | Statistik on-chain per akun | MUST | SC | `get_agent_stats(account)` mengembalikan jumlah job sebagai worker (settled, passed, failed, earned) dan sebagai requester |
| FR-F2 | Root snapshot Trust Score on-chain | SHOULD | SC/BE | Owner/indexer memanggil `post_snapshot(root, computed_at, algo_version, source_hash)`; UI menampilkan bukti merkle per agent |
| FR-F3 | Gabungan reputasi | MUST | BE/FE | Profil agent menampilkan dua sumber terpisah: (1) settlement market, (2) putusan Juri on-chain |

## G. Treasury & Fee Split

| ID | Requirement | Prio | Lapisan | Acceptance criteria |
|---|---|---|---|---|
| FR-G1 | Fee split otomatis | MUST | SC | `fee = amount × fee_bps / 10000`; `jury_pool = fee × jury_share_bps / 10000` dibagi rata ke verifier yang reveal dan berada di sisi mayoritas; sisa + pembulatan ke treasury |
| FR-G2 | Parameter diatur owner | MUST | SC | `set_params` hanya owner; batas aman: `fee_bps` ≤ 1000, `jury_size` ∈ {3, 5}, window 60–86400 detik |
| FR-G3 | Tarik treasury | MUST | SC | `withdraw_treasury(amount, to)` hanya owner |
| FR-G4 | Halaman treasury | SHOULD | FE | Menampilkan total fee, bagian juri, bagian treasury, dan riwayat putusan |

## H. Agent Interface

| ID | Requirement | Prio | Lapisan | Acceptance criteria |
|---|---|---|---|---|
| FR-H1 | REST API publik read-only + compile | MUST | BE | Endpoint di 05 §8; JSON; rate limit per IP; CORS terbuka untuk GET |
| FR-H2 | `skill.md` untuk agent | SHOULD | BE | `GET /skill.md` menjelaskan alur agent: screening bid, compile kriteria, memanggil kontrak (method + argumen) |
| FR-H3 | Contoh agent requester | SHOULD | BE | `examples/agent-requester.ts` menjalankan alur Protected Job memakai key testnet sendiri |

## I. Frontend umum

| ID | Requirement | Prio | Lapisan | Acceptance criteria |
|---|---|---|---|---|
| FR-I1 | Koneksi wallet NEAR testnet | MUST | FE | Connect, tampilkan akun, disconnect; halaman read-only tetap bisa dipakai tanpa wallet |
| FR-I2 | Status Protected Job live | MUST | FE | Timeline dan panel juri diperbarui tanpa reload (polling ≤5 detik atau event) |
| FR-I3 | Link explorer | MUST | FE | Setiap tx dan akun punya link ke explorer (testnet untuk Juri, mainnet untuk market) |
| FR-I4 | Aksi sesuai peran | MUST | FE | Tombol muncul hanya untuk peran yang berhak (requester/worker/owner/siapa pun) dan state yang valid |
| FR-I5 | Halaman Methodology | MUST | FE | Menjelaskan sumber data, rumus Trust Score, ambang pattern, keterbatasan, dan cara mereproduksi |

---

## Non-Functional Requirements

| ID | Kategori | Requirement | Ukuran / AC |
|---|---|---|---|
| NFR-VERIF-1 | Verifiability | Setiap angka dan klaim di UI/README bisa ditelusuri | 100% metrik punya link sumber + `computed_at`; tabel "claim → bukti" di README |
| NFR-VERIF-2 | Verifiability | Hash on-chain cocok dengan blob off-chain | Tombol "Verify hash" di UI menghitung ulang sha256 di browser |
| NFR-REPRO-1 | Reproducibility | Demo bisa dijalankan dari clone baru | ≤5 perintah; tanpa API key pada mode SNAPSHOT + RECORDED-JURY |
| NFR-REPRO-2 | Reproducibility | Algoritma scoring deterministik | Input snapshot yang sama → skor identik; `algo_version` tercatat |
| NFR-SEC-1 | Security | Tidak ada secret di bundle frontend | Scan build (`grep` key pattern) di CI; semua panggilan LLM/market lewat backend |
| NFR-SEC-2 | Security | Least privilege kunci | Kunci verifier = FCAK; kunci owner terpisah dari kunci jury runner; tabel kunci di 03 §6 |
| NFR-SEC-3 | Security | Validasi input | Kriteria ≤13 item (termasuk C0), teks ≤500 char/item; deliverable ≤50.000 char; URI ≤512 char |
| NFR-SEC-4 | Security | SSRF guard saat mengambil deliverable URI | Hanya `https`; tolak IP privat/localhost; allowlist domain (gist, raw.githubusercontent.com, domain backend sendiri); timeout 10 dtk; ukuran maks 1 MB |
| NFR-SEC-5 | Security | Ketahanan prompt injection | Eval set memuat ≥6 kasus injection; 0 lolos PASS oleh kuorum |
| NFR-SEC-6 | Security | Kontrak aman | State diubah sebelum promise; overflow dicek (`checked_*`); semua method privileged mengecek predecessor; uji unit untuk setiap error path |
| NFR-PRIV-1 | Privacy | Deliverable tidak disimpan on-chain | Hanya hash + URI |
| NFR-PRIV-2 | Privacy | Proposal privat milik job orang lain tidak pernah dipublikasikan | Juri hanya membaca proposal untuk job yang dibuat akun Juri sendiri |
| NFR-PRIV-3 | Privacy | Inferensi privat bila tersedia | Provider default untuk verifier = NEAR AI Cloud model private (bila kredit ada) |
| NFR-FAIR-1 | Fairness | Agent baru tidak dihukum karena kurang data | Status "Insufficient data" (FR-B3) |
| NFR-FAIR-2 | Fairness | Flag bisa dipertanyakan | Link "Report an error" ke GitHub issue template di halaman pattern |
| NFR-PERF-1 | Performance | Halaman read-only cepat | Insights dan Job Analysis < 2,5 dtk dari cache |
| NFR-PERF-2 | Performance | Compile kriteria | < 20 dtk p95 |
| NFR-PERF-3 | Performance | Putusan juri | Selesai ≤ commit window + reveal window + 2 menit (demo: window 3 menit) |
| NFR-REL-1 | Reliability | Tahan rate limit API eksternal | Retry dengan exponential backoff + jitter; hormati `Retry-After`; sync bisa dilanjutkan |
| NFR-REL-2 | Reliability | Jury runner idempoten | Restart proses tidak menyebabkan double commit; status per job/verifier disimpan |
| NFR-REL-3 | Reliability | Provider LLM gagal | Fallback ke provider cadangan; bila tetap gagal, verifier tidak commit (dihitung missed) |
| NFR-COST-1 | Cost | Biaya LLM per job dibatasi | Maks 1 compile + 1 pre-scan + 3 judge call per job; `max_tokens` dibatasi; biaya dicatat per job |
| NFR-OBS-1 | Observability | Log terstruktur | JSON log dengan `job_id`, `verifier`, `phase`, `latency_ms`; halaman evidence menampilkan log ringkas jury run |
| NFR-A11Y-1 | Accessibility | Status tidak hanya dibedakan warna | Setiap badge punya ikon + teks; kontras WCAG AA |
| NFR-UX-1 | Usability | Bahasa UI | English; istilah konsisten dengan glosarium |
| NFR-COMPAT-1 | Compatibility | Browser | Chrome, Firefox, Safari terbaru; halaman read-only responsif di mobile |
| NFR-MAINT-1 | Maintainability | Tipe bersama | `packages/shared` berisi tipe API, schema zod, dan util hash yang dipakai BE dan FE |
| NFR-MAINT-2 | Maintainability | ABI kontrak | ABI dihasilkan dari kontrak dan di-commit; CI gagal bila ABI tidak sinkron |
| NFR-LEGAL-1 | Compliance | Patuh ToS API eksternal | Rate limit konservatif; atribusi sumber; disclaimer "not financial advice" |
| NFR-HONEST-1 | Honesty | Label simulasi dan keterbatasan | Mode data, status attestation, dan "all verifiers operated by one operator in MVP" tertulis di UI dan README |
