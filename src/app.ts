import { loadDeck, saveDecision, syncQueue } from "./api";
import { buildDeck, type SortMode, type TierFilter } from "./deckOrder";
import { attachSwipe } from "./gestures";
import { setCachedDeck } from "./offlineQueue";
import {
  getSortMode,
  getTierFilter,
  hasCredentials,
  getApiUrl,
  getSecret,
  setApiUrl,
  setSecret,
  setSortMode,
  setTierFilter,
} from "./settings";
import {
  renderCardFace,
  renderEmptyState,
  renderListRow,
  renderMetaHeader,
  renderToast,
  setStampOpacity,
} from "./render";
import type { Card, Decision, Deck, RejectReason } from "./types";

const REASON_CHIPS: RejectReason[] = ["Pay", "Location or visa", "Level", "Not my field", "Timing", "Already handled"];
const LATER_MS = 3 * 24 * 60 * 60 * 1000;

let deck: Deck = { meta: null, cards: {}, decisions: {} };
let tierFilter: TierFilter = (getTierFilter() as TierFilter) ?? "all";
let sortMode: SortMode = (getSortMode() as SortMode) ?? "default";
let lastAction: { id: string; label: string } | null = null;
let detachTopGesture: (() => void) | null = null;

function $(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node;
}

function toast(message: string, link?: { label: string; url: string }): void {
  renderToast($("toast-root"), message, link);
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------- deck view ----------

function currentDeckEntries() {
  return buildDeck(deck.cards, deck.decisions, { tierFilter, sortMode });
}

function renderDeck(): void {
  const stack = $("deck-stack");
  const emptyBox = $("deck-empty");
  detachTopGesture?.();
  detachTopGesture = null;
  stack.textContent = "";

  const entries = currentDeckEntries();

  if (Object.keys(deck.cards).length === 0) {
    stack.hidden = true;
    emptyBox.hidden = false;
    renderEmptyState(emptyBox, "no-cards");
    return;
  }
  if (entries.length === 0) {
    stack.hidden = true;
    emptyBox.hidden = false;
    renderEmptyState(emptyBox, tierFilter === "all" ? "deck-empty" : "filtered-empty");
    return;
  }

  stack.hidden = false;
  emptyBox.hidden = true;

  const visible = entries.slice(0, 3).reverse(); // paint back-to-front
  for (let i = 0; i < visible.length; i++) {
    const { id, card } = visible[i];
    const depthFromTop = visible.length - 1 - i;
    const wrapper = document.createElement("div");
    wrapper.className = "card-wrapper";
    wrapper.style.setProperty("--depth", String(depthFromTop));
    wrapper.dataset.id = id;
    if (depthFromTop > 0) wrapper.style.touchAction = "auto";
    else wrapper.style.touchAction = "pan-y";
    const face = renderCardFace(card);
    wrapper.appendChild(face);
    stack.appendChild(wrapper);

    if (depthFromTop === 0) {
      detachTopGesture = attachSwipe(wrapper, {
        onMove(dx, progress, direction) {
          wrapper.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
          setStampOpacity(face, direction, progress);
        },
        onCommit(direction) {
          if (direction === "right") doApply(id, card);
          else doPass(id, card);
        },
        onCancel() {
          wrapper.style.transform = "";
          setStampOpacity(face, null, 0);
        },
      });
    }
  }
}

function topEntry(): { id: string; card: Card } | undefined {
  return currentDeckEntries()[0];
}

async function commitDecision(id: string, decision: Decision | null): Promise<void> {
  if (decision) deck.decisions[id] = decision;
  else delete deck.decisions[id];
  renderDeck();
  renderLists();
  // Persist to the offline cache immediately, independent of the network: a reload
  // right after this (especially while offline) must see this decision, not a stale copy.
  await setCachedDeck(deck);
  try {
    await saveDecision(id, decision);
  } catch {
    toast("Saved on this device — will sync when you're back online.");
  }
}

function doApply(id: string, card: Card, withCv = false): void {
  // Open synchronously, before any await, so the popup isn't blocked.
  const win = window.open(card.url, "_blank", "noopener");
  const decision: Decision = {
    action: "apply",
    cv: withCv,
    applied: false,
    at: nowIso(),
    title: card.title,
    url: card.url,
    fit: card.fit,
  };
  lastAction = { id, label: `Applied: ${card.title}` };
  void commitDecision(id, decision);
  if (!win) {
    toast(`Couldn't open the posting automatically.`, { label: "Open it", url: card.url });
  } else {
    toast(withCv ? "Saved — CV requested." : "Saved as Apply.");
  }
}

function doPass(id: string, card: Card): void {
  const decision: Decision = {
    action: "reject",
    at: nowIso(),
    title: card.title,
    url: card.url,
    fit: card.fit,
  };
  lastAction = { id, label: `Passed: ${card.title}` };
  void commitDecision(id, decision);
  offerReasonChips(id, card);
}

function doLater(id: string, card: Card): void {
  const decision: Decision = {
    action: "later",
    at: nowIso(),
    until: new Date(Date.now() + LATER_MS).toISOString(),
    title: card.title,
    url: card.url,
    fit: card.fit,
  };
  lastAction = { id, label: `Snoozed: ${card.title}` };
  void commitDecision(id, decision);
  toast("Back in 3 days.");
}

function doUndo(): void {
  if (!lastAction) return;
  const { id, label } = lastAction;
  lastAction = null;
  void commitDecision(id, null);
  toast(`Undid: ${label}`);
}

function offerReasonChips(id: string, card: Card): void {
  const bar = document.createElement("div");
  bar.className = "reason-bar";
  bar.appendChild(Object.assign(document.createElement("span"), { textContent: `Why pass on "${card.title}"?`, className: "reason-prompt" }));
  for (const reason of REASON_CHIPS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reason-chip";
    btn.textContent = reason;
    btn.addEventListener("click", () => {
      const existing = deck.decisions[id];
      if (existing && existing.action === "reject") {
        void commitDecision(id, { ...existing, reason, at: nowIso() });
      }
      bar.remove();
    });
    bar.appendChild(btn);
  }
  $("toast-root").appendChild(bar);
  setTimeout(() => bar.remove(), 8000);
}

// ---------- lists view ----------

function renderLists(): void {
  const applyList = $("list-apply");
  const laterList = $("list-later");
  const passedList = $("list-passed");
  applyList.textContent = "";
  laterList.textContent = "";
  passedList.textContent = "";

  for (const [id, decision] of Object.entries(deck.decisions)) {
    const card = deck.cards[id];
    if (!card) continue;

    if (decision.action === "apply") {
      applyList.appendChild(
        renderListRow(card, id, decision, [
          {
            label: decision.applied ? "Applied" : "I've applied",
            onClick: () => {
              if (decision.applied) return;
              void commitDecision(id, { ...decision, applied: true, appliedAt: nowIso(), at: nowIso() });
            },
          },
          {
            label: decision.cv ? "CV requested" : "Tailor my CV",
            onClick: () => {
              if (decision.cv) return;
              void commitDecision(id, { ...decision, cv: true, at: nowIso() });
            },
          },
        ])
      );
    } else if (decision.action === "later") {
      laterList.appendChild(renderListRow(card, id, decision, []));
    } else if (decision.action === "reject") {
      passedList.appendChild(
        renderListRow(card, id, decision, [
          { label: "Back to deck", onClick: () => void commitDecision(id, null) },
        ])
      );
    }
  }
}

// ---------- settings / views ----------

function switchView(name: "deck" | "lists" | "settings"): void {
  for (const tab of document.querySelectorAll<HTMLButtonElement>(".tab")) {
    tab.setAttribute("aria-pressed", String(tab.dataset.view === name));
  }
  for (const id of ["view-deck", "view-lists", "view-settings"]) {
    $(id).hidden = id !== `view-${name}`;
  }
}

function initSettingsForm(): void {
  const urlInput = $("settings-url") as HTMLInputElement;
  const secretInput = $("settings-secret") as HTMLInputElement;
  urlInput.value = getApiUrl();
  secretInput.value = getSecret();

  $("settings-save").addEventListener("click", async () => {
    setApiUrl(urlInput.value);
    setSecret(secretInput.value);
    const status = $("settings-status");
    status.textContent = "Checking…";
    const result = await loadDeck();
    if (result.status === "online") {
      deck = result.deck;
      status.textContent = "Connected.";
      renderDeck();
      renderLists();
      switchView("deck");
    } else if (result.status === "no-credentials") {
      status.textContent = "Enter both the API URL and secret.";
    } else {
      status.textContent = "Saved, but couldn't connect yet — check the URL and secret.";
    }
  });

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;
  if (isIos && !standalone) $("ios-hint").hidden = false;
}

function initControls(): void {
  const sortSelect = $("sort-mode") as HTMLSelectElement;
  const tierSelect = $("tier-filter") as HTMLSelectElement;
  sortSelect.value = sortMode;
  tierSelect.value = tierFilter;
  sortSelect.addEventListener("change", () => {
    sortMode = sortSelect.value as SortMode;
    setSortMode(sortMode);
    renderDeck();
  });
  tierSelect.addEventListener("change", () => {
    tierFilter = tierSelect.value as TierFilter;
    setTierFilter(tierFilter);
    renderDeck();
  });

  for (const tab of document.querySelectorAll<HTMLButtonElement>(".tab")) {
    tab.addEventListener("click", () => switchView(tab.dataset.view as "deck" | "lists" | "settings"));
  }
}

type TopAction = "pass" | "apply" | "later" | "cv" | "undo";

function triggerTopAction(action: TopAction): void {
  if (action === "undo") {
    doUndo();
    return;
  }
  const top = topEntry();
  if (!top) return;
  switch (action) {
    case "pass":
      doPass(top.id, top.card);
      break;
    case "apply":
      doApply(top.id, top.card);
      break;
    case "later":
      doLater(top.id, top.card);
      break;
    case "cv":
      doApply(top.id, top.card, true);
      break;
  }
}

function initKeyboard(): void {
  document.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement | null;
    if (target && /input|textarea|select/i.test(target.tagName)) return;
    switch (e.key) {
      case "ArrowLeft":
        triggerTopAction("pass");
        break;
      case "ArrowRight":
        triggerTopAction("apply");
        break;
      case "l":
      case "L":
        triggerTopAction("later");
        break;
      case "c":
      case "C":
        triggerTopAction("cv");
        break;
      case "u":
      case "U":
        triggerTopAction("undo");
        break;
    }
  });
}

