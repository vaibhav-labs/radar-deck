import { describe, expect, it } from "vitest";
import { buildDeck, isInDeck } from "../src/deckOrder";
import { sampleCards } from "./fixtures/sampleCards";
import type { Decision } from "../src/types";

const now = new Date("2026-11-11T06:00:00Z");

function decision(action: Decision["action"], extra: Partial<Decision> = {}): Decision {
  return { action, at: now.toISOString(), title: "x", url: "https://example.org", fit: "Strong", ...extra };
}

describe("isInDeck", () => {
  it("excludes closed cards regardless of decision state", () => {
    expect(isInDeck(sampleCards.o555555555555, undefined, now)).toBe(false);
  });

  it("includes an open card with no decision", () => {
    expect(isInDeck(sampleCards.o111111111111, undefined, now)).toBe(true);
  });

  it("excludes an applied or passed card", () => {
    expect(isInDeck(sampleCards.o111111111111, decision("apply"), now)).toBe(false);
    expect(isInDeck(sampleCards.o111111111111, decision("reject"), now)).toBe(false);
  });

  it("excludes a snoozed card until its until time passes", () => {
    const until = new Date(now.getTime() + 60_000).toISOString();
    expect(isInDeck(sampleCards.o111111111111, decision("later", { until }), now)).toBe(false);
    const pastUntil = new Date(now.getTime() - 60_000).toISOString();
    expect(isInDeck(sampleCards.o111111111111, decision("later", { until: pastUntil }), now)).toBe(true);
  });
});

describe("buildDeck", () => {
  it("drops closed cards and cards with a live decision", () => {
    const decisions: Record<string, Decision> = { o111111111111: decision("apply") };
    const deck = buildDeck(sampleCards, decisions, { now });
    const ids = deck.map((e) => e.id);
    expect(ids).not.toContain("o555555555555"); // closed
    expect(ids).not.toContain("o111111111111"); // applied
  });

  it("orders by fit rank first, then by due date, then by title", () => {
    const deck = buildDeck(sampleCards, {}, { now });
    const ids = deck.map((e) => e.id);
    // Very strong (rank 0) first, then Strong (rank 1, the links[] card), then
    // Moderate (rank 2, the CV card), then Weak (rank 3, the past-due below-floor card).
    expect(ids).toEqual(["o111111111111", "o222222222222", "o333333333333", "o444444444444"]);
  });

  it("'closing soon first' sorts by due date ahead of fit rank", () => {
    const deck = buildDeck(sampleCards, {}, { now, sortMode: "closing-soon" });
    const ids = deck.map((e) => e.id);
    // The below-floor card's due date (9 Nov) is already past, so under "closing soon"
    // it sorts after the one real future deadline (o111111111111, 20 Nov) but ahead of
    // the two rolling (no-due-date) cards, which sort last.
    expect(ids[0]).toBe("o111111111111");
    expect(ids[1]).toBe("o444444444444");
    expect(ids.slice(2)).toEqual(["o222222222222", "o333333333333"]);
  });

  it("applies the tier filter", () => {
    const strongUp = buildDeck(sampleCards, {}, { now, tierFilter: "strong-up" }).map((e) => e.id);
    expect(strongUp).toEqual(["o111111111111", "o222222222222"]);

    const veryStrong = buildDeck(sampleCards, {}, { now, tierFilter: "very-strong" }).map((e) => e.id);
    expect(veryStrong).toEqual(["o111111111111"]);
  });
});
