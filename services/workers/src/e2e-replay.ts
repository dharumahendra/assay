import { RecordedProvider, type CompletionRequest, type JudgeProvider } from "@juri/jury";
import { sha256Hex } from "@juri/shared";
import { join } from "node:path";

export interface ReplayCase {
  /** eval case id, e.g. "j1-economics-V1" (eval/recorded/<id>/<label>.json) */
  id: string;
  deliverable: string;
}

/**
 * RECORDED juror for the runner (NFR-REPRO-1): replays the live eval recordings in eval/recorded/ so the
 * whole on-chain lifecycle runs without an LLM key.
 *
 * The eval judged each case as verifier "<label>.eval" with a fixed delimiter nonce; the runner uses the
 * real juror account and a random nonce. Exactly those two strings are rewritten before the request is
 * handed to RecordedProvider. Everything else (criteria, deterministic facts, pre-scan, deliverable) must
 * match the recording byte for byte, otherwise RecordedProvider rejects it as recorded for a different prompt.
 *
 * The juror's label is the first part of its account ("v1.juri.sandbox" → "v1").
 */
export function replayProvider(recordedDir: string, cases: ReplayCase[], verifier: string): JudgeProvider {
  if (!cases.length) throw new Error("replay: no cases");
  const label = verifier.split(".")[0]!;
  const recording = (caseId: string) => new RecordedProvider(join(recordedDir, caseId, `${label}.json`));
  const model = recording(cases[0]!.id).model;
  return {
    id: "recorded",
    model,
    attested: false,
    async complete(req: CompletionRequest) {
      const m = /<<<DELIVERABLE ([0-9a-f]+)>>>\n([\s\S]*)\n<<<END \1>>>$/.exec(req.user);
      if (!m) throw new Error("replay: no deliverable delimiters in the prompt");
      const text = m[2]!;
      const c = cases.find((x) => x.deliverable === text);
      if (!c) throw new Error("replay: the deliverable is not one of the recorded cases");
      const head = `You are verifier ${verifier} on`;
      if (!req.system.startsWith(head)) throw new Error(`replay: system prompt is not for ${verifier}`);
      const nonce = sha256Hex(`${c.id}|${label}`).slice(0, 24);
      const system = `You are verifier ${label}.eval on${req.system.slice(head.length)}`;
      const user = `${req.user.slice(0, m.index)}<<<DELIVERABLE ${nonce}>>>\n${text}\n<<<END ${nonce}>>>`;
      return recording(c.id).complete({ ...req, system, user });
    },
  };
}
