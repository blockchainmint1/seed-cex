# Seeds' HME Vault request signing key — public release record

> **November 23, 2026 — moving into AWS KMS (Bobby's decision, auditor V1).** Before any Vault app pins a key, Seeds is
> replacing the key below with one held in **AWS KMS** (Ed25519, `ECC_NIST_EDWARDS25519`, `SIGN_VERIFY`). Its private half
> never leaves AWS and every signature is logged by AWS. New id: **`seeds-vault-kms-2026-11`**. Its public key and
> fingerprint are filled in below once the key is created, and the live endpoint shows `key_storage: "AWS KMS"`.
> **Do not pin `seeds-vault-2026-11`.** Pin only `seeds-vault-kms-2026-11`, checked the four ways below.
>
> | Field | Value |
> |---|---|
> | `signing_key_id` | `seeds-vault-kms-2026-11` |
> | Public key | _pending — published after the AWS key is created_ |
> | SHA-256 fingerprint | _pending_ |
> | Where the private key lives | AWS KMS, us-east-1 (server setting `SEEDS_VAULT_KMS_KEY`); Seeds signs through the shared `seeds-lock-signer` AWS login |
> | Status | next (replaces `seeds-vault-2026-11`, which is retired as soon as this one is live) |
>
> Seeds signs each sign-in's Vault request **once** and stores it on that request, so a reloaded manifest never asks AWS again.
> Seeds also checks every AWS signature against the public key before publishing it.

This is the **public** half of the key Seeds uses to sign HME Vault link requests (signed-request v2).
Seeds Key and HME Vault pin it in their own source. They never fetch it, and they never take it from a QR.
The private half exists only as the server-only secret `SEEDS_VAULT_REQUEST_SIGNING_SEED`. It is not in this repository, in any browser output or in any audit file.

| Field | Value |
|---|---|
| Algorithm | Ed25519 (plain, not Ed25519ph) |
| `signing_key_id` | `seeds-vault-2026-11` |
| Public key (base64url, no padding, 32 bytes) | `KuDdTWX-bDwxkSff2lULKVwvUS_Dfa0tZLy_iWefuxc` |
| SHA-256 fingerprint of the 32 decoded bytes | `b81366bf60017f6ce50379f3dea1868c18c311bec9ba31292116e6552163307c` |
| Status | being retired (November 23, 2026) — replaced by the AWS KMS key above before any app pinned it |
| Signed bytes | `vaultRequestBytes` in `src/lib/key-signin/vault-protocol.ts`, a verbatim copy of Seeds Key's `src/lib/seeds-key/vault-protocol.ts` (SHA-256 `fa3d955bae6c947b83d1bea2b7200aad956e061baeb03f4b975ba0591d1379a9`) |

Pin it as:

```ts
export const SEEDS_REQUEST_KEYS: RequestTrust = Object.freeze({
  "seeds-vault-2026-11": "KuDdTWX-bDwxkSff2lULKVwvUS_Dfa0tZLy_iWefuxc",
});
```

## How to check it independently before pinning

Pin only when **all** of these agree, character for character:

1. **This file in the Seeds code repository**, at or after commit `04abb28`, viewed through the repository host, not a copy pasted from chat.
2. **The live Seeds site** (once published): `https://seeds.honest.money/api/public/key-signin/vault-signer` shows the same id, public key and fingerprint. Vault never calls this; a person checks it in a browser.
3. **Bobby reads the fingerprint aloud** (or sends it from his own device) to whoever pins it. Check at least the first and last 8 characters: `b81366bf … 2163307c`.
4. **Recompute the fingerprint** yourself: base64url-decode the public key (32 bytes) and SHA-256 the bytes.

## Signed public example (test fixture)

Signed with the production key above. It is deliberately harmless:
- Expired on January 1, 2026.
- Its recipient is a random public key whose private half was thrown away, so nobody can open anything sealed to it.
- Its challenge matches no Seeds sign-in.

Verify it with `readSignedVaultRequest(example, SEEDS_REQUEST_KEYS, Date.parse("2026-01-01T00:05:00.000Z"))`. With the real clock it must be refused as expired.

```json
{
  "type": "hm-seeds-key-vault-request",
  "v": 2,
  "signing_key_id": "seeds-vault-2026-11",
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
  "request_sig": "aSLdBvjd3AiIFXfA8jUEJeGxUdUAnIr6SgnQ8vmJCCk5zF3NL4zMb_UskaVoqjEiyEFzW3_7zJb-O07880C4DQ"
}
```

## When Seeds includes a Vault request

`vault_request` appears inside the normal sign-in manifest (`/api/public/key-signin/manifest/{id}`) only when:
- the request is served from `seeds.honest.money` with Seeds Key at `key.seeds.honest.money`;
- the pocket is 1106;
- the signer is set: the AWS KMS key (`SEEDS_VAULT_KMS_KEY`, which always wins), or until then the old secret. A KMS key set without the AWS login means no Vault requests, never a quiet fallback.

Previews never carry one. Its `domain`, `key_host`, `challenge_id`, `challenge`, `recipient_pubkey`, `pocket`, `issued_at` and `expires_at` equal the manifest's own fields. Its timestamps are canonical `toISOString()` with milliseconds and `Z`. The lifetime is exactly 10 minutes, with issue and expiry taken from one clock reading. The paths are the 16 ordered pocket-1106 paths. Coin, wallet and Ledger sign-in are unchanged.

## Rotation

1. Generate a new server-only secret under a new name. Give the new key a new id (for example `seeds-vault-2027-xx`). Do not change `VAULT_SIGNER_LABEL`.
2. Publish the new public key in this file (new row, status "next") and on the live endpoint. Check it the same four ways.
3. Ship Seeds Key and HME Vault releases that trust **both** ids. Wait for an audited overlap, long enough for offline Vault phones to update.
4. Switch Seeds to sign with the new id. Then ship Key and Vault releases that drop the old id, and mark it "retired" here.
5. If a key is compromised, stop signing with it immediately. Ship Key and Vault updates that remove it. Offline Vault phones keep trusting it until updated, so tell members to update before linking.
