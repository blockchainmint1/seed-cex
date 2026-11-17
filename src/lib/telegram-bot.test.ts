import { describe, expect, test as it } from "bun:test";
import { friendlyTelegramError } from "./telegram-bot";

describe("Telegram error wording", () => {
  it("'chat not found' tells the member to press Start on @seeds_notify_bot", () =>
    expect(friendlyTelegramError(400, '{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}')).toContain("t.me/seeds_notify_bot"));
  it("a blocked bot gets the same Start instructions", () =>
    expect(friendlyTelegramError(403, "Forbidden: bot was blocked by the user")).toContain("tap Start"));
  it("other failures never echo Telegram's raw reply", () =>
    expect(friendlyTelegramError(500, '{"ok":false}')).not.toContain("{"));
});
