import { describe, expect, it } from "vitest";
import { countdownFor, daysUntil, istDateString } from "../src/date";

describe("istDateString", () => {
  it("rolls over at IST midnight, not UTC midnight", () => {
    // 18:00 UTC on 11 Nov = 23:30 IST on 11 Nov (still the 11th in IST).
    expect(istDateString(new Date("2026-11-11T18:00:00Z"))).toBe("2026-11-11");
    // 19:00 UTC on 11 Nov = 00:30 IST on 12 Nov (already the 12th in IST).
    expect(istDateString(new Date("2026-11-11T19:00:00Z"))).toBe("2026-11-12");
  });
});

describe("daysUntil", () => {
  it("counts whole IST days, independent of the time of day", () => {
    const due = "2026-11-15";
    expect(daysUntil(due, new Date("2026-11-11T19:00:00Z"))).toBe(3); // just after IST midnight on the 12th
    expect(daysUntil(due, new Date("2026-11-11T18:00:00Z"))).toBe(4); // just before, still the 11th in IST
  });

  it("is negative for a date already past", () => {
    expect(daysUntil("2026-11-01", new Date("2026-11-11T12:00:00Z"))).toBeLessThan(0);
  });
});

describe("countdownFor", () => {
  it("labels across the IST midnight boundary consistently", () => {
    const due = "2026-11-12";
    // Just before IST midnight on the 11th -> due is tomorrow.
    expect(countdownFor(due, "12 Nov", new Date("2026-11-11T18:00:00Z"))).toEqual({
      label: "Tomorrow",
      severity: "urgent",
    });
    // Just after IST midnight -> it's now the 12th, due today.
    expect(countdownFor(due, "12 Nov", new Date("2026-11-11T19:00:00Z"))).toEqual({
      label: "Closes today",
      severity: "urgent",
    });
  });

  it("escalates severity as the deadline nears", () => {
    const now = new Date("2026-11-11T06:00:00Z"); // 11:30 IST on 11 Nov
    expect(countdownFor("2026-11-11", "x", now).severity).toBe("urgent"); // today
    expect(countdownFor("2026-11-14", "x", now).severity).toBe("urgent"); // 3 days
    expect(countdownFor("2026-11-17", "x", now).severity).toBe("soon"); // 6 days
    expect(countdownFor("2026-11-30", "x", now).severity).toBe("plain"); // 19 days
  });

  it("shows Rolling for a null due date with a Rolling deadline, nothing otherwise", () => {
    expect(countdownFor(null, "Rolling (posted 3 Nov)", new Date())).toEqual({
      label: "Rolling",
      severity: "plain",
    });
    expect(countdownFor(null, "Apply by email", new Date())).toEqual({ label: "", severity: "plain" });
  });

  it("labels a past due date as Past", () => {
    expect(countdownFor("2026-01-01", "1 Jan", new Date("2026-11-11T06:00:00Z")).label).toBe("Past");
  });
});
