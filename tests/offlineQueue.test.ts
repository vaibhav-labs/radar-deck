import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearQueue,
  enqueueDecision,
  flushQueue,
  getCachedDeck,
  getQueue,
  mergeDecisions,
  setCachedDeck,
} from "../src/offlineQueue";
import type { Decision } from "../src/types";

function decision(at: string, extra: Partial<Decision> = {}): Decision {
  return { action: "apply", at, title: "x", url: "https://example.org", fit: "Strong", ...extra };
}

beforeEach(async () => {
  await clearQueue();
});

describe("mergeDecisions", () => {
  it("keeps the decision with the newer `at` per id", () => {
    const local = { a: decision("2026-11-11T10:00:00Z"), onlyLocal: decision("2026-11-01T00:00:00Z") };
    const remote = { a: decision("2026-11-11T12:00:00Z"), onlyRemote: decision("2026-11-02T00:00:00Z") };
    const merged = mergeDecisions(local, remote);
    expect(merged.a.at).toBe("2026-11-11T12:00:00Z"); // remote is newer
    expect(merged.onlyLocal).toBeDefined();
    expect(merged.onlyRemote).toBeDefined();
  });

  it("local wins a tie or when it's newer", () => {
    const local = { a: decision("2026-11-11T12:00:00Z") };
    const remote = { a: decision("2026-11-11T10:00:00Z") };
    expect(mergeDecisions(local, remote).a.at).toBe("2026-11-11T12:00:00Z");
  });
});

describe("the offline cache", () => {
  it("round-trips a deck", async () => {
    const deck = { meta: null, cards: {}, decisions: {}, serverTime: "2026-11-11T00:00:00Z" };
    await setCachedDeck(deck);
    expect(await getCachedDeck()).toEqual(deck);
  });
});

describe("the write queue", () => {
  it("replays entries in the order they were queued", async () => {
    await enqueueDecision("a", decision("2026-11-11T10:00:00Z"));
    await enqueueDecision("b", decision("2026-11-11T10:00:01Z"));
    await enqueueDecision("a", decision("2026-11-11T10:00:02Z"));

    const sentOrder: string[] = [];
    const result = await flushQueue(async (id) => {
      sentOrder.push(id);
    });

    expect(sentOrder).toEqual(["a", "b", "a"]);
    expect(result).toEqual({ sent: 3, remaining: 0 });
    expect(await getQueue()).toEqual([]);
  });

  it("stops replaying on the first failure, leaving the rest queued for next time", async () => {
    await enqueueDecision("a", decision("2026-11-11T10:00:00Z"));
    await enqueueDecision("b", decision("2026-11-11T10:00:01Z"));

    let calls = 0;
    const result = await flushQueue(async () => {
      calls++;
      throw new Error("network down");
    });

    expect(calls).toBe(1);
    expect(result).toEqual({ sent: 0, remaining: 2 });
    expect((await getQueue()).length).toBe(2);
  });

  it("queues a null decision for Undo", async () => {
    await enqueueDecision("a", null);
    const queue = await getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].decision).toBeNull();
  });
});
