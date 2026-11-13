import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeExecuteIntents, parseIntentMessage, SWAP_COUNTERPARTY } from "./intents.js";

const sample = JSON.parse(
  readFileSync(resolve(__dirname, "../../../docs/samples/nearblocks-escrow-txns.json"), "utf8").replace(/^﻿/, ""),
) as { txns: { actions: { args: string }[] }[] };

const wrap = (signer: string, intents: unknown[]) => ({
  signed: [{ payload: { message: JSON.stringify({ signer_id: signer, intents }) } }],
});

describe("decodeExecuteIntents", () => {
  it("decodes a real NearBlocks escrow tx (over-escaped message)", () => {
    const d = decodeExecuteIntents(sample.txns[0]!.actions[0]!.args);
    expect(d.errors).toEqual([]);
    expect(d.legs).toHaveLength(1);
    expect(d.legs[0]).toMatchObject({ intentType: "transfer", token: "nep141:wrap.near" });
    expect(d.legs[0]!.from).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles transfer with several tokens, ft_withdraw and token_diff", () => {
    const d = decodeExecuteIntents(
      wrap("escrow.ai.near", [
        { intent: "transfer", receiver_id: "bob.near", tokens: { "nep141:usdc": "10", "nep141:wrap.near": "5" }, memo: "job-1" },
        { intent: "ft_withdraw", token: "usdc", receiver_id: "alice.near", amount: "7" },
        { intent: "token_diff", diff: { "nep141:usdc": "-3", "nep141:wrap.near": "+2" } },
        { intent: "add_public_key", public_key: "ed25519:x" },
      ]),
    );
    expect(d.legs.map((l) => [l.from, l.to, l.token, l.amount, l.memo])).toEqual([
      ["escrow.ai.near", "bob.near", "nep141:usdc", "10", "job-1"],
      ["escrow.ai.near", "bob.near", "nep141:wrap.near", "5", "job-1"],
      ["escrow.ai.near", "alice.near", "nep141:usdc", "7", null],
      ["escrow.ai.near", SWAP_COUNTERPARTY, "nep141:usdc", "3", null],
      [SWAP_COUNTERPARTY, "escrow.ai.near", "nep141:wrap.near", "2", null],
    ]);
    expect(d.skipped).toEqual([{ signedIdx: 0, intentIdx: 3, intentType: "add_public_key" }]);
  });

  it("reports garbage instead of throwing", () => {
    expect(decodeExecuteIntents("not json").errors).toHaveLength(1);
    expect(decodeExecuteIntents({ signed: [{ payload: { message: "{{" } }] }).errors).toHaveLength(1);
  });

  it("parseIntentMessage unwraps nested escaping", () => {
    const inner = JSON.stringify({ signer_id: "a", intents: [] });
    expect(parseIntentMessage(JSON.stringify(JSON.stringify(inner)))).toEqual({ signer_id: "a", intents: [] });
  });
});
