/**
 * Decoder for NEAR Intents `execute_intents` calls (intents.near) relayed by escrow.ai.near.
 * Turns one transaction's args into flat token legs. Pure: no I/O.
 *
 * Supported intent types (others are reported in `skipped`):
 *   transfer      { receiver_id, tokens: {token: amount}, memo? }      signer → receiver
 *   ft_withdraw   { token, receiver_id, amount, memo? }               signer → receiver (leaves intents)
 *   native_withdraw { receiver_id, amount }                           signer → receiver (NEAR)
 *   mt_withdraw   { token, receiver_id, token_ids[], amounts[] }       signer → receiver
 *   token_diff    { diff: {token: "+n" | "-n"} }                       swap against a solver
 */

export interface IntentLeg {
  signedIdx: number;
  intentIdx: number;
  intentType: string;
  signer: string;
  from: string;
  to: string | null;
  token: string;
  amount: string; // raw base units, no sign
  memo: string | null;
}

export interface DecodedIntents {
  legs: IntentLeg[];
  signers: string[];
  skipped: { signedIdx: number; intentIdx: number; intentType: string }[];
  errors: string[];
}

/** Pseudo-account used as the counterparty of a `token_diff` (solver side is not in the payload). */
export const SWAP_COUNTERPARTY = "intents:swap";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);

/**
 * The NEP-413 `payload.message` is a JSON string. NearBlocks sometimes returns it with extra
 * layers of backslash escaping, so unescape until it parses.
 */
export function parseIntentMessage(raw: unknown): Json | null {
  if (isObj(raw)) return raw;
  if (typeof raw !== "string") return null;
  let s = raw;
  for (let i = 0; i < 6; i++) {
    try {
      const v: unknown = JSON.parse(s);
      if (isObj(v)) return v;
      if (typeof v === "string") {
        s = v;
        continue;
      }
      return null;
    } catch {
      const next = s.replace(/\\+"/g, '"').replace(/\\\\/g, "\\");
      if (next === s) return null;
      s = next;
    }
  }
  return null;
}

/** `args` is the function-call args object (or its JSON string) of `execute_intents`. */
export function decodeExecuteIntents(args: unknown): DecodedIntents {
  const out: DecodedIntents = { legs: [], signers: [], skipped: [], errors: [] };
  let a: unknown = args;
  if (typeof a === "string") {
    try {
      a = JSON.parse(a);
    } catch {
      out.errors.push("args: not JSON");
      return out;
    }
  }
  if (!isObj(a) || !Array.isArray(a.signed)) {
    out.errors.push("args: no signed[]");
    return out;
  }
  a.signed.forEach((s: unknown, signedIdx: number) => {
    const payload = isObj(s) && isObj(s.payload) ? s.payload : null;
    const msg = parseIntentMessage(payload?.message);
    if (!msg) {
      out.errors.push(`signed[${signedIdx}]: message not parseable`);
      return;
    }
    const signer = str(msg.signer_id) ?? "";
    out.signers.push(signer);
    const intents = Array.isArray(msg.intents) ? msg.intents : [];
    intents.forEach((it: unknown, intentIdx: number) => {
      if (!isObj(it)) return;
      const intentType = str(it.intent) ?? "unknown";
      const memo = str(it.memo);
      const base = { signedIdx, intentIdx, intentType, signer, memo };
      const leg = (from: string, to: string | null, token: string, amount: string) =>
        out.legs.push({ ...base, from, to, token, amount });
      switch (intentType) {
        case "transfer": {
          const to = str(it.receiver_id);
          if (isObj(it.tokens)) for (const [tok, amt] of Object.entries(it.tokens)) leg(signer, to, tok, str(amt) ?? "0");
          break;
        }
        case "ft_withdraw": {
          const tok = str(it.token);
          if (tok) leg(signer, str(it.receiver_id), `nep141:${tok}`, str(it.amount) ?? "0");
          break;
        }
        case "native_withdraw":
          leg(signer, str(it.receiver_id), "native:near", str(it.amount) ?? "0");
          break;
        case "mt_withdraw": {
          const ids = Array.isArray(it.token_ids) ? it.token_ids : [];
          const amts = Array.isArray(it.amounts) ? it.amounts : [];
          ids.forEach((id, i) => leg(signer, str(it.receiver_id), `nep245:${str(it.token)}:${str(id)}`, str(amts[i]) ?? "0"));
          break;
        }
        case "token_diff": {
          if (isObj(it.diff))
            for (const [tok, d] of Object.entries(it.diff)) {
              const v = str(d) ?? "0";
              if (v.startsWith("-")) leg(signer, SWAP_COUNTERPARTY, tok, v.slice(1));
              else leg(SWAP_COUNTERPARTY, signer, tok, v.replace(/^\+/, ""));
            }
          break;
        }
        default:
          out.skipped.push({ signedIdx, intentIdx, intentType });
      }
    });
  });
  return out;
}
