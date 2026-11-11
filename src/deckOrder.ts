import { daysUntil } from "./date";
import type { Card, Decision } from "./types";

export type TierFilter = "all" | "strong-up" | "very-strong";

export function passesTierFilter(card: Card, filter: TierFilter): boolean {
  if (filter === "all") return true;
  if (filter === "very-strong") return card.fit === "Very strong";
  return card.rank <= 1; // Strong and up
}

/** A card belongs in the deck when it's open and has no live decision against it. */
export function isInDeck(card: Card, decision: Decision | undefined, now: Date = new Date()): boolean {
  if (card.open === false) return false;
  if (!decision) return true;
  if (decision.action === "later") {
    if (!decision.until) return true;
    return new Date(decision.until).getTime() <= now.getTime();
  }
  return false;
}

interface DueSortKey {
  bucket: 0 | 1 | 2; // 0 = future/today, 1 = past, 2 = no due date
  value: number;
}

function dueSortKey(due: string | null, now: Date): DueSortKey {
  if (due === null) return { bucket: 2, value: 0 };
  const days = daysUntil(due, now);
  if (days >= 0) return { bucket: 0, value: days };
  return { bucket: 1, value: days }; // most-overdue-first within the past bucket
}

export type SortMode = "default" | "closing-soon";

/**
 * Default order: fit rank ascending, then due date (soonest future first, then past,
 * then no date), then title. "Closing soon first" ignores rank and sorts by due date alone.
 */
export function compareCards(a: Card, b: Card, mode: SortMode = "default", now: Date = new Date()): number {
  if (mode === "default" && a.rank !== b.rank) return a.rank - b.rank;

  const da = dueSortKey(a.due, now);
  const db = dueSortKey(b.due, now);
  if (da.bucket !== db.bucket) return da.bucket - db.bucket;
  if (da.value !== db.value) return da.value - db.value;

  if (mode === "closing-soon" && a.rank !== b.rank) return a.rank - b.rank;

  return a.title.localeCompare(b.title);
}

export function buildDeck(
  cards: Record<string, Card>,
  decisions: Record<string, Decision>,
  opts: { tierFilter?: TierFilter; sortMode?: SortMode; now?: Date } = {}
): Array<{ id: string; card: Card }> {
  const { tierFilter = "all", sortMode = "default", now = new Date() } = opts;

  const entries = Object.entries(cards)
    .filter(([id, card]) => isInDeck(card, decisions[id], now))
    .filter(([, card]) => passesTierFilter(card, tierFilter))
    .map(([id, card]) => ({ id, card }));

  entries.sort((a, b) => compareCards(a.card, b.card, sortMode, now));
  return entries;
}
