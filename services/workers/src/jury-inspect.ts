import "./load-env.js";
import { ContractJobSchema, EvidenceSchema, formatNear } from "@juri/shared";
import { resolve } from "node:path";
import { getBlob } from "./blobs.js";
import { openDb, REPO_ROOT } from "./db/index.js";
import { view, viewer } from "./near.js";

/** pnpm --filter @juri/workers jury:inspect <job_id> — on-chain result + each juror's evidence/attestation. */
const id = Number(process.argv[2]);
const job = ContractJobSchema.parse(await view(await viewer(), "get_job", { job_id: id }));
console.log(`#${id} ${job.status}/${job.outcome ?? "-"} criteria_result=[${job.criteria_result}] injection_flagged=${job.injection_flagged}`);
if (job.settlement) console.log(`  worker ${formatNear(job.settlement.to_worker)} · requester ${formatNear(job.settlement.to_requester)} · jury pool ${formatNear(job.settlement.jury_pool, 6)}`);
const db = openDb();
const dir = resolve(REPO_ROOT, process.env.BLOB_DIR ?? "data/blobs");
for (const r of job.reveals) {
  let line = `  ${r.verifier.split(".")[0]} ${r.model} [${r.verdicts}] inj=${r.injection_flag} att_hash=${r.attestation_hash ? `${r.attestation_hash.slice(0, 12)}…` : "null"}`;
  try {
    const ev = EvidenceSchema.parse(JSON.parse(getBlob(db, dir, r.evidence_hash).bytes.toString("utf8")));
    const a = ev.attestation;
    line += a ? ` attested=${a.signature_valid} (${a.signing_algo} ${a.signing_address.slice(0, 10)}…)` : " attested=no";
    if (ev.error) line += ` error="${ev.error.slice(0, 80)}"`;
    const reasons = ev.verdicts.filter((v) => v.source === "llm").map((v) => `${v.id}:${v.verdict}`).join(" ");
    line += ` llm: ${reasons}`;
  } catch (e) {
    line += ` (evidence not local: ${e instanceof Error ? e.message : e})`;
  }
  console.log(line);
}
db.$client.close();
