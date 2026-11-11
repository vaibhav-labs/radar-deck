// IST day math. Always derive "today" from a real clock read through the Asia/Kolkata
// time zone rather than local-machine time, so this works the same on any device.

const IST_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" for the given instant, in Asia/Kolkata. Defaults to now. */
export function istDateString(now: Date = new Date()): string {
  return IST_FORMATTER.format(now); // en-CA gives YYYY-MM-DD directly
}

function parseYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from today (IST) to `due` ("YYYY-MM-DD"). Negative = past. */
export function daysUntil(due: string, now: Date = new Date()): number {
  const today = parseYmd(istDateString(now));
  const target = parseYmd(due);
  return Math.round((target - today) / 86_400_000);
}

export interface Countdown {
  label: string;
  severity: "urgent" | "soon" | "plain";
}

/**
 * Countdown chip text for a card.
 * due === null and deadline starting with "Rolling" -> "Rolling".
 * due === null otherwise -> "" (no chip; the deadline text stands on its own).
 */
export function countdownFor(
  due: string | null,
  deadline: string,
  now: Date = new Date()
): Countdown {
  if (due === null) {
    if (/^rolling/i.test(deadline.trim())) {
      return { label: "Rolling", severity: "plain" };
    }
    return { label: "", severity: "plain" };
  }

  const days = daysUntil(due, now);

  if (days < 0) return { label: "Past", severity: "plain" };
  if (days === 0) return { label: "Closes today", severity: "urgent" };
  if (days === 1) return { label: "Tomorrow", severity: "urgent" };
  if (days <= 3) return { label: `${days} days`, severity: "urgent" };
  if (days <= 7) return { label: `${days} days`, severity: "soon" };
  return { label: `${days} days`, severity: "plain" };
}
