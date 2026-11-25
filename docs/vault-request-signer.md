# Seeds' HME Vault request signing key — public release record

This is the **public** half of the key Seeds uses to sign HME Vault link requests (signed-request v2).
Seeds Key and HME Vault pin it in their own source. They never fetch it, and they never take it from a QR.

## Active key (AWS KMS) — pin this one

Since November 23, 2026 (Bobby's decision, auditor V1) the key lives in **AWS KMS** (Ed25519, `ECC_NIST_EDWARDS25519`,
`SIGN_VERIFY`, `ED25519_SHA_512`, `MessageType: RAW`). Its private half never leaves AWS and every signature is logged by AWS.
The server setting `SEEDS_VAULT_KMS_KEY` names the key; Seeds signs through the shared `seeds-lock-signer` AWS login,
which may only `kms:Sign` and `kms:GetPublicKey` on this one key.

| Field | Value |
|---|---|
| Algorithm | Ed25519 (plain, not Ed25519ph) |
| `signing_key_id` | `seeds-vault-kms-2026-11` |
| Public key (base64url, no padding, 32 bytes) | `6_06ZOHGeDeGX7O1ToRTAmdiGs0_AOSSX70VbTd9IjA` |
| SHA-256 fingerprint of the 32 decoded bytes | `0556577f852b0cf2a05a1c75ecbf806e6657ce193393d9e800137b6537c86d4d` |
| Where the private key lives | AWS KMS (Seeds' AWS account; the exact key is named only in the server setting) |
| Status | active |
| Signed bytes | `vaultRequestBytes` in `src/lib/key-signin/vault-protocol.ts`, a verbatim copy of Seeds Key's `src/lib/seeds-key/vault-protocol.ts` (SHA-256 `1329b5a87994ec56fbacad19d71fefe27dffc4dca5e16e18306091cdf67107bb`) |

Pin it as:

```ts
export const SEEDS_REQUEST_KEYS: RequestTrust = Object.freeze({
  "seeds-vault-kms-2026-11": "6_06ZOHGeDeGX7O1ToRTAmdiGs0_AOSSX70VbTd9IjA",
});
```

Seeds signs each sign-in's Vault request **once** and stores it on that request, so a reloaded manifest never asks AWS again.
Seeds also checks every AWS signature against the public key before using it.

## Retired key — do not pin

| Field | Value |
|---|---|
| `signing_key_id` | `seeds-vault-2026-11` |
| Public key | `KuDdTWX-bDwxkSff2lULKVwvUS_Dfa0tZLy_iWefuxc` |
| SHA-256 fingerprint | `b81366bf60017f6ce50379f3dea1868c18c311bec9ba31292116e6552163307c` |
| Status | retired November 23, 2026, before any app pinned it. Seeds no longer signs with it once `SEEDS_VAULT_KMS_KEY` is set. |

## How to check it independently before pinning

Pin only when **all** of these agree, character for character:

1. **This file in the Seeds code repository**, in the version that lists `seeds-vault-kms-2026-11` as active, viewed through the repository host, not a copy pasted from chat.
2. **The live Seeds site** (once published): `https://seeds.honest.money/api/public/key-signin/vault-signer` shows the same id, public key and fingerprint. Vault never calls this; a person checks it in a browser.
3. **Bobby reads the fingerprint aloud** (or sends it from his own device) to whoever pins it. Check at least the first and last 8 characters: `0556577f … 37c86d4d`.
4. **Recompute the fingerprint** yourself: base64url-decode the public key (32 bytes) and SHA-256 the bytes.

## Signed public example (test fixture)

Signed with the active AWS KMS key above (`seeds-vault-kms-2026-11`). It is deliberately harmless:
- Expired on January 1, 2026.
- Its recipient is a random public key whose private half was thrown away, so nobody can open anything sealed to it.
- Its challenge matches no Seeds sign-in.

Verify it with `readSignedVaultRequest(example, SEEDS_REQUEST_KEYS, Date.parse("2026-01-01T00:05:00.000Z"))`. With the real clock it must be refused as expired.

**Which copy it passes (auditor N3):** the example lists the original 16 paths, so it passes against
`vault-protocol.ts` as shipped up to and including Seeds commit `6d5195c` (November 25, 2026). Seeds
commit `21c77f7` added Stellar, TON and Sui (19 paths), and from that version on the example is
refused for missing paths — its signature still verifies, but the path list no longer covers every
coin that copy knows. Re-signing a fresh example would need the live KMS key, so this note stands
instead; Key and Vault should test their current copy against a live 10-minute request.

```json
{
  "type": "hm-seeds-key-vault-request",
  "v": 2,
  "signing_key_id": "seeds-vault-kms-2026-11",
  "domain": "seeds.honest.money",
  "key_host": "key.seeds.honest.money",
  "challenge_id": "00000000000000000000000000000001",
  "challenge": "000000000000000000000000000000000000000000000001",
  "recipient_pubkey": "3EqsiBghHmyfs5TMsNBdKbJKEbo95DJM5WdhNDEQqWo",
  "pocket": 1106,
  "issued_at": "2026-01-01T00:00:00.000Z",
  "expires_at": "2026-01-01T00:10:00.000Z",
  "paths": [
    "m/44'/696969'/1106'",
    "m/44'/969696'/1106'",
    "m/84'/0'/1106'",
    "m/44'/2'/1106'",
    "m/44'/60'/1106'",
    "m/44'/3'/1106'",
    "m/44'/145'/1106'",
    "m/44'/133'/1106'",
    "m/44'/144'/1106'",
    "m/44'/195'/1106'",
    "m/44'/501'/1106'/0'",
    "m/44'/5'/1106'",
    "m/44'/118'/1106'",
    "m/44'/931'/1106'",
    "m/1852'/1815'/1106'",
    "m/44'/128'/1106'"
  ],
  "request_sig": "FUn5Jqz5FFupj8BucCnR4St3AoVYvzAamzSWU9tqYMtLKV-wIuI3beuWfaS_mPsOPWqJ2qZdrFZzQRNOgpW6Aw"
}
```

## When Seeds includes a Vault request

`vault_request` appears inside the normal sign-in manifest (`/api/public/key-signin/manifest/{id}`) only when:
- the request is served from `seeds.honest.money` with Seeds Key at `key.seeds.honest.money`;
- the pocket is 1106;
- the signer is set: the AWS KMS key (`SEEDS_VAULT_KMS_KEY`, which always wins). A KMS key set without the AWS login means no Vault requests, never a quiet fallback.

Previews never carry one. Its `domain`, `key_host`, `challenge_id`, `challenge`, `recipient_pubkey`, `pocket`, `issued_at` and `expires_at` equal the manifest's own fields. Its timestamps are canonical `toISOString()` with milliseconds and `Z`. The lifetime is exactly 10 minutes, with issue and expiry taken from one clock reading. The paths are the 16 ordered pocket-1106 paths. Coin, wallet and Ledger sign-in are unchanged.

## Rotation

1. Create a new AWS KMS Ed25519 key (grant `seeds-lock-signer` only `kms:Sign` + `kms:GetPublicKey` on it). Give it a new id (for example `seeds-vault-2027-xx`). Do not change `VAULT_SIGNER_LABEL`.
2. Publish the new public key in this file (new row, status "next") and on the live endpoint. Check it the same four ways.
3. Ship Seeds Key and HME Vault releases that trust **both** ids. Wait for an audited overlap, long enough for offline Vault phones to update.
4. Switch Seeds to sign with the new id. Then ship Key and Vault releases that drop the old id, and mark it "retired" here.
5. If a key is compromised, stop signing with it immediately. Ship Key and Vault updates that remove it. Offline Vault phones keep trusting it until updated, so tell members to update before linking.

## Paths list (Nov 25 2026, auditor HK3)
Vault accepts any list of well-formed pocket-1106 paths with no duplicates that includes every coin its own copy knows. A newer Seeds may ask for more coins (e.g. Stellar, TON, Sui); Vault derives only the coins it knows. **Vault and Seeds Key must ship this version of `vault-protocol.ts` before Seeds adds any coin.**
