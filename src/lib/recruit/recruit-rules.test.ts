import { describe, expect, it } from "bun:test";
import {
  canMoveStage, dedupeKey, gradeOf, isCoinTeam, listingGoal, outreachProblems, parsePastedLeads, perMonthToGoal, scoreLead, stageAfterSend, type LeadFacts,
} from "./recruit-rules";

const NOW = Date.parse("2026-11-21T00:00:00Z");
const base: LeadFacts = {
  volume24hUsd: null, marketCapUsd: null, numMarketPairs: null, dateAdded: null, chain: null, native: false,
  website: null, twitter: null, telegram: null, email: null, sourceDetail: null,
};

describe("the 1,000 paid listings goal", () => {
  const prices = [1000, 2500, 5000];
  it("1,000 listings bring $1,000,000 if all are Seed packages", () => expect(listingGoal(0, prices).goalLowUsd).toBe(1_000_000));
  it("1,000 listings bring $5,000,000 if all are Grove packages", () => expect(listingGoal(0, prices).goalHighUsd).toBe(5_000_000));
  it("25 paid leaves 975 to go, 2.5% of the way", () => {
    const g = listingGoal(25, prices);
    expect(g.remaining).toBe(975);
    expect(g.pct).toBe(2.5);
  });
  it("975 to go by about a year out is 82 a month", () =>
    expect(perMonthToGoal(975, Date.parse("2026-11-21T00:00:00Z"), "2027-11-21T00:00:00Z")).toBe(82));
  it("no date, no monthly pace", () => expect(perMonthToGoal(975, 0, null)).toBeNull());
});

describe("pipeline stages", () => {
  it("moves forward, skipping steps", () => expect(canMoveStage("found", "applied")).toBe(true));
  it("never moves back", () => expect(canMoveStage("replied", "shortlisted")).toBe(false));
  it("a paid lead can only go live", () => {
    expect(canMoveStage("paid", "live")).toBe(true);
    expect(canMoveStage("paid", "declined")).toBe(false);
  });
  it("a live lead never moves", () => expect(canMoveStage("live", "dead")).toBe(false));
  it("a closed lead only reopens to Found", () => {
    expect(canMoveStage("declined", "found")).toBe(true);
    expect(canMoveStage("declined", "contacted")).toBe(false);
  });
  it("sending moves Found and Shortlisted to Contacted", () => {
    expect(stageAfterSend("shortlisted")).toBe("contacted");
    expect(stageAfterSend("replied")).toBe("replied");
  });
});

describe("lead score", () => {
  it("a busy, right-sized, reachable new token on Base scores 100", () => {
    const s = scoreLead({ ...base, volume24hUsd: 2e6, marketCapUsd: 40e6, numMarketPairs: 6, dateAdded: "2026-10-01T00:00:00Z", chain: "base", website: "https://x.io", twitter: "https://x.com/a", telegram: "https://t.me/a" }, NOW);
    expect(s.score).toBe(100);
    expect(gradeOf(s.score)).toBe("A");
  });
  it("a dead coin with no contacts scores under 20", () => {
    const s = scoreLead({ ...base, volume24hUsd: 50, marketCapUsd: 20_000, numMarketPairs: 1 }, NOW);
    expect(s.score).toBeLessThan(20);
    expect(gradeOf(s.score)).toBe("D");
  });
  it("BitMart-stranded teams get 5 extra points", () => {
    const a = scoreLead({ ...base, volume24hUsd: 5e4 }, NOW).score;
    const b = scoreLead({ ...base, volume24hUsd: 5e4, sourceDetail: "bitmart" }, NOW).score;
    expect(b - a).toBe(5);
  });
  it("a coin already on 137 markets loses 15 points instead of gaining", () => {
    const few = scoreLead({ ...base, volume24hUsd: 5e5, numMarketPairs: 8 }, NOW).score;
    const many = scoreLead({ ...base, volume24hUsd: 5e5, numMarketPairs: 137 }, NOW).score;
    expect(few - many).toBe(30);
  });
  it("never goes above 100", () => {
    const s = scoreLead({ ...base, volume24hUsd: 2e6, marketCapUsd: 40e6, numMarketPairs: 6, dateAdded: "2026-10-01T00:00:00Z", chain: "base", website: "a", twitter: "b", telegram: "c", sourceDetail: "bitmart" }, NOW);
    expect(s.score).toBe(100);
  });
});

describe("who counts as a coin team", () => {
  it("skips tokenized stocks", () => expect(isCoinTeam({ name: "Anthropic PBC Tokenized Stock (Coinbase)", tags: ["tokenized-stock"] })).toBe(false));
  it("skips stablecoins", () => expect(isCoinTeam({ name: "Some Dollar", tags: ["stablecoin"] })).toBe(false));
  it("keeps an ordinary token", () => expect(isCoinTeam({ name: "Pepe", tags: ["memes"] })).toBe(true));
});

describe("duplicates", () => {
  it("CoinMarketCap id wins", () => expect(dedupeKey({ cmcId: 42, symbol: "ABC", name: "Abc" })).toBe("cmc:42"));
  it("contracts ignore letter case", () =>
    expect(dedupeKey({ chain: "base", contract: "0xABCDEF", symbol: "A", name: "A" })).toBe(dedupeKey({ chain: "base", contract: "0xabcdef", symbol: "B", name: "B" })));
  it("same ticker + same website is one lead", () =>
    expect(dedupeKey({ symbol: "abc", website: "https://www.abc.io/home", name: "Abc" })).toBe(dedupeKey({ symbol: "ABC", website: "abc.io", name: "ABC Coin" })));
});

describe("pasted lists", () => {
  it("reads links in any order", () => {
    const { leads } = parsePastedLeads("Moon Coin, $moon, t.me/mooncoin, team@moon.io, https://moon.io, x.com/moon");
    expect(leads[0]).toMatchObject({ name: "Moon Coin", symbol: "MOON", telegram: "https://t.me/mooncoin", email: "team@moon.io", website: "https://moon.io", twitter: "https://x.com/moon" });
  });
  it("reports lines without a ticker", () => expect(parsePastedLeads("Only a name\nGood, GD").skipped).toEqual([1]));
});

describe("outreach safety check", () => {
  it("blocks \"no listing fee\"", () => expect(outreachProblems("Join Seeds, no listing fee!", "email").length).toBe(1));
  it("blocks calling BitMart bankrupt", () => expect(outreachProblems("Since BitMart went bankrupt…", "telegram").length).toBe(1));
  it("blocks unfilled placeholders", () => expect(outreachProblems("Hi [Your name], …", "email").length).toBe(1));
  it("blocks X messages over 600 characters", () => expect(outreachProblems("a".repeat(601), "x").length).toBe(1));
  it("passes a normal message", () => expect(outreachProblems("Hi team, Seeds lists coins from $1,000 with no trading fees for your holders.", "telegram")).toEqual([]));
});
