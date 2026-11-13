# 01 — Product Requirements Document (PRD): Juri

| Item | Isi |
|---|---|
| Produk | Juri (nama kerja) |
| Versi dokumen | v1.0 |
| Pemilik | Dharu (solo: PM, SC, BE, FE, DevOps) |
| Kompetisi | NEAR HACKATHON — "Build what's next" |
| Track | Utama 07 Agent Economy, 05 AI Swarms · Sekunder 06 AI Security & Defense, 03 Privacy & Private AI, 04 Autonomous Business |
| Status | Draft siap eksekusi |

---

## 1. Ringkasan produk

Juri adalah lapisan kepercayaan (trust layer) untuk NEAR AI Agent Market. Juri membantu requester:

1. **Sebelum memilih worker**: melihat Trust Score tiap bidder yang dihitung dari riwayat settlement on-chain, serta pola bid yang saling terhubung.
2. **Sebelum mendanai job**: mengubah deskripsi job menjadi acceptance criteria yang bisa dicek pihak ketiga, lalu mengunci hash-nya di kontrak.
3. **Setelah deliverable dikirim**: menyerahkan penilaian ke juri berisi 3 verifier AI dari model berbeda. Mereka menilai secara independen dengan commit-reveal, dan kontrak NEAR mengeksekusi pembayaran atau refund berdasarkan mayoritas.

---

## 2. Latar belakang dan bukti masalah

### 2.1 Fakta (bersumber)

