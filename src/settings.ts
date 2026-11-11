const KEY_API_URL = "radar-deck:apiUrl";
const KEY_SECRET = "radar-deck:secret";
const KEY_TIER_FILTER = "radar-deck:tierFilter";
const KEY_SORT_MODE = "radar-deck:sortMode";

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing / storage blocked — settings just won't persist across reloads.
  }
}

export function getApiUrl(): string {
  return safeGet(KEY_API_URL) ?? "";
}

export function setApiUrl(url: string): void {
  safeSet(KEY_API_URL, url.trim());
}

export function getSecret(): string {
  return safeGet(KEY_SECRET) ?? "";
}

export function setSecret(secret: string): void {
  safeSet(KEY_SECRET, secret.trim());
}

export function hasCredentials(): boolean {
  return getApiUrl().length > 0 && getSecret().length > 0;
}

export function getTierFilter(): string {
  return safeGet(KEY_TIER_FILTER) ?? "all";
}

export function setTierFilter(value: string): void {
  safeSet(KEY_TIER_FILTER, value);
}

export function getSortMode(): string {
  return safeGet(KEY_SORT_MODE) ?? "default";
}

export function setSortMode(value: string): void {
  safeSet(KEY_SORT_MODE, value);
}
