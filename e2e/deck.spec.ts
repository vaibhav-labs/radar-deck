import { expect, test, type Page } from "@playwright/test";
import type { Card, Decision } from "../src/types";

// Synthetic fixtures, not real radar output. Four cards covering every action this
// test exercises, ordered by rank so the default sort gives a deterministic top card.
const cards: Record<string, Card> = {
  cardA: {
    title: "Card A",
    tag: "NEW",
    fit: "Very strong",
    rank: 0,
    pay: "$200k",
    deadline: "Rolling",
    where: "Remote",
    type: "Job",
    why: "Swiped right in this test.",
    due: null,
    url: "https://example.org/a",
    open: true,
    firstSeen: "2026-11-01",
    updated: "2026-11-01",
    rowId: ".a",
  },
  cardB: {
    title: "Card B",
    tag: "",
    fit: "Strong",
    rank: 1,
    pay: "$150k",
    deadline: "Rolling",
    where: "Remote",
    type: "Job",
    why: "Swiped left in this test.",
    due: null,
    url: "https://example.org/b",
    open: true,
    firstSeen: "2026-11-01",
    updated: "2026-11-01",
    rowId: ".b",
  },
  cardC: {
    title: "Card C",
    tag: "",
    fit: "Moderate",
    rank: 2,
    pay: "$130k",
    deadline: "Rolling",
    where: "Remote",
    type: "Job",
    why: "Snoozed with Later in this test.",
    due: null,
    url: "https://example.org/c",
    open: true,
    firstSeen: "2026-11-01",
    updated: "2026-11-01",
    rowId: ".c",
  },
  cardD: {
    title: "Card D",
    tag: "",
    fit: "Weak",
    rank: 3,
    pay: "$110k",
    deadline: "Rolling",
    where: "Remote",
    type: "Job",
    why: "CV-first, then undone, in this test.",
    due: null,
    url: "https://example.org/d",
    open: true,
    firstSeen: "2026-11-01",
    updated: "2026-11-01",
    rowId: ".d",
  },
};

// Shaped like a real Apps Script exec URL (and on an allowed CSP connect-src host) —
// fully intercepted by mockBackend() below, never actually reaches script.google.com.
const API_URL = "https://script.google.com/macros/s/fake-test-deployment/exec";
const SECRET = "test-secret";

/** A tiny stateful fake of the Apps Script backend, so reloads reflect prior decisions. */
async function mockBackend(page: Page) {
  const decisions: Record<string, Decision> = {};

  await page.route(`${API_URL}**`, async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ meta: null, cards, decisions, serverTime: new Date().toISOString() }),
      });
      return;
    }
    if (req.method() === "POST") {
      const body = JSON.parse(req.postData() ?? "{}");
      const { id, decision } = body as { id: string; decision: Decision | null };
      if (decision === null) delete decisions[id];
      else decisions[id] = decision;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.continue();
  });
}

async function setCredentials(page: Page) {
  await page.addInitScript(
    ({ url, secret }) => {
      localStorage.setItem("radar-deck:apiUrl", url);
      localStorage.setItem("radar-deck:secret", secret);
    },
    { url: API_URL, secret: SECRET }
  );
}

async function topCard(page: Page) {
  return page.locator(".card-wrapper").last();
}

async function swipe(page: Page, dx: number) {
  const card = await topCard(page);
  const box = await card.boundingBox();
  if (!box) throw new Error("no card to swipe");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(startX + (dx * step) / 8, startY, { steps: 1 });
  }
  await page.mouse.up();
}

test("swipe, pass with a reason, later, CV-first, undo, then offline reload", async ({ page, context }) => {
  await mockBackend(page);
  await setCredentials(page);
  await page.goto("/");
  // The page that calls register() is never controlled by that worker — it starts
  // controlling on the *next* navigation. Wait for install to finish here regardless.
  await page.evaluate(() => navigator.serviceWorker.ready);

  await expect(page.getByRole("heading", { name: "Card A" })).toBeVisible();

  // Swipe right on Card A -> Apply, with a link toast.
  const [decideA] = await Promise.all([
    page.waitForRequest((r) => r.url().startsWith(API_URL) && r.method() === "POST"),
    swipe(page, 200),
  ]);
  expect(JSON.parse(decideA.postData() ?? "{}").decision.action).toBe("apply");
  await expect(page.locator(".toast")).toContainText(/Saved as Apply|Open it/);
  await expect(page.getByRole("heading", { name: "Card B" })).toBeVisible();

  // Swipe left on Card B -> Pass, then pick a reason chip.
  const [decideB] = await Promise.all([
    page.waitForRequest((r) => r.url().startsWith(API_URL) && r.method() === "POST"),
    swipe(page, -200),
  ]);
  expect(JSON.parse(decideB.postData() ?? "{}").decision.action).toBe("reject");
  await expect(page.locator(".reason-bar")).toBeVisible();
  const [decideBReason] = await Promise.all([
    page.waitForRequest((r) => r.url().startsWith(API_URL) && r.method() === "POST"),
    page.getByRole("button", { name: "Pay" }).click(),
  ]);
  expect(JSON.parse(decideBReason.postData() ?? "{}").decision.reason).toBe("Pay");
  await expect(page.getByRole("heading", { name: "Card C" })).toBeVisible();

  // Later on Card C.
  const [decideC] = await Promise.all([
    page.waitForRequest((r) => r.url().startsWith(API_URL) && r.method() === "POST"),
    page.locator(".action-later").click(),
  ]);
  expect(JSON.parse(decideC.postData() ?? "{}").decision.action).toBe("later");
  await expect(page.locator(".toast").last()).toContainText("Back in 3 days");
  await expect(page.getByRole("heading", { name: "Card D" })).toBeVisible();

  // CV first on Card D opens a popup and records cv:true.
  const [popup, decideD] = await Promise.all([
    context.waitForEvent("page"),
    page.waitForRequest((r) => r.url().startsWith(API_URL) && r.method() === "POST"),
    page.locator(".action-cv").click(),
  ]);
  const decideDBody = JSON.parse(decideD.postData() ?? "{}");
  expect(decideDBody.decision.action).toBe("apply");
  expect(decideDBody.decision.cv).toBe(true);
  await popup.close();

  // Deck is now empty — all four cards decided.
  await expect(page.locator("#deck-empty")).toBeVisible();
  await expect(page.locator("#deck-empty")).toContainText("All caught up");

  // Undo brings Card D back.
  const [undoReq] = await Promise.all([
    page.waitForRequest((r) => r.url().startsWith(API_URL) && r.method() === "POST"),
    page.locator("#undo-btn").click(),
  ]);
  expect(JSON.parse(undoReq.postData() ?? "{}").decision).toBeNull();
  await expect(page.getByRole("heading", { name: "Card D" })).toBeVisible();

  // Reload once while still online: this navigation is the first one the now-active
  // service worker actually controls, so its fetch handler runtime-caches the app
  // shell (HTML/JS/CSS/icons) as it fetches them. Give those cache.put calls a moment
  // to settle before going offline.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Card D" })).toBeVisible();
  await page.waitForTimeout(500);

  // Drop the backend mock first: route.fulfill() answers locally regardless of
  // network state, so leaving it in place would mask a real offline failure.
  await page.unroute(`${API_URL}**`);

  // Now reload offline: the app shell comes from the SW cache, and the deck falls
  // back to the IndexedDB-cached data, still showing Card D.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#meta-note")).toContainText("offline");
  await expect(page.getByRole("heading", { name: "Card D" })).toBeVisible();
});
