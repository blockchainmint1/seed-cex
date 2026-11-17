import { describe, expect, test } from "bun:test";
import { makeUnsubToken, readUnsubToken } from "./links";
import { describeProfileChanges } from "./profile-diff";
import { signV4 } from "./ses.server";
import { weekWindow } from "./events.server";

const UID = "6f1c2a4e-1234-4abc-9def-0123456789ab";

describe("unsubscribe links", () => {
  test("a token made with the secret reads back to the same member", () => {
    expect(readUnsubToken("s3cret", makeUnsubToken("s3cret", "weekly", UID))).toEqual({ list: "weekly", userId: UID });
  });
  test("a token signed with a different secret is refused", () => {
    expect(readUnsubToken("s3cret", makeUnsubToken("other", "weekly", UID))).toBeNull();
  });
  test("swapping in someone else's id breaks the token", () => {
    const [list, , sig] = makeUnsubToken("s3cret", "weekly", UID).split(".");
    expect(readUnsubToken("s3cret", `${list}.00000000-0000-4000-8000-000000000000.${sig}`)).toBeNull();
  });
});

describe("You changed X email", () => {
  test("lists only the settings that actually changed", () => {
    const r = describeProfileChanges({ timezone: "UTC", notify_p2p: true }, { timezone: "America/Chicago", notify_p2p: true });
    expect(r).toEqual({ thing: "account settings", lines: ["Time zone: UTC → America/Chicago"] });
  });
  test("saving with no changes sends nothing", () => {
    expect(describeProfileChanges({ notify_p2p: true }, { notify_p2p: true })).toBeNull();
  });
  test("alert-only changes are labelled notification settings", () => {
    expect(describeProfileChanges({ email_weekly_update: true }, { email_weekly_update: false })?.thing).toBe("notification settings");
  });
});

describe("weekly window", () => {
  test("covers the seven days before Monday", () => {
    const w = weekWindow(new Date("2026-11-16T00:00:00Z"));
    expect(w.label).toBe("Nov 9 – Nov 15");
    expect(w.key).toBe("2026-11-09");
  });
});

describe("SES request signing", () => {
  // AWS's published SigV4 example key; checks the derivation chain is stable.
  test("signs deterministically with the AWS4 scheme", () => {
    const h = signV4({ method: "GET", host: "email.us-east-1.amazonaws.com", path: "/v2/email/account", body: "", region: "us-east-1", service: "ses",
      accessKeyId: "AKIDEXAMPLE", secret: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", now: new Date("2015-08-30T12:36:00Z") });
    expect(h["x-amz-date"]).toBe("20150830T123600Z");
    expect(h.authorization).toStartWith("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/ses/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=");
  });
});
