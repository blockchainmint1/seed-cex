import { afterEach, describe, expect, test } from "bun:test";
import { createPublicKey, createSign } from "node:crypto";
import { alarmText, isSnsUrl, parseSnsMessage, snsFresh, snsStringToSign, type SnsMessage } from "./sns";
import { spkiFromCert, verifySnsSignature } from "./sns.server";

// Throwaway self-signed test certificate + key (made for this test only; signs nothing real).
const CERT = `-----BEGIN CERTIFICATE-----
MIIDEzCCAfugAwIBAgIUTVWg+PZTGNRlmM2/ILjLpACQJoswDQYJKoZIhvcNAQEL
BQAwGTEXMBUGA1UEAwwOc2VlZHMtdGVzdC1zbnMwHhcNMjYxMTIyMjA0MzEwWhcN
MzYxMTE5MjA0MzEwWjAZMRcwFQYDVQQDDA5zZWVkcy10ZXN0LXNuczCCASIwDQYJ
KoZIhvcNAQEBBQADggEPADCCAQoCggEBAMO4AEzeuvjJ0zepiIDYq8PMDkgBQkFK
BajXlO06b2tUogCLVHefV5ugECt/0csJ/Xis0CeFzdbqYh6zdxY643laTaNhSLRn
ZUpK9s7dIqik8bciYi00aW+0s0FfcH8uy2tKqQk74ltQ9UHyk7DQdzrT4xKYGp7M
ZiKKl29DGFX65S3R6pCSXNZt4HGufmPhFWOPS51nfFFfxZbAT9jEOraM7TJD77bE
XvWzj9cp7VXOpvaBogFfkMZMHb7lK4mJrnGxIZCSh2Muss5CEZNv7N535kam+2+/
WKf1Ytv6wQVC9/tamR6iuAOb1rYKpSjbvO3WfZnld5nkwF+hJjnHrxsCAwEAAaNT
MFEwHQYDVR0OBBYEFLrCHUEZuwOTeDtEcVbo1MTbodRcMB8GA1UdIwQYMBaAFLrC
HUEZuwOTeDtEcVbo1MTbodRcMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQEL
BQADggEBAA0YGkfqC3d6Z+XjoCCMRkDhcRPLFOdLDf4xpNvtuuugV6Yet0l/cdWh
oTJe1Uq6V/ArRFDf5a44EElT0HnPZtWBM+hS4MCg7wiR4wEyZ6Nf7RYye7tLanka
BnWkYZ3UJbRGYlyfCt4GExwVP+JPADHlWV1sKZX2eUvzutuQtfTjhk9kKHiDkilZ
zxRWeruDcB+WfMGuMoRd/tNo1vEzDOG8wslysdgAx8wXZQCIsqcTnfyrKTpxfz1y
L2jNGDyomekBS53rk4JvLLA3lN1sV+FE+FoQ3lkJIjUSsvEwy2nzdBuMco9GG0Ns
AsIrwe7CyFTKmbdterIiJNWT9LpbZ9A=
-----END CERTIFICATE-----`;
const KEY = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDDuABM3rr4ydM3
qYiA2KvDzA5IAUJBSgWo15TtOm9rVKIAi1R3n1eboBArf9HLCf14rNAnhc3W6mIe
s3cWOuN5Wk2jYUi0Z2VKSvbO3SKopPG3ImItNGlvtLNBX3B/LstrSqkJO+JbUPVB
8pOw0Hc60+MSmBqezGYiipdvQxhV+uUt0eqQklzWbeBxrn5j4RVjj0udZ3xRX8WW
wE/YxDq2jO0yQ++2xF71s4/XKe1Vzqb2gaIBX5DGTB2+5SuJia5xsSGQkodjLrLO
QhGTb+zed+ZGpvtvv1in9WLb+sEFQvf7WpkeorgDm9a2CqUo27zt1n2Z5XeZ5MBf
oSY5x68bAgMBAAECggEAOzeP97IoViASpTPJVlq4VayG4ahn2INCBRz9NW3Jymq3
/XwqmWr/wdmDKvYojss+AuYesOaeKhmOiIV6UaKNsujstrM3oUXrcrgNxvdHhkkp
zWQ82jqScDb3SZ9L1V9eMt9LF70jtsde/Y4cu5HHkWgMu1KEM2nauTa/rO1bDqAs
YqaFkHkOUmqZ0PZFCOacv+3LEwSpZ1w0aFPPoEcTVkr1yCTJ681nQdV/rEGJx7vc
iUhrIZhSvcGMAEo8XItKA5D84sn2/LcvFGNa/5DG8Ucw/ArkLFmLXdFwyUAYl2Ro
N2RB7BU/q8ww9EqE4SJGnWj0m+0a9rJItwmDaHCakQKBgQDqGl9v3gm5ih7/UFkW
bKpebtBimDackf+lQyxBYjWkcGlag9rxuIMcvQsVtWTNl5pZuZ/0yI9HIUzU6OdI
Lo8m44e5X4N3XffQe7K3J0fnvHvWGkCIsh/OEdEpVRfNs3eMtwUWRhIRA8IoXBdf
TwuEykuYFnAn7WdLghIoILT0IwKBgQDWBoMeNR1AgHD1twqT29koWpa4XQyq+DmX
fs/5ZGipSUW4UE/XhohhlypPbXKthXRzLfh75CQ2t4UXQxt1FzQg4YLbcg04IxY5
M7YhilSu9InQ2FEDoX7ArSMr0e+ktvx4ehLnA2L3NgYpGNma1NqQUiD3cpM9KbEX
vRyga7msqQKBgQCC2Fa7WekpkO+eWDRS+k2HFnzWfqkXferbXd4gdVnyHPplowj+
zdhKecb2TTqYRsH4oG2tDWQ3p38gCUUr7QoJ/GZhz+bVEupt1pWfFQ91kL3Of0HO
pXBtZzv21B7H1CVfuvPW7Tcv11/v2vkdRjrz73Ws/e2WA3UWmQ646v747QKBgQDB
B7aSNA1h83Xt51ye5pYBE1MEjMe0G5S10iX5JFpQ9EjxZ13bYPb4LcJ3SJs5bTgN
+dQ2yRjwUKy0wk2tWXQmg73l9gN+MgcFKGKH9Z9S/DKgLblDsRAE7yLdjsa4pGEo
t9D8kc1ccVk1D7iTMI6/w5MAGlI5w7R5WJLNDNu1oQKBgQCJF7Nejy/HMUl9PhdZ
MJfWRlA58+WjrK1IOZgz5mMRxfIvaRUzVrDkaDEUogmngaFy9FvBXzYVEvYxbn8e
psX2SBQ2tZVo8/OU68bZM79+CDvvk+2GBYDDfXxmG0uv4exS9CviBhV1C8Zjyr5c
0wC9Oouaq0ROZThMa0MLw6CZhQ==
-----END PRIVATE KEY-----`;

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function signed(m: Omit<SnsMessage, "Signature">, version = "2"): SnsMessage {
  const full = { ...m, SignatureVersion: version, Signature: "" } as SnsMessage;
  const s = createSign(version === "1" ? "RSA-SHA1" : "RSA-SHA256");
  s.update(snsStringToSign(full));
  return { ...full, Signature: s.sign(KEY, "base64") };
}

const base = {
  Type: "Notification" as const, MessageId: "m1", TopicArn: "arn:aws:sns:us-east-1:1:seeds-alarms",
  Message: JSON.stringify({ AlarmName: "pocket-key-unlocks", NewStateValue: "ALARM", NewStateReason: "12 unlocks in 5 minutes" }),
  Timestamp: new Date().toISOString(), SignatureVersion: "2", SigningCertURL: "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem",
};

describe("AWS alarm messages", () => {
  test("only Amazon SNS hosts over https may sign or confirm", () => {
    expect(isSnsUrl("https://sns.us-east-1.amazonaws.com/a.pem", "cert")).toBe(true);
    expect(isSnsUrl("http://sns.us-east-1.amazonaws.com/a.pem", "cert")).toBe(false);
    expect(isSnsUrl("https://sns.us-east-1.amazonaws.com.evil.com/a.pem", "cert")).toBe(false);
    expect(isSnsUrl("https://evil.com/sns.us-east-1.amazonaws.com/a.pem", "cert")).toBe(false);
    expect(isSnsUrl("https://sns.us-east-1.amazonaws.com/a.txt", "cert")).toBe(false);
    expect(isSnsUrl("https://sns.us-east-1.amazonaws.com:8443/a.pem", "cert")).toBe(false);
  });

  test("messages older than an hour are refused", () => {
    const now = Date.now();
    expect(snsFresh(new Date(now - 10 * 60_000).toISOString(), now)).toBe(true);
    expect(snsFresh(new Date(now - 61 * 60_000).toISOString(), now)).toBe(false);
    expect(snsFresh("not a date", now)).toBe(false);
  });

  test("the public key is read out of the certificate", () => {
    const der = Uint8Array.from(atob(CERT.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
    const want = createPublicKey(KEY).export({ type: "spki", format: "der" });
    expect(Buffer.from(spkiFromCert(der)).equals(want)).toBe(true);
  });

  test("a correctly signed alarm is accepted (both SNS signature versions)", async () => {
    globalThis.fetch = (async () => new Response(CERT)) as unknown as typeof fetch;
    expect(await verifySnsSignature(signed(base, "2"))).toBe(true);
    expect(await verifySnsSignature(signed({ ...base, MessageId: "m2" }, "1"))).toBe(true);
  });

  test("a changed message or a non-SNS certificate is refused", async () => {
    globalThis.fetch = (async () => new Response(CERT)) as unknown as typeof fetch;
    const m = signed({ ...base, MessageId: "m3" });
    expect(await verifySnsSignature({ ...m, Message: JSON.stringify({ AlarmName: "x", NewStateValue: "OK" }) })).toBe(false);
    expect(await verifySnsSignature({ ...m, SigningCertURL: "https://evil.com/a.pem" })).toBe(false);
    expect(await verifySnsSignature({ ...m, SignatureVersion: "3" })).toBe(false);
  });

  test("incomplete messages are not parsed", () => {
    expect(parseSnsMessage({ Type: "Notification" })).toBeNull();
    expect(parseSnsMessage({ ...base, Signature: "x", Type: "SubscriptionConfirmation" })).toBeNull();
    expect(parseSnsMessage({ ...base, Signature: "x" })?.MessageId).toBe("m1");
  });

  test("alarm text says what to do and escapes AWS text", () => {
    const t = alarmText(JSON.stringify({ AlarmName: "pocket-key-unlocks", NewStateValue: "ALARM", NewStateReason: "<b>12</b> unlocks" }))!;
    expect(t).toContain("disable the pocket-key AWS KMS key");
    expect(t).toContain("&lt;b&gt;12&lt;/b&gt;");
    expect(alarmText(JSON.stringify({ AlarmName: "a", NewStateValue: "OK" }))).toContain("cleared");
    expect(alarmText(JSON.stringify({ AlarmName: "a", NewStateValue: "INSUFFICIENT_DATA" }))).toBeNull();
    expect(alarmText("not json")).toBeNull();
  });

  test("Vault signing-key alarms get Vault advice, not pocket-key advice", () => {
    const t = alarmText(JSON.stringify({ AlarmName: "Seeds Vault signing key used by another login", NewStateValue: "ALARM" }))!;
    expect(t).toContain("disable the Vault signing AWS KMS key");
    expect(t).not.toContain("pocket-key");
  });
});
