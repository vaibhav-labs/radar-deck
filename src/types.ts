// Data contract — identical to the claude.ai "Radar Deck" artifact database.
// Cards and meta/handled are written only by the radar. Decisions are written only by this app.

export type Fit = "Very strong" | "Strong" | "Moderate" | "Weak";

export const FIT_RANK: Record<Fit, 0 | 1 | 2 | 3> = {
  "Very strong": 0,
  Strong: 1,
  Moderate: 2,
  Weak: 3,
};

export interface CardLink {
  label: string;
  url: string;
}

export interface Card {
  title: string;
  tag: string; // "NEW", "RE-ADDED", "UPGRADED", "NEW, below floor", or ""
  fit: Fit;
  rank: 0 | 1 | 2 | 3;
  pay: string;
  deadline: string;
  where: string;
  type: string;
  why: string;
  due: string | null; // "YYYY-MM-DD" or null
  url: string;
  links?: CardLink[];
  open: boolean; // false = closed, hidden from the deck
  closedOn?: string;
  closedWhy?: string;
  firstSeen: string; // "YYYY-MM-DD"
  updated: string; // "YYYY-MM-DD"
  rowId: string;
  cv?: {
    url: string;
    at: string;
    note: string;
  };
}

export type DecisionAction = "apply" | "reject" | "later";

export type RejectReason =
  | "Pay"
  | "Location or visa"
  | "Level"
  | "Not my field"
  | "Timing"
  | "Already handled";

export interface Decision {
  action: DecisionAction;
  cv?: boolean;
  applied?: boolean;
  appliedAt?: string; // ISO
  at: string; // ISO — time of the last change to this decision
  until?: string; // ISO — "later" only
  reason?: RejectReason;
  title: string;
  url: string;
  fit: Fit;
}

export interface Meta {
  runDate: string;
  runAt: string; // ISO UTC
  open: number;
  added: number;
  closed: number;
  tiers: Record<Fit, number>;
  note: string;
}

export type Handled = Record<string, string>; // id -> decision.at already acted on by the radar

export interface Deck {
  meta: Meta | null;
  cards: Record<string, Card>;
  decisions: Record<string, Decision>;
  serverTime?: string; // ISO, from the Apps Script backend
}

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
