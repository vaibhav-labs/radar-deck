import type { Deck, Decision } from "./types";
import { getApiUrl, getSecret } from "./settings";
import { enqueueDecision, flushQueue, getCachedDeck, mergeDecisions, setCachedDeck } from "./offlineQueue";

export class ApiError extends Error {}

function buildUrl(params: Record<string, string>): string {
  const base = getApiUrl();
  const qs = new URLSearchParams(params).toString();
  return base.includes("?") ? `${base}&${qs}` : `${base}?${qs}`;
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      "The backend didn't return JSON — check the Apps Script deployment is set to " +
        '"Execute as: me" / "Who has access: Anyone".'
    );
  }
}

async function rawFetchDeck(): Promise<Deck> {
  if (!getApiUrl() || !getSecret()) {
    throw new ApiError("missing-credentials");
  }
  const url = buildUrl({ action: "deck", key: getSecret() });
  const res = await fetch(url, { method: "GET", redirect: "follow" });
  if (!res.ok) throw new ApiError(`Deck request failed (${res.status}).`);
  return parseJsonResponse<Deck>(res);
}

async function rawSendDecision(id: string, decision: Decision | null): Promise<void> {
  const url = getApiUrl();
  const res = await fetch(url, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "decide", key: getSecret(), id, decision }),
  });
  if (!res.ok) throw new ApiError(`Decision save failed (${res.status}).`);
  await parseJsonResponse<{ ok: boolean }>(res);
}

export type DeckLoadResult =
  | { status: "online"; deck: Deck }
  | { status: "offline"; deck: Deck | undefined }
  | { status: "no-credentials" }
  | { status: "unreachable"; message: string; deck: Deck | undefined };

export async function loadDeck(): Promise<DeckLoadResult> {
  if (!getApiUrl() || !getSecret()) return { status: "no-credentials" };

  const cached = await getCachedDeck();
  try {
    const fresh = await rawFetchDeck();
    const merged: Deck = {
      ...fresh,
      decisions: cached ? mergeDecisions(cached.decisions, fresh.decisions) : fresh.decisions,
    };
    await setCachedDeck(merged);
    return { status: "online", deck: merged };
  } catch (err) {
    if (!navigator.onLine) return { status: "offline", deck: cached };
    const message = err instanceof Error ? err.message : "Unknown error";
    return { status: "unreachable", message, deck: cached };
  }
}

/** Save a decision: write it locally, queue it, and try to flush immediately. */
export async function saveDecision(id: string, decision: Decision | null): Promise<void> {
  await enqueueDecision(id, decision);
  await syncQueue();
}

export async function syncQueue(): Promise<{ sent: number; remaining: number }> {
  if (!navigator.onLine || !getApiUrl() || !getSecret()) {
    return { sent: 0, remaining: -1 };
  }
  return flushQueue(rawSendDecision);
}
