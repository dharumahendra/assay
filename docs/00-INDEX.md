# Juri — Paket Dokumen Proyek (NEAR Hackathon)

> **Juri** adalah nama kerja. Cek ketersediaan nama, domain, dan handle X sebelum dipakai publik.
>
> **One-liner (EN, 14 kata):** Trust layer for NEAR's AI Agent Market: checkable criteria, an AI jury, settlement-based reputation.
>
> **One-liner (ID):** Lapisan kepercayaan untuk NEAR AI Agent Market: kriteria yang bisa dicek, juri AI berkuorum, dan reputasi dari settlement on-chain.

Dikerjakan solo. Dokumen ditulis dalam Bahasa Indonesia; UI aplikasi, README, dan materi submission ditulis dalam English karena jurinya internasional.

---

## 1. Isi paket

| # | File | Isi | Dibaca saat |
|---|---|---|---|
| 00 | `00-INDEX.md` | Ringkasan, keputusan kunci, hal yang wajib dicek | Pertama kali |
| 01 | `01-PRD.md` | Masalah, bukti, persona, scope, metrik, narasi track | Sebelum mulai dan saat pitching |
| 02 | `02-REQUIREMENTS.md` | Functional & non-functional requirement + acceptance criteria | Saat implementasi dan QA |
| 03 | `03-ARCHITECTURE.md` | Komponen, peran primitif NEAR, trust model, stack, struktur repo | Sebelum coding |
| 04 | `04-SMART-CONTRACT-SPEC.md` | State, method, state machine, algoritma tally, event | Fase smart contract |
| 05 | `05-BACKEND-AI-SPEC.md` | REST API, data model, algoritma Trust Score, prompt juri, jury runner | Fase backend/AI |
| 06 | `06-WORKFLOWS.md` | Alur sistem dan sequence diagram | Lintas fase |
| 07 | `07-UI-PAGES-USERFLOW.md` | Daftar halaman, tombol per halaman, state, user flow (untuk Pencil) | Fase desain/frontend |
| 08 | `08-WORKPLAN.md` | Urutan kerja solo, kapan pindah SC/BE/FE, gate tiap fase | Setiap mulai sesi kerja |
| 09 | `09-TESTING-DEMO-SUBMISSION.md` | Strategi test, eval juri, kerangka README, deskripsi, skrip demo, post X | Menjelang submit |

---

## 2. Ringkasan 60 detik

**Masalah.** NEAR AI Agent Market sudah memakai escrow on-chain, tetapi requester tetap tidak bisa memprediksi agent mana yang benar-benar menyelesaikan pekerjaan. Tiga akar masalahnya:

1. Spesifikasi job berupa teks bebas, sehingga deliverable mudah ditolak dan job di-relist.
2. Sengketa kualitas diputus oleh satu dispute agent.
3. Reputasi tidak diturunkan dari riwayat settlement on-chain, sementara satu job bisa menerima belasan bid, termasuk bid "kembar" dari akun berbeda.

**Solusi.** Juri menambahkan empat modul di atas market yang sudah ada:

| Modul | Fungsi | Peran AI | Peran chain |
|---|---|---|---|
| Market Insight | Mengukur masalah dari data nyata: API market + transaksi `escrow.ai.near` | – | Membaca mainnet |
| Bid Screener | Trust Score per agent + deteksi pola bid yang saling terhubung | Penjelasan bahasa alami (SHOULD) | Membaca mainnet |
| Spec Compiler | Mengubah deskripsi job menjadi acceptance criteria yang bisa dicek; hash-nya dikunci di kontrak | Inti | Hash on-chain |
| Protected Job + AI Jury | Escrow milik Juri; 3 verifier lintas model menilai dengan commit-reveal; kontrak mengeksekusi pembayaran | Inti | Inti |

**Track.** Utama: 07 Agent Economy dan 05 AI Swarms. Sekunder: 06 AI Security & Defense, 03 Privacy & Private AI, 04 Autonomous Business. Narasi jujur per track ada di PRD §11.

**Primitif NEAR yang dipakai.** Smart contract Rust (escrow, juri, reputasi), sub-account (identitas verifier), Function Call Access Key (verifier hanya bisa vote), NEAR AI Cloud (inferensi privat + attestation), event NEP-297. SHOULD: NEP-141 wNEAR. COULD: NEAR Intents.

---

## 3. Keputusan kunci (ADR ringkas)

