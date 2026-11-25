// Pure rules for the "HME" tag in the account header. No network, no database.
//
// Honest.Money gives a member three identifiers:
//   • username   – their human handle (also their invite code), e.g. "mineTXC"
//   • memberNo   – their member number, e.g. "1"
//   • hmeId      – the permanent member UUID, the key Seeds stores as profiles.hm_member_id
// The header shows the readable one and keeps the UUID one hover away.

import { cleanRefCode } from "./ignite-registration";

export type HmeIdentityInput = {
  /** The permanent member UUID (profiles.hm_member_id). */
  memberId?: string | null;
  /** Honest.Money username / invite code, when we have one. */
  username?: string | null;
  /** Honest.Money member number, when we have one. */
  memberNo?: string | null;
};

export type HmeIdentity = {
  /** Short label shown beside "HME". */
  label: string;
  /** Full member UUID for the hover card, or null when this account has no HME membership. */
  uuid: string | null;
  /** "Member #1" line for the hover card, or null. */
  memberNoLine: string | null;
};

// Member numbers come from Honest.Money as plain digits; anything else is ignored.
const MEMBER_NO_RE = /^[0-9]{1,12}$/;

/**
 * What to show beside "HME": the username if we have a usable one, else the member number,
 * else the first 8 characters of the UUID (the old display). Returns null only when the
 * account has no Honest.Money identity at all.
 */
export function hmeIdentityFor({ memberId, username, memberNo }: HmeIdentityInput): HmeIdentity | null {
  const uuid = typeof memberId === "string" && memberId.trim() ? memberId.trim() : null;
  const handle = cleanRefCode(username);
  const no = typeof memberNo === "string" && MEMBER_NO_RE.test(memberNo.trim()) ? memberNo.trim() : null;
  if (!uuid && !handle && !no) return null;
  const label = handle ?? (no ? `#${no}` : uuid ? uuid.slice(0, 8) : null);
  if (!label) return null;
  return { label, uuid, memberNoLine: no ? `Member #${no}` : null };
}
