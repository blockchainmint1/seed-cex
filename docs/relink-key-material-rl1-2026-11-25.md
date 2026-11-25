# Seeds — RL1 equivalent public-key re-link review

Date: 2026-11-25
Baseline reviewed by the auditor: `f470cd44a6f1c82189d9d4657d5855a877608777`
Scope: Bobby approved correcting RL1 only. This change is not published and needs independent review before publishing.

## Summary

HME Wallet re-linking compares parsed account public material instead of raw text. A recognised encoding change can refresh the same pocket; a different wallet is still refused. No database migration, new permission, Telegram change, withdrawal-rule change, key-unlock change or coin send is included.

## Implementation and review points

- `src/lib/hme-link.server.ts`: `sameLinkedPublicKey` compares BIP32 public key **and chain code**, Cardano's complete public key/chain-code bytes, Solana's public bytes, or the existing validated address for XMR/XLM/TON/SUI. If parsing fails, the fallback is exact original-string equality, not an automatic match. Public-versus-private extended key inputs are not treated as equivalent.
- BIP32 validation recognises only the listed public versions: xpub, ypub, zpub, Ypub, Zpub, Ltub and Mtub. Base58Check is verified, length must be 78 bytes, and the existing HDKey parser checks the payload. Unknown versions and damaged checksums remain rejected by submit validation. Testnet versions are not added.
- Version bytes do not choose Seeds' receive script: the existing coin address encoder does. The canonical public representation is a standard xpub. This is necessary because downstream address readers already understand standard xpubs; accepting a ypub in the comparator but storing it verbatim could otherwise break those readers.
- `canonicalLinkedPublicKey` is used on HME submit inputs: recognised BIP32 public encodings become xpub; Cardano hex becomes lowercase; Monero public-key hex becomes its validated primary address. SOL/XLM/TON/SUI retain the existing pinned formats. This does not expand TON/Sui formats or change their derivation.
- `src/lib/hme-link-rules.ts`: `replaceProblem` accepts an optional key comparator. Its default remains exact-string equality, so callers that do not supply it retain their previous behaviour. Only HME Wallet submit supplies the parsed comparator; coin/wallet sign-in replacement rules are untouched.
- `src/routes/api/public/hme-link/submit.ts`: input validation and canonicalisation occur without persistence. The replacement decision still follows signature verification and precedes opening the sealed payload, consuming the challenge, or retiring the old link. A different-wallet refusal therefore changes no saved wallet or challenge state.
- A matched public half must still match the submitted private half through the existing `checkXprvMatches` check before anything is stored. Canonicalisation does not alter the sealed payload or signed message.
- All existing pocket-1106, dropped-coin, instant-access/approve, source and identity-clash checks remain in place. No historical link rows or stored keys are rewritten by this change.
- A private extended key in the public field now fails HME submit validation rather than being copied into a public column. This is an intentional consequence of canonicalising only public material.

## Regression verification

New `src/lib/hme-link-key-material.test.ts` uses deterministic public test fixtures, never member keys. It checks:

- Every listed alternative BIP32 public encoding is accepted as the same pocket in both directions; its canonical encoding is the original xpub, its receive address is unchanged, and the existing private/public-half check still passes.
- Different public keys and different chain codes are refused; a second coin cannot change while the first is merely re-encoded.
- Another pocket number and dropped coins remain refused.
- Unparseable strings retain exact equality; corruption, unknown versions and a private key in the public field are rejected.
- Cardano hex letter case and Monero primary-address/public-key-hex equivalence preserve the pocket, while different valid wallets are refused.
- SOL, XLM, TON and SUI preserve their addresses and reject another valid wallet as well as malformed inputs.

Focused link/pocket/handoff suites: 97 passed, 0 failed.
Full regression suite: 1,639 passed, 0 failed (130 files).
Preview diagnostics: build OK. No separate manual typecheck was run.

## Not yet verified / required next step

A live HME Wallet re-link was not performed: completing it needs the owner's wallet signature and would retire an active link. The tests exercise the actual comparator, replacement rules, canonical storage encoding and address derivation without touching production accounts. The auditor should check the HME submit wiring and signature/challenge ordering, then the owner should try an ordinary same-wallet re-link and confirm all existing addresses remain unchanged. A supported re-encoded test-wallet submission should likewise keep addresses unchanged; a different wallet must receive a 409 with the challenge and old link untouched.

The baseline clearance does not automatically cover this new change. No publishing action was taken.