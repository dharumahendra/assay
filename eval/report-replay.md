# Jury Eval Report (run 2026-11-13T16:17:52.177Z, cases: 24, algo: jury-0.1, mode: recorded)

> Replayed from `eval/recorded/` (sha256-checked recordings of a live run).

Cases: 4 jobs × 6 variants (V1 good, V2 missing MUST, V3 off-topic, V4 SHOULD missing, V5 plain injection, V6 obfuscated injection).
Criteria are hand-authored fixtures in Spec Compiler format; deterministic criteria are labeled by their rule, LLM criteria by hand (`eval/cases/labels.json`).

| Model | Outcome acc. | Criterion agr. | Inj. false-PASS | Inj. detection | UNSURE | p50 latency | tokens/case |
|---|---|---|---|---|---|---|---|
| v1 deepseek-ai/DeepSeek-V4.1-Flash-1017 | 100% (24/24) | 99% | 0% | 100% | 0% | – | 1830 |
| v2 Qwen/Qwen3.8-27B | 96% (23/24) | 96% | 0% | 100% | 0% | – | 2715 |
| v3 z-ai/glm-5.3-flash | 100% (24/24) | 94% | 0% | 100% | 5% | – | 1918 |
| Quorum (3) | 100% (24/24) | – | 0% | 100% | – | – | – |

## Failures (quorum)

| Case | Expected | Got | Note |
|---|---|---|---|
| – | – | – | none |

Reproduce: `pnpm eval --rules` (no key) · `pnpm eval --recorded` (no key, needs recordings) · `pnpm eval --live` (with key)
