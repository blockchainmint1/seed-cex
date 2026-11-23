/** Optional, independently signed display metadata; never an account identity or key input. */
export type VaultLabel = {
  vault_fingerprint: string;
  vault_label_signature: string;
};

/** Fixed JSON tuple binds the label to the complete, already signed handoff text. */
export function vaultLabelMessage(message: string, fingerprint: string): string {
  if (!/^[0-9a-f]{8}$/.test(fingerprint))
    throw new Error("The Vault seed ID must be eight lowercase hexadecimal characters.");
  return JSON.stringify(["HME Vault seed label", 1, message, fingerprint]);
}

export function readVaultLabel(
  body: Record<string, unknown>,
  message: string,
  identity: string,
  verify: (identity: string, message: string, signature: string) => boolean,
): VaultLabel | undefined {
  const fingerprint = body["vault_fingerprint"];
  const signature = body["vault_label_signature"];
  if (fingerprint === undefined && signature === undefined) return undefined;
  if (
    typeof fingerprint !== "string" ||
    !/^[0-9a-f]{8}$/.test(fingerprint) ||
    typeof signature !== "string" ||
    !verify(identity, vaultLabelMessage(message, fingerprint), signature)
  )
    throw new Error("The Vault seed ID couldn't be verified. Update HME Vault and start again.");
  return { vault_fingerprint: fingerprint, vault_label_signature: signature };
}