| ID | Keputusan | Alasan | Konsekuensi |
|---|---|---|---|
| D1 | Juri punya kontrak escrow sendiri, tidak mengubah `escrow.ai.near` | Kita tidak punya akses ke escrow market | Protected Job adalah alur opsional di samping market; data market tetap dipakai untuk insight dan screening |
| D2 | MVP memakai native NEAR di testnet | Paling sederhana dan aman untuk demo | wNEAR (NEP-141) masuk SHOULD |
| D3 | Trust Score dihitung deterministik, bukan oleh LLM | Bisa diaudit dan direproduksi oleh siapa pun | AI hanya dipakai untuk kriteria, penjurian, dan penjelasan |
| D4 | Juri berisi 3 verifier, commit-reveal, mayoritas per kriteria | Mencegah verifier saling mencontek; tahan satu model yang tertipu | Butuh minimal 4 verifier terdaftar agar bisa restart |
| D5 | Verifier = sub-account yang dibuat kontrak + Function Call Access Key khusus method vote | Least privilege: kunci verifier tidak bisa memindahkan dana | Penarikan fee verifier dikirim ke `payout_account` |
| D6 | Abstraksi provider LLM: NEAR AI Cloud sebagai utama, provider OpenAI-compatible sebagai fallback | Kamu belum punya API key/kredit NEAR AI Cloud | UI wajib menandai vote "Attested" vs "Not attested" |
| D7 | Blob off-chain (kriteria, deliverable, bukti) disimpan content-addressed (sha256) di backend | Kontrak hanya menyimpan hash | Siapa pun bisa mencocokkan hash |
| D8 | Ada mode SNAPSHOT (data nyata yang dibekukan + timestamp) dan RECORDED-JURY | Screening AI bisa menjalankan demo tanpa API key | Label mode harus terlihat jelas di UI dan README |
| D9 | Pola bid ditampilkan dengan bahasa netral ("Linked bidding pattern") + bukti | Menghindari tuduhan tanpa dasar terhadap agent nyata | Ada halaman Methodology dan label "heuristic" |
| D10 | Pembayaran memakai pola pull (`withdraw`) | Menghindari promise gagal dan reentrancy | Worker dan verifier harus menekan tombol Withdraw |

---

## 4. Wajib dicek di Phase 0 (blocking)

Semua ini adalah asumsi. Jangan menulis kode yang bergantung padanya sebelum dicek.

| ID | Yang dicek | Cara cek | Fallback bila tidak sesuai |
|---|---|---|---|
| V1 | Endpoint market untuk detail job, daftar bid, dan profil agent | Daftar agent (`POST /v1/agents/register`), buka Swagger di `https://market.near.ai/api-docs/` | Parse halaman job publik (fallback terakhir; hormati rate limit) |
| V2 | Apakah objek agent atau job memuat NEAR account id (bukan hanya handle) | Lihat response `/v1/agents`, `/v1/agents/me`, detail job | Petakan handle → account dari transaksi `agent reward` pada job yang di-award ke handle itu |
| V3 | Apakah job punya daftar transaksi (deposit, reward, refund, fee) via API | Swagger | Klasifikasi transfer `escrow.ai.near` dari NearBlocks berdasarkan arah dan counterparty |
| V4 | NearBlocks v3 `ft-txns` untuk `escrow.ai.near` (token `wrap.near`) | `GET https://api.nearblocks.io/v3/accounts/escrow.ai.near/ft-txns?limit=25` | FastNEAR transaction API |
| V5 | Field `proposal` pada bid hanya terlihat oleh pembuat job | Bandingkan response bid sebagai non-creator vs creator | Deteksi teks proposal hanya untuk job milikmu sendiri |
| V6 | NEAR AI Cloud: akun, kredit, model yang tersedia, nama parameter nonce di endpoint attestation | Daftar di `cloud.near.ai`, `GET /v1/models`, coba `/v1/attestation/report?model=...` | Provider fallback; vote ditandai "Not attested" |
| V7 | near-sdk-rs versi terbaru: signature `add_access_key_allowance`, `create_account` dari kontrak | Docs near-sdk + build kontrak kecil | Verifier didaftarkan manual via CLI, kontrak hanya menyimpan registry |
| V8 | Token wNEAR testnet (`wrap.testnet`) untuk NEP-141 | View `ft_metadata` | Tetap native NEAR |
| V9 | Syarat penggunaan API market.near.ai (rate limit, larangan scraping) | Baca docs/ToS | Kurangi frekuensi sync, pakai snapshot |

---

## 5. Konvensi

- **ID requirement:** `FR-<modul><nomor>` (contoh `FR-E4`), `NFR-<kategori>-<nomor>`.
- **Prioritas (MoSCoW):** MUST = demo end-to-end gagal tanpanya; SHOULD = menaikkan skor signifikan; COULD = bonus; WON'T = sengaja tidak dibuat.
- **Label klaim:** **Fakta** (ada sumber), **Asumsi** (perlu dicek), **Keputusan** (pilihan desain).
- **Jaringan:** kontrak di NEAR **testnet**; data market dan `escrow.ai.near` dibaca dari **mainnet** (read-only).
- **Satuan:** jumlah token di kontrak memakai yoctoNEAR (`u128`); di UI ditampilkan dalam NEAR dengan 2–4 desimal.

---

## 6. Glosarium

| Istilah | Arti |
|---|---|
| Market | NEAR AI Agent Market (`market.near.ai`) |
| Requester | Pihak yang memasang job (manusia atau agent) |
| Worker | Agent yang mengerjakan job |
| Protected Job | Job yang dananya di-escrow di kontrak Juri dan dinilai oleh AI Jury |
| Criteria / Kriteria | Daftar acceptance criteria hasil Spec Compiler; tiap item bertipe MUST atau SHOULD |
| Verifier | Agent penilai; punya sub-account dan FCAK sendiri |
| Jury | Sekumpulan verifier yang dipilih untuk satu job |
| Commit-reveal | Verifier menyetor hash vote dulu, lalu membuka isinya setelah semua commit |
| Trust Score | Skor 0–100 per agent dari data settlement dan perilaku bid |
| Linked bidding pattern | Sekelompok akun dengan pola bid yang nyaris identik atau sumber dana yang sama (heuristik) |
| FCAK | Function Call Access Key: kunci NEAR yang hanya bisa memanggil method tertentu di kontrak tertentu |
| Attestation | Bukti hardware dari NEAR AI Cloud tentang kode/model yang menjalankan inferensi |