function initActionButtons(): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".action-btn, #undo-btn")) {
    btn.addEventListener("click", () => triggerTopAction(btn.dataset.action as TopAction));
  }
}

function describeMeta(): string {
  if (!deck.meta) return "";
  const date = new Date(deck.meta.runAt);
  const formatted = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
  return `Refilled ${formatted} IST · ${deck.meta.open} open · ${deck.meta.added} new`;
}

async function refresh(): Promise<void> {
  if (!hasCredentials()) {
    switchView("settings");
    renderEmptyState($("deck-empty"), "no-credentials");
    $("deck-stack").hidden = true;
    $("deck-empty").hidden = false;
    return;
  }

  const withMetaSuffix = (suffix: string) => {
    const base = describeMeta();
    return base ? `${base} · ${suffix}` : suffix;
  };

  const result = await loadDeck();
  if (result.status === "online") {
    deck = result.deck;
    renderMetaHeader($("meta-note"), describeMeta());
  } else if (result.status === "offline" && result.deck) {
    deck = result.deck;
    renderMetaHeader($("meta-note"), withMetaSuffix("offline, showing the saved deck"));
  } else if (result.status === "unreachable" && result.deck) {
    deck = result.deck;
    renderMetaHeader($("meta-note"), withMetaSuffix("can't reach the backend, showing the saved deck"));
  } else if (result.status === "unreachable" || result.status === "offline") {
    renderMetaHeader(
      $("meta-note"),
      result.status === "offline" ? "Offline, and nothing saved yet." : "Can't reach the backend."
    );
    $("deck-stack").hidden = true;
    $("deck-empty").hidden = false;
    renderEmptyState(
      $("deck-empty"),
      "unreachable",
      result.status === "unreachable" ? result.message : undefined
    );
    return;
  }

  renderDeck();
  renderLists();
}

export function startApp(): void {
  initControls();
  initSettingsForm();
  initKeyboard();
  initActionButtons();
  void refresh();

  window.addEventListener("online", () => {
    void syncQueue().then(() => refresh());
  });

  if ("serviceWorker" in navigator) {
    // A relative path resolves against the current document, so this works the
    // same at a domain root or a subpath (e.g. GitHub Pages' /radar-deck/).
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Non-fatal — the app still works without offline caching.
    });
  }
}
