/**
 * Was a failed broadcast maybe sent anyway? (pure, tested; deep scan D2)
 *
 * Broadcasts fail over to a second server when the first doesn't answer. If the first one
 * actually took the transaction, the second answers "already known", "already in mempool",
 * XRP's tefPAST_SEQ, or EVM's "nonce too low" (the first copy is already mined). None of
 * those mean "not sent". A send that hits any of these, or a timeout, is never re-signed
 * and never marked failed: it waits as "unknown" for a check.
 */
const MAYBE_SENT =
  /timeout|unreachable|fetch|abort|network|socket|reset|50\d|already[ -]known|known transaction|already[ -]in[ -](the )?(mempool|block ?chain)|txn-already|nonce too low|tefALREADY|tefPAST_SEQ|DUP_TRANSACTION/i;

export function maybeBroadcast(msg: string): boolean {
  return MAYBE_SENT.test(msg);
}
