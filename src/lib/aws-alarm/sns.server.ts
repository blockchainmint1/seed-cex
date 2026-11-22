/**
 * Checks an Amazon SNS message really came from SNS: the signing certificate is fetched only
 * from sns.<region>.amazonaws.com over https, its public key is read out of the certificate,
 * and the signature over snsStringToSign is checked with WebCrypto (works on Workers).
 */
import { isSnsUrl, snsHashFor, snsStringToSign, type SnsMessage } from "./sns";

/** Finished certificate keys only (never a pending promise; see src/lib/AGENTS.md). */
const keyCache = new Map<string, { der: Uint8Array<ArrayBuffer>; at: number }>();

function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** One DER element at `off`: where its contents start and where it ends. */
function tlv(buf: Uint8Array, off: number): { tag: number; start: number; end: number } {
  const tag = buf[off]!;
  let len = buf[off + 1]!;
  let start = off + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4) throw new Error("bad DER length");
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | buf[start + i]!;
    start += n;
  }
  const end = start + len;
  if (end > buf.length) throw new Error("DER runs past the end");
  return { tag, start, end };
}

/** SubjectPublicKeyInfo out of an X.509 certificate (tbsCertificate field 7, or 6 without a version). */
export function spkiFromCert(der: Uint8Array): Uint8Array<ArrayBuffer> {
  const cert = tlv(der, 0);
  const tbs = tlv(der, cert.start);
  let off = tbs.start;
  if (der[off] === 0xa0) off = tlv(der, off).end; // [0] version
  for (let i = 0; i < 5; i++) off = tlv(der, off).end; // serial, signature alg, issuer, validity, subject
  const spki = tlv(der, off);
  if (spki.tag !== 0x30) throw new Error("no public key in certificate");
  return new Uint8Array(der.slice(off, spki.end));
}

async function certSpki(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const hit = keyCache.get(url);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.der;
  // Workers reject the "error" redirect mode; "manual" + the ok check below refuses any redirect the same way.
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: "manual" });
  if (!res.ok) throw new Error(`certificate fetch ${res.status}`);
  const pem = await res.text();
  if (pem.length > 10_000 || !pem.includes("BEGIN CERTIFICATE")) throw new Error("not a certificate");
  const der = spkiFromCert(pemToDer(pem));
  keyCache.set(url, { der, at: Date.now() });
  return der;
}

export async function verifySnsSignature(m: SnsMessage): Promise<boolean> {
  const hash = snsHashFor(m.SignatureVersion);
  if (!hash || !isSnsUrl(m.SigningCertURL, "cert")) return false;
  try {
    const spki = await certSpki(m.SigningCertURL);
    const key = await crypto.subtle.importKey("spki", spki, { name: "RSASSA-PKCS1-v1_5", hash }, false, ["verify"]);
    const sig = Uint8Array.from(atob(m.Signature), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, new TextEncoder().encode(snsStringToSign(m)));
  } catch (e) {
    console.error("[aws-alarm] signature check failed", e instanceof Error ? e.message : e);
    return false;
  }
}
