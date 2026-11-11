import { countdownFor } from "./date";
import { isHttpUrl } from "./types";
import type { Card, Decision } from "./types";

/** Only ever assign through textContent / attribute whitelists below — never innerHTML with card data. */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeAnchor(label: string, url: string): HTMLAnchorElement | null {
  if (!isHttpUrl(url)) return null;
  const a = el("a", "link-pill", label);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  return a;
}

export function renderTagFlags(tag: string): HTMLElement {
  const wrap = el("div", "flags");
  for (const part of tag.split(",").map((s) => s.trim()).filter(Boolean)) {
    const chip = el("span", "flag", part);
    if (/below floor/i.test(part)) chip.classList.add("flag-floor");
    else chip.classList.add("flag-default");
    wrap.appendChild(chip);
  }
  return wrap;
}

export function renderCountdownChip(card: Card, now: Date = new Date()): HTMLElement {
  const c = countdownFor(card.due, card.deadline, now);
  const chip = el("span", `countdown countdown-${c.severity}`, c.label || undefined);
  if (!c.label) chip.classList.add("countdown-empty");
  return chip;
}

export function renderCardFace(card: Card, now: Date = new Date()): HTMLElement {
  const face = el("article", "card-face");
  face.setAttribute("role", "group");
  face.setAttribute("aria-label", card.title);

  const top = el("div", "card-top");
  top.appendChild(el("span", `tier tier-${card.rank}`, card.fit));
  top.appendChild(renderTagFlags(card.tag));
  top.appendChild(renderCountdownChip(card, now));
  face.appendChild(top);

  face.appendChild(el("h2", "card-title", card.title));
  face.appendChild(el("p", "card-type", card.type));

  const facts = el("dl", "card-facts");
  const addFact = (label: string, value: string) => {
    if (!value) return;
    facts.appendChild(el("dt", undefined, label));
    facts.appendChild(el("dd", undefined, value));
  };
  addFact("Pay", card.pay);
  addFact("Closes", card.deadline);
  addFact("Where", card.where);
  face.appendChild(facts);

  face.appendChild(el("p", "card-why", card.why));

  const links = el("div", "card-links");
  const primary = safeAnchor("Open posting", card.url);
  if (primary) links.appendChild(primary);
  for (const l of card.links ?? []) {
    const a = safeAnchor(l.label, l.url);
    if (a) links.appendChild(a);
  }
  if (card.cv) {
    const cvLink = safeAnchor("Tailored CV", card.cv.url);
    if (cvLink) links.appendChild(cvLink);
  }
  face.appendChild(links);

  const stampApply = el("div", "stamp stamp-apply", "APPLY");
  const stampPass = el("div", "stamp stamp-pass", "PASS");
  face.appendChild(stampApply);
  face.appendChild(stampPass);

  return face;
}

export function setStampOpacity(face: HTMLElement, direction: "left" | "right" | null, progress: number): void {
  const applyStamp = face.querySelector<HTMLElement>(".stamp-apply");
  const passStamp = face.querySelector<HTMLElement>(".stamp-pass");
  if (applyStamp) applyStamp.style.opacity = direction === "right" ? String(Math.min(1, progress)) : "0";
  if (passStamp) passStamp.style.opacity = direction === "left" ? String(Math.min(1, -progress)) : "0";
}

export function renderMetaHeader(container: HTMLElement, note: string): void {
  container.textContent = "";
  container.appendChild(el("span", "meta-note", note));
}

export type EmptyKind = "no-cards" | "deck-empty" | "filtered-empty" | "no-credentials" | "unreachable";

const EMPTY_COPY: Record<EmptyKind, { title: string; body: string }> = {
  "no-cards": { title: "Nothing yet", body: "The radar hasn't posted any cards." },
  "deck-empty": { title: "All caught up", body: "You've decided on every open item. Check back after the next run." },
  "filtered-empty": { title: "Nothing matches", body: "Try a lower tier filter to see more cards." },
  "no-credentials": { title: "Set up this device", body: "Enter the API URL and secret in Settings to load your deck." },
  unreachable: { title: "Can't reach the backend", body: "Showing the last saved deck, if there is one." },
};

export function renderEmptyState(container: HTMLElement, kind: EmptyKind, extra?: string): void {
  container.textContent = "";
  const box = el("div", "empty-state");
  const copy = EMPTY_COPY[kind];
  box.appendChild(el("h3", undefined, copy.title));
  box.appendChild(el("p", undefined, extra ?? copy.body));
  container.appendChild(box);
}

export function renderToast(container: HTMLElement, message: string, link?: { label: string; url: string }): void {
  const toast = el("div", "toast", message);
  if (link && isHttpUrl(link.url)) {
    const a = safeAnchor(link.label, link.url);
    if (a) {
      toast.appendChild(document.createTextNode(" "));
      toast.appendChild(a);
    }
  }
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));
  setTimeout(() => {
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

export function renderListRow(
  card: Card,
  id: string,
  decision: Decision,
  actions: { label: string; onClick: () => void }[]
): HTMLElement {
  const row = el("li", "list-row");
  row.dataset.id = id;
  row.appendChild(el("span", "list-title", card.title));
  if (decision.reason) row.appendChild(el("span", "list-reason", decision.reason));
  const actionsWrap = el("div", "list-actions");
  for (const action of actions) {
    const btn = el("button", "list-action", action.label);
    btn.type = "button";
    btn.addEventListener("click", action.onClick);
    actionsWrap.appendChild(btn);
  }
  row.appendChild(actionsWrap);
  return row;
}