| # | Fakta | Sumber |
|---|---|---|
| F1 | Alur market: job dibuat → agent mengajukan proposal → requester memilih bid dan mendanai escrow → agent submit dengan hash proof → requester menerima, escrow cair | https://market.near.ai |
| F2 | Sengketa kualitas ditangani satu "dispute agent" yang menilai semua pihak lalu memberi putusan | https://near.ai/blog/introducing-near-ai-agent-market |
| F3 | Ada job yang di-relist karena deliverable worker sebelumnya ditolak. Poster job yang sama menulis klaim "50+ jobs completed, 600+ awarded" | https://market.near.ai/jobs/e1d9149f-b6fe-4ec7-a5e5-b68c651ebe53 |
| F4 | Ada job berstatus Disputed | https://market.near.ai/jobs/b8686fb2-3249-489f-a596-228395a1ef63 , https://market.near.ai/jobs/1ca8fbfe-7e59-42d2-a4d8-b58ee2487cb2 |
| F5 | Di beberapa job berbeda, @autopilotai dan @skillscan_security mengajukan bid dengan jumlah dan durasi yang sama persis pada waktu yang sama; @alpha_acc_agent, @clawsonnet, @e2248 juga berulang dengan pola serupa | https://market.near.ai/jobs/c51f4f76-10f7-44c9-90bb-fd82c0c17ed0 , https://market.near.ai/jobs/bca80a91-c3b5-478f-b0bd-88f6e25c3dd2 , https://market.near.ai/jobs/8436fde1-14d9-4cc5-aa20-459d7249260e |
| F6 | Riwayat transaksi job memperlihatkan tipe `secure deposit`, `agent reward`, `marketplace fee`, dan `escrow_refund` dalam token `nep141:wrap.near`, dengan `escrow.ai.near` sebagai escrow | https://market.near.ai/jobs/2d64496f-0966-4c45-ac05-132f86ea8ec2 , https://market.near.ai/jobs/f88ba02c-ff9d-4ed7-b1fb-35f062e56d1e |
| F7 | Field `proposal` pada bid hanya terlihat oleh pembuat job; field bid lain: `amount`, `eta_seconds` | https://market.near.ai/skill.md |
| F8 | Seorang agent melaporkan 25 bid dengan 0 diterima, dan menyebut kebanyakan job punya 15–25 bid (tanggal tulisan tidak tercantum; kemungkinan periode awal market) | https://dev.to/theauroraai/25-bids-0-acceptances-what-i-learned-as-an-ai-agent-in-the-job-market-5h4n |
| F9 | Kriteria penerimaan yang tidak bisa dipenuhi atau diverifikasi worker adalah penyebab umum sengketa di marketplace kerja AI agent | https://dealwork.ai/blog/acceptance-criteria-problem-2026 |
| F10 | Prompt injection lewat teks tersamar sudah menimbulkan kerugian nyata (kasus Grok × Bankr, pesan Morse, ~$175K) | Riset internal (`Riset_Issue_AI_Agent_Web3`, issue #1) |

### 2.2 Klaim yang belum terverifikasi

| Klaim | Sumber | Status |
|---|---|---|
| ~200 job, 50+ service | Tulisan "market.near.ai growth team": https://dev.to/duc_hoangviet_a39192cfbe0/the-rise-of-ai-agent-marketplaces-how-autonomous-agents-are-reshaping-the-gig-economy-2pk0 | Klaim; hitung ulang dari API |
| 494 agent, 2K job, 12K NEAR transacted | Brief job: https://market.near.ai/jobs/dfd88019-34f3-4dd5-a64c-405972dbfa92 | Klaim; hitung ulang dari API dan on-chain |

### 2.3 Asumsi

- **A1.** Bid kembar (F5) bisa berarti satu operator menjalankan banyak akun, atau bot dengan template yang sama. Juri tidak menyimpulkan niat; Juri hanya menampilkan pola dan buktinya.
- **A2.** Status "Rejected" pada bid kemungkinan berarti "tidak dipilih", bukan "gagal". Jangan dipakai sebagai bukti kegagalan.
- **A3.** Rasio `escrow_refund` terhadap `secure deposit` di `escrow.ai.near` adalah proksi yang wajar untuk job yang tidak berakhir dengan pembayaran. Angka ini dihitung di Phase 1 dan menjadi bukti utama di demo.

---

## 3. Akar masalah

| # | Akar masalah | Akibat | Modul Juri |
|---|---|---|---|
| RC1 | Spesifikasi berupa teks bebas tanpa kriteria yang bisa diverifikasi | Deliverable ditolak, job di-relist, sengketa | Spec Compiler |
| RC2 | Satu penilai (dispute agent tunggal) untuk sengketa | Titik kegagalan tunggal; rawan prompt injection dari isi deliverable | AI Jury (3 model, commit-reveal) |
| RC3 | Reputasi tidak berasal dari settlement yang bisa dihitung ulang | Requester memilih dari belasan bid tanpa sinyal kualitas | Market Insight + Bid Screener |
| RC4 | Bid murah dan mudah diotomasi | Bid flooding dan pola bid terhubung | Deteksi Linked bidding pattern |

---

## 4. Tujuan dan non-tujuan

### Tujuan
- **G1.** Membuktikan masalah dengan angka dari data nyata yang bisa diklik sampai ke sumbernya.
- **G2.** Memberi requester sinyal kualitas bidder yang bisa diaudit sebelum mendanai job.
- **G3.** Menyediakan alur Protected Job end-to-end di NEAR testnet: dana dikunci → deliverable dikirim → juri 3 model menilai → kontrak mencairkan atau mengembalikan dana.
- **G4.** Membuktikan bahwa juri berkuorum lebih tahan prompt injection daripada satu penilai, lewat eval yang hasilnya dipublikasikan.
- **G5.** Repo bisa dijalankan dan diverifikasi oleh screening AI (Claude Code, Codex) tanpa API key, lewat mode SNAPSHOT.

### Non-tujuan (WON'T, versi hackathon)
- Mengganti atau memodifikasi market.near.ai maupun `escrow.ai.near`.
- Pembayaran USD, Stripe, atau fiat.
- KYC atau identitas manusia.
- Menilai selera subjektif (misalnya "desain yang bagus") tanpa kriteria yang bisa dicek.
- Dana mainnet di kontrak Juri.
- Verifier permissionless dari operator lain (masuk roadmap; di MVP semua verifier dioperasikan olehmu, dan ini diakui terang-terangan).

---

## 5. Persona

| ID | Persona | Konteks | Pain | Yang diinginkan dari Juri |
|---|---|---|---|---|
| P1 | Requester manusia | Operator yang memasang banyak job di market | Menyortir 15–25 bid; membayar deliverable yang tidak sesuai | Daftar bidder yang bisa dipercaya; kriteria jelas; refund otomatis bila gagal |
| P2 | Requester agent | Agent otonom yang merekrut agent lain lewat API | Tidak bisa menilai kualitas tanpa manusia | API untuk screening bid dan membuat Protected Job |
| P3 | Worker agent (jujur) | Agent yang bid dan mengerjakan job | Ditolak sepihak; reputasi baik tidak terbawa | Penilaian adil berdasarkan kriteria yang dikunci di awal; rekam jejak on-chain |
| P4 | Operator verifier | Menjalankan node verifier (MVP: kamu) | Butuh insentif dan kunci yang aman | Fee per putusan; kunci yang hanya bisa vote |
| P5 | Juri hackathon / auditor | Membuka repo dan demo | Tidak punya waktu memverifikasi klaim | Setiap angka bisa diklik ke sumber; demo bisa dijalankan tanpa key |

---

## 6. Proposisi nilai

- **Untuk requester:** "Lihat siapa yang benar-benar pernah dibayar, kunci apa yang dimaksud 'selesai', dan biarkan tiga juri independen yang memutus."
- **Untuk worker jujur:** "Kriteria dikunci sebelum kamu mulai; tidak bisa digeser setelah deliverable dikirim."
- **Untuk ekosistem NEAR:** "Plug-in yang melengkapi dispute agent Agent Market dengan kuorum dan bukti, bukan menggantinya."

---

## 7. Solusi dan fitur

| Modul | Deskripsi | Prioritas |
|---|---|---|
| M1 Market Insight | Sinkronisasi job/bid dari API market dan transfer `escrow.ai.near` dari NearBlocks; menghitung metrik masalah (completion rate, refund ratio, bid per job, bid kembar, sengketa) | MUST |
| M2 Bid Screener | Trust Score 0–100 per agent dengan rincian komponen; status "Insufficient data"; deteksi Linked bidding pattern (co-bidding dan shared funder) | MUST (co-bidding), SHOULD (shared funder) |
| M3 Spec Compiler | LLM mengubah deskripsi job menjadi 2–12 kriteria MUST/SHOULD (ditambah kriteria integritas C0 yang menggagalkan deliverable berisi instruksi ke juri), menandai kriteria yang tidak bisa diverifikasi beserta usulan penggantinya, dan membuat aturan deterministik bila memungkinkan | MUST |
| M4 Protected Job Escrow | Kontrak Juri: buat dan danai job, kunci hash kriteria, submit deliverable, cancel, reclaim saat kedaluwarsa, finalize | MUST |
| M5 AI Jury | 3 verifier dari model berbeda; pre-check deterministik; deteksi injection; commit-reveal; mayoritas per kriteria; bukti penilaian dipublikasikan | MUST |
| M6 Attestation | Mengambil attestation report NEAR AI Cloud dan tanda tangan respons; hash disimpan bersama reveal; badge di UI | SHOULD (cek tanda tangan), COULD (verifikasi penuh NRAS + TDX) |
| M7 Reputation Ledger | Statistik on-chain per worker dan verifier dari job Juri; (SHOULD) merkle root snapshot Trust Score diposting on-chain | MUST (stats), SHOULD (root) |
| M8 Treasury & fee split | Fee per putusan, bagian juri dibagi otomatis ke verifier mayoritas, sisanya ke treasury; parameter diatur owner | MUST (split), SHOULD (halaman treasury) |
| M9 Agent interface | REST API publik + `skill.md` agar agent lain bisa memakai Juri | SHOULD |
| M10 Mode data | LIVE / SNAPSHOT / RECORDED-JURY dengan label jelas | MUST |

---

## 8. Scope MoSCoW

| MUST (demo end-to-end) | SHOULD | COULD | WON'T |
|---|---|---|---|
| Sync data market + `escrow.ai.near` | Shared-funder detection | Verifikasi attestation penuh (NRAS + TDX) | Mainnet funds |
| Metrik masalah + link sumber | Penjelasan Trust Score oleh LLM | NEAR Intents untuk funding lintas token | Fiat/USD |
| Trust Score + co-bidding pattern | Attestation: cek tanda tangan respons | Banding (appeal) dengan juri 5 | KYC |
| Spec Compiler | wNEAR (NEP-141) via `ft_transfer_call` | Slashing stake verifier | Verifier permissionless |
| Kontrak escrow + juri + commit-reveal + finalize | Partial payout berbasis kriteria SHOULD | Enkripsi deliverable khusus untuk verifier | Modifikasi market.near.ai |
| Verifier = sub-account + FCAK | `skill.md` + contoh agent requester | IPFS pinning blob | |
| Jury runner 3 model + deteksi injection | Merkle root snapshot on-chain | | |
| Halaman inti FE + wallet | Halaman Treasury | | |
| Mode SNAPSHOT/RECORDED + README repro | Restart juri saat reveal kurang | | |
| Eval juri (≥20 kasus) + laporan | | | |

---

## 9. User stories (dipetakan ke FR)

| ID | Sebagai | Saya ingin | Supaya | FR |
|---|---|---|---|---|
| US1 | P5 Auditor | melihat metrik masalah beserta link sumber | saya percaya masalahnya nyata | FR-A3, FR-A5 |
| US2 | P1 Requester | melihat semua bid untuk sebuah job dengan Trust Score | saya memilih worker dengan sadar | FR-B2, FR-B3 |
| US3 | P1 Requester | tahu bila beberapa bidder punya pola bid nyaris identik | saya tidak tertipu banyak akun | FR-B4, FR-B6 |
| US4 | P1/P2 Requester | mengubah deskripsi job jadi kriteria yang bisa dicek | worker dan juri punya patokan yang sama | FR-C1–C4 |
| US5 | P1 Requester | mengunci dana dan hash kriteria di kontrak | kriteria tidak bisa digeser belakangan | FR-D1, FR-C5 |
| US6 | P3 Worker | mengirim deliverable beserta hash-nya | ada bukti apa yang saya serahkan dan kapan | FR-D3 |
| US7 | P5 Auditor | melihat tiap verifier commit lalu reveal, plus alasannya | saya bisa memeriksa putusan juri | FR-E6, FR-E7, FR-E9 |
| US8 | P1 Requester | dana otomatis kembali bila MUST gagal | saya tidak perlu bernegosiasi | FR-D6 |
| US9 | P3 Worker | dibayar otomatis bila semua MUST lolos | saya tidak bergantung pada itikad requester | FR-D6 |
| US10 | P4 Operator | mendaftarkan verifier dengan kunci yang hanya bisa vote | kunci bocor tidak menguras dana | FR-E1 |
| US11 | P4 Operator | menarik fee verifier ke akun payout | ada insentif menjalankan verifier | FR-E12, FR-G1 |
| US12 | P2 Requester agent | memanggil API untuk screening bid dan membuat Protected Job | saya bisa merekrut agent tanpa manusia | FR-H1, FR-H2 |
| US13 | P5 Auditor | melihat badge Attested/Not attested per vote | saya tahu vote mana yang dijalankan di TEE | FR-E8 |
| US14 | P5 Auditor | menjalankan demo tanpa API key | saya bisa memverifikasi klaim README | FR-A4, NFR-REPRO-1 |

---

## 10. Metrik keberhasilan

| ID | Metrik | Target | Cara ukur |
|---|---|---|---|
| SM1 | Angka di Insights yang punya link sumber + `computed_at` | 100% | Review UI |
| SM2 | Akurasi kuorum juri pada eval set (≥20 kasus) | ≥ akurasi model tunggal terbaik | `eval/report.md` |
| SM3 | Kasus injection yang lolos PASS oleh kuorum | 0 | `eval/report.md` |
| SM4 | Precision Linked bidding pattern (review manual top-10 cluster) | Dilaporkan apa adanya, target ≥70% | Catatan review di `eval/patterns-review.md` |
| SM5 | Lifecycle Protected Job di testnet | Selesai ≤ (commit window + reveal window + 2 menit) | Log jury runner + tx explorer |
| SM6 | Reproducibility | Clone baru → demo SNAPSHOT jalan dalam ≤5 perintah, tanpa key | Uji di mesin/container bersih |

---

## 11. Narasi per track (jujur)

| Track | Kecocokan | Yang ditonjolkan di demo dan README | Batas kejujuran |
|---|---|---|---|
| 07 Agent Economy (utama) | Tinggi | Agent merekrut agent, membayar lewat escrow, dan Juri membayar verifier agent per putusan | Worker di demo adalah agent milikmu; data job/bid nyata dari market |
| 05 AI Swarms (utama) | Tinggi | Juri sebagai coordination market: verifier dipilih acak, commit-reveal, mayoritas; proses swarm terlihat live di UI; tiap verifier punya sub-account | Semua verifier di MVP dioperasikan satu orang |
| 06 AI Security & Defense (sekunder) | Sedang–tinggi | FCAK least-privilege, deteksi Linked bidding pattern, juri tahan prompt injection (termasuk replay ala Morse) | Deteksi pola adalah heuristik |
| 03 Privacy & Private AI (sekunder) | Sedang | Verifier memakai inferensi privat NEAR AI Cloud dengan attestation; deliverable tidak disimpan on-chain | Bergantung pada kredit NEAR AI Cloud; tanpa itu badge "Not attested" |
| 04 Autonomous Business (sekunder) | Sedang | Juri sebagai layanan otonom: fee per putusan, revenue share ke verifier otomatis, manusia hanya mengatur parameter | Biaya LLM masih dibayar off-chain oleh operator |

---

## 12. Kompetitor dan diferensiasi

| Pembanding | Apa yang dilakukan | Bedanya Juri |
|---|---|---|
| Dispute agent NEAR Agent Market | Satu agent menilai sengketa | Juri memakai 3 model, commit-reveal, kriteria yang dikunci sebelum kerja, dan bukti publik; diposisikan sebagai pelengkap |
| Circle arc-escrow (sample app) | Escrow + validasi deliverable oleh satu model AI | Kuorum lintas model, deteksi injection, reputasi dari settlement, berjalan di NEAR dengan data market nyata |
| GenLayer | Blockchain khusus untuk keputusan subjektif | Juri adalah aplikasi di NEAR yang langsung menempel ke market yang sudah hidup |
| pact0 | Rekam jejak kerja agent yang portabel | Juri menurunkan reputasi dari transaksi settlement on-chain yang bisa dihitung ulang, plus deteksi pola bid |
| abbababa, x402resolve | Resolusi sengketa AI untuk pembayaran agent | Fokus Juri pada pencegahan (kriteria di awal) + kuorum, bukan hanya sengketa setelah kejadian |

**Kalimat diferensiasi (untuk pitching):** "Others add an AI judge after the fight. Juri locks what 'done' means before work starts, then lets three independent models decide, with every vote on-chain and every number traceable."

---

## 13. Risiko dan mitigasi

| ID | Risiko | Dampak | Mitigasi |
|---|---|---|---|
| R1 | API market berubah, dibatasi, atau melarang penggunaan tertentu | Data insight terhenti | Snapshot berkala; patuhi rate limit; cek ToS di Phase 0 (V9) |
| R2 | Agent tidak bisa dipetakan ke NEAR account | Trust Score lemah | Pemetaan lewat transaksi `agent reward` (V2) |
| R3 | Belum ada kredit NEAR AI Cloud | Klaim Privacy melemah | Provider fallback + badge jujur; daftar kredit sedini mungkin |
| R4 | LLM salah menilai | Putusan salah | Kriteria deterministik dulu; 3 model; UNSURE diperlakukan konservatif; eval dipublikasikan |
| R5 | Semua verifier dioperasikan satu orang | Kolusi mungkin terjadi | Diakui di README; model berbeda; bukti publik; roadmap verifier permissionless dengan stake |
| R6 | False positive pada pola bid | Merugikan agent nyata | Bahasa netral, bukti ditampilkan, halaman Methodology, ambang konservatif |
| R7 | Scope creep sebagai developer solo | Demo tidak selesai | Gate per fase dan cut list di `08-WORKPLAN.md` |
| R8 | `random_seed` bisa dipengaruhi validator | Pemilihan juri bisa dimanipulasi | Diakui sebagai keterbatasan MVP; jumlah verifier kecil |
| R9 | Juri lomba melihat Juri sebagai pesaing fitur NEAR | Kesan negatif | Framing "complementary plug-in" dan integrasi read-only yang sopan |

---

## 14. Roadmap setelah hackathon (untuk slide "sustainability")

1. Verifier permissionless dengan stake dan slashing.
2. Integrasi resmi dengan dispute flow Agent Market (Juri sebagai "second opinion").
3. Reputasi portabel: root Trust Score yang bisa dibaca kontrak lain.
4. Model bisnis: fee per putusan (bps dari escrow) + langganan screening untuk requester volume tinggi.
