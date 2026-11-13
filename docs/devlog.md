# Devlog

## 2026-11-13 — P0 setup & spike (DevOps + BE), paused at G0
- Selesai: struktur monorepo, docs dipindah ke `docs/`, LICENSE MIT, `.env.example`, CI skeleton, `packages/shared` (canonical JSON + sha256 + commitment builder + schema market v2), spike FCAK (`contracts/spike-fcak`), probe V1–V9 → `docs/phase0-findings.md`.
- Berikutnya: keputusan sumber data (lihat findings §Decisions), lalu P1.
- Antarmuka berubah: schema market di `packages/shared/src/schemas/market.ts` mengikuti API v2 (docs/05 §3.1–3.2 belum diperbarui).
- Blocker: market sekarang USD/USDC + jobs/bids butuh token `aat_`; escrow settle via intents.near; ToS §9.2 larang scraping at scale; Rust toolchain; akun testnet.
- Cara menjalankan: `pnpm install && pnpm test`
