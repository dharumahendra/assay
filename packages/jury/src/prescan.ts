import type { Prescan } from "@juri/shared";

/**
 * Deterministic prompt-injection pre-scan (05 §7.2, FR-E5). Same result goes to every verifier as a fact;
 * the C0 verdict stays with the verifiers. `injection_flag = prescan.flagged || verifier.injection_suspected`.
 */

type HitType = Prescan["hits"][number]["type"];

const INSTRUCTION_PATTERNS: RegExp[] = [
  /\bignore\s+(all|any|previous|prior|the\s+above|earlier|your)\b[^.\n]{0,40}\b(instructions?|rules?|prompts?|criteria)\b/i,
  /\bignore\s+(all\s+)?(previous|prior|the\s+above)\b/i,
  /\bas\s+an?\s+(ai|llm|language\s+model|evaluator|judge|verifier|grader|reviewer)\b/i,
  /\b(mark|rate|approve|grade|score|judge|evaluate)\b[^.\n]{0,30}\b(pass(ed|ing)?|approved?|accept(ed)?|full\s+marks|10\s*\/\s*10|perfect)\b/i,
  /\bsystem\s+prompt\b/i,
  // addressing the jury at the start of a line/sentence ("Evaluator: …", "Dear judges, …"), not "a neutral judge, refunds…"
  /(?:^|[\n.!?>]\s*|\bdear\s+|\bhey\s+|\bto\s+the\s+)(?:ai\s+)?(evaluators?|judges?|verifiers?|graders?|reviewers?|ai\s+(reviewers?|systems?|models?)|llms?)\s*[:,]\s*\S/im,
  /\b(note|message|instructions?)\s+(to|for)\s+(the\s+)?(ai|llm|evaluators?|judges?|verifiers?|graders?|reviewers?)\b/i,
  /\byou\s+(must|should|will)\s+(now\s+)?(output|respond|answer|return|say)\b/i,
];
const COMMAND_VERBS = /\b(ignore|mark|rate|approve|pass|output|respond|return|say|grade|score|evaluat\w*|judge|verif\w*|instruct\w*|disregard|override|must|treat)\b/i;
const HIDDEN_CHARS = /[​-‏‪-‮⁠-⁤﻿]/g;
const HIDDEN_HTML = /<[^>]+style\s*=\s*["'][^"']*(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|color\s*:\s*(#fff(fff)?\b|white\b|transparent))[^"']*["'][^>]*>/gi;
const BASE64 = /[A-Za-z0-9+/]{200,}={0,2}/g;
const MORSE = /(?:[.\-·–—]{1,6}(?: \/ | {1,3}|\/)){12,}[.\-·–—]{1,6}/g;
const HEX_LONG = /\b(?:[0-9a-fA-F]{2}[\s:]?){60,}\b|(?:\\x[0-9a-fA-F]{2}){16,}/g;
const HTML_COMMENT = /<!--([\s\S]*?)-->/g;

const MORSE_TABLE: Record<string, string> = {
  ".-": "a", "-...": "b", "-.-.": "c", "-..": "d", ".": "e", "..-.": "f", "--.": "g", "....": "h", "..": "i", ".---": "j",
  "-.-": "k", ".-..": "l", "--": "m", "-.": "n", "---": "o", ".--.": "p", "--.-": "q", ".-.": "r", "...": "s", "-": "t",
  "..-": "u", "...-": "v", ".--": "w", "-..-": "x", "-.--": "y", "--..": "z", "-----": "0", ".----": "1", "..---": "2",
  "...--": "3", "....-": "4", ".....": "5", "-....": "6", "--...": "7", "---..": "8", "----.": "9",
};

export function decodeMorse(s: string): string {
  return s
    .replace(/[·]/g, ".")
    .replace(/[–—]/g, "-")
    .split(/\s*\/\s*|\s{2,}/)
    .map((word) => word.trim().split(/\s+/).map((c) => MORSE_TABLE[c] ?? "?").join(""))
    .join(" ");
}

const printableRatio = (s: string) => (s.length ? (s.match(/[\x20-\x7e\n\r\t]/g) ?? []).length / s.length : 0);
const looksLikeInstruction = (s: string) => INSTRUCTION_PATTERNS.some((p) => p.test(s)) || /\b(pass|evaluator|judge|verifier|ignore|approve)\b/i.test(s);

const excerpt = (text: string, offset: number, len: number) =>
  text
    .slice(Math.max(0, offset - 10), offset + Math.min(len, 110))
    .replace(HIDDEN_CHARS, (c) => `<U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}>`)
    .replace(/\s+/g, " ")
    .slice(0, 120);

export function prescan(text: string): Prescan {
  const hits: Prescan["hits"] = [];
  const add = (type: HitType, offset: number, len: number, note?: string) => {
    if (hits.length >= 50 || hits.some((h) => h.type === type && Math.abs(h.offset - offset) < 5)) return;
    const ex = note ? `${note}: ${excerpt(text, offset, len)}` : excerpt(text, offset, len);
    hits.push({ type, excerpt: ex.slice(0, 120), offset });
  };

  for (const p of INSTRUCTION_PATTERNS)
    for (const m of text.matchAll(new RegExp(p.source, `${p.flags.replace("g", "")}g`))) add("evaluator_instruction", m.index!, m[0].length);

  const zw = [...text.matchAll(HIDDEN_CHARS)];
  if (zw.length) add("hidden_chars", zw[0]!.index!, 1, `${zw.length} invisible char(s)`);

  for (const m of text.matchAll(HIDDEN_HTML)) add("hidden_html", m.index!, m[0].length);

  for (const m of text.matchAll(HTML_COMMENT)) if (COMMAND_VERBS.test(m[1] ?? "")) add("html_comment", m.index!, m[0].length);

  for (const m of text.matchAll(BASE64)) {
    let decoded = "";
    try {
      decoded = Buffer.from(m[0], "base64").toString("utf8");
    } catch {
      /* ignore */
    }
    // Only payloads that decode to readable text are suspicious; binary blobs (images, keys) are not.
    if (printableRatio(decoded) > 0.9) add("base64_payload", m.index!, 60, `decodes to "${decoded.slice(0, 40)}"`);
  }

  for (const m of text.matchAll(MORSE)) {
    const decoded = decodeMorse(m[0]);
    if ((decoded.match(/[a-z0-9]/g) ?? []).length >= 8) add("morse_payload", m.index!, 60, `decodes to "${decoded.slice(0, 40)}"`);
  }

  for (const m of text.matchAll(HEX_LONG)) {
    const hex = m[0].startsWith("\\x") ? m[0].replace(/\\x/g, "") : m[0].replace(/[\s:]/g, "");
    const decoded = Buffer.from(hex, "hex").toString("utf8");
    if (printableRatio(decoded) > 0.9 && looksLikeInstruction(decoded)) add("hex_payload", m.index!, 60, `decodes to "${decoded.slice(0, 40)}"`);
  }

  hits.sort((a, b) => a.offset - b.offset);
  return { flagged: hits.length > 0, hits };
}
