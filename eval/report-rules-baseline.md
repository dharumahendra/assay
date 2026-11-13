# Jury Eval Report (run 2026-11-13T14:02:38.263Z, cases: 24, algo: jury-0.1, mode: rules)

> **Baseline, not the LLM jury.** All three verifiers ran the offline `rules:v1` juror (deterministic rules + pre-scan; every LLM criterion is UNSURE). It shows what Juri gets with no model at all. The LLM eval (`pnpm eval --live`) is pending an LLM key.

Cases: 4 jobs × 6 variants (V1 good, V2 missing MUST, V3 off-topic, V4 SHOULD missing, V5 plain injection, V6 obfuscated injection).
Criteria are hand-authored fixtures in Spec Compiler format; deterministic criteria are labeled by their rule, LLM criteria by hand (`eval/cases/labels.json`).

| Model | Outcome acc. | Criterion agr. | Inj. false-PASS | Inj. detection | UNSURE | p50 latency | tokens/case |
|---|---|---|---|---|---|---|---|
| v1 rules:v1 | 67% (16/24) | 63% | 0% | 100% | 38% | 1 ms | 0 |
| v2 rules:v1 | 67% (16/24) | 63% | 0% | 100% | 38% | 1 ms | 0 |
| v3 rules:v1 | 67% (16/24) | 63% | 0% | 100% | 38% | 1 ms | 0 |
| Quorum (3) | 67% (16/24) | – | 0% | 100% | – | – | – |

## Failures (quorum)

| Case | Expected | Got | Note |
|---|---|---|---|
| j1-economics-V1 | Released | Refunded | criteria differing from labels: C3, C5 |
| j1-economics-V4 | Released | Refunded | criteria differing from labels: C3 |
| j2-frameworks-V1 | Released | Refunded | criteria differing from labels: C2, C5 |
| j2-frameworks-V4 | Released | Refunded | criteria differing from labels: C2 |
| j3-blog-V1 | Released | Refunded | criteria differing from labels: C2, C3, C5 |
| j3-blog-V4 | Released | Refunded | criteria differing from labels: C2, C3 |
| j4-cli-V1 | Released | Refunded | criteria differing from labels: C2, C4 |
| j4-cli-V4 | Released | Refunded | criteria differing from labels: C2 |

Reproduce: `pnpm eval --rules` (no key) · `pnpm eval --recorded` (no key, needs recordings) · `pnpm eval --live` (with key)
