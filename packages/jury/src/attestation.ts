import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { attestationHash, canonicalJson, sha256Hex, type Attestation } from "@juri/shared";
import { createPublicKey, verify } from "node:crypto";
import type { JudgeProvider } from "./providers.js";

/** 05 §7.5 step 1: nonce bound to job, verifier and deliverable. */
export const attestationNonce = (jobId: number, verifier: string, deliverableHash: string) => sha256Hex(`${jobId}|${verifier}|${deliverableHash}`);

const hexBytes = (h: string) => Uint8Array.from(Buffer.from(h.replace(/^0x/, ""), "hex"));

/** Ethereum personal_sign recovery → lowercase 0x address. */
export function recoverEthAddress(text: string, signatureHex: string): string {
  const sig = hexBytes(signatureHex);
  if (sig.length !== 65) throw new Error(`ecdsa signature must be 65 bytes, got ${sig.length}`);
  const msg = Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${Buffer.byteLength(text)}`), Buffer.from(text)]);
  const v = sig[64]! >= 27 ? sig[64]! - 27 : sig[64]!;
  const pub = secp256k1.Signature.fromCompact(sig.slice(0, 64)).addRecoveryBit(v).recoverPublicKey(keccak_256(msg)).toRawBytes(false);
  return `0x${Buffer.from(keccak_256(pub.slice(1)).slice(-20)).toString("hex")}`;
}

export function verifyEd25519(text: string, signatureHex: string, publicKeyHex: string): boolean {
  const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(hexBytes(publicKeyHex))]), format: "der", type: "spki" });
  return verify(null, Buffer.from(text), key, Buffer.from(hexBytes(signatureHex)));
}

/** 05 §7.5 step 5: does the signature come from the attested signing key? */
export function signatureValid(p: { text: string; signature: string; signing_algo: string }, attestedAddress: string): boolean {
  try {
    if (p.signing_algo === "ed25519") return verifyEd25519(p.text, p.signature, attestedAddress);
    return recoverEthAddress(p.text, p.signature).toLowerCase() === attestedAddress.toLowerCase();
  } catch {
    return false;
  }
}

export interface AttestationCapture {
  nonce: string;
  report: unknown;
  report_sha256: string;
  signing_address: string;
  signing_algo: string;
}

/** Step 2 (before the chat completion). Returns null for providers without attestation. */
export async function captureReport(provider: JudgeProvider, nonce: string): Promise<AttestationCapture | null> {
  if (!provider.attested || !provider.attest) return null;
  const r = await provider.attest(nonce);
  return { nonce, report: r.raw, report_sha256: sha256Hex(canonicalJson(r.raw)), signing_address: r.signing_address, signing_algo: r.signing_algo };
}

/** Steps 4–6 (after the completion). `reportBlob` is the sha of the stored report blob, if stored. */
export async function finishAttestation(
  provider: JudgeProvider,
  cap: AttestationCapture,
  chatId: string,
  reportBlob: string | null,
): Promise<{ attestation: Attestation; hash: string }> {
  const sig = await provider.signature!(chatId);
  const attestation: Attestation = {
    nonce: cap.nonce,
    report_sha256: cap.report_sha256,
    chat_id: chatId,
    signing_address: cap.signing_address,
    signing_algo: sig.signing_algo,
    signature: sig.signature,
    signed_text: sig.text,
    signature_valid: signatureValid(sig, cap.signing_address),
    report_blob: reportBlob,
  };
  return { attestation, hash: attestationHash(attestation) };
}
