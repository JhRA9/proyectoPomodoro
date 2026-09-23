import { describe, expect, it, vi } from "vitest";
import { calendarCells, differenceInCalendarDays, dueCategory, formatDuration, formatElapsedTimer, formatFocusTimer, formatTime, formatTimer, parseLocalDate } from "../src/utils/time.js";

describe("date and time utilities", () => {
  it("formats task deadlines with a 12-hour clock", () => {
    expect(formatTime("00:05")).toBe("12:05 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("18:45")).toBe("6:45 PM");
    expect(formatTime("invalid")).toBe("");
  });

  it("parses local calendar dates without accepting invalid days", () => {
    expect(parseLocalDate("2024-02-29")).toBeInstanceOf(Date);
    expect(parseLocalDate("2025-02-29")).toBeNull();
    expect(parseLocalDate("not-a-date")).toBeNull();
  });

  it("assigns deterministic due categories", () => {
    const now = new Date(2026, 8, 15, 12);
    expect(dueCategory({ dueDate: "2026-09-14", status: "pending" }, now)).toBe("overdue");
    expect(dueCategory({ dueDate: "2026-09-16", status: "pending" }, now)).toBe("urgent");
    expect(dueCategory({ dueDate: "2026-09-20", status: "pending" }, now)).toBe("soon");
    expect(dueCategory({ dueDate: "2026-10-10", status: "pending" }, now)).toBe("future");
    expect(dueCategory({ dueDate: "2026-09-16", status: "completed" }, now)).toBe("completed");
    expect(differenceInCalendarDays("2026-09-16", now)).toBe(1);
  });

  it("builds a complete monday-first calendar grid", () => {
    const cells = calendarCells(2026, 8);
    expect(cells).toHaveLength(42);
    expect(cells[0].key).toBe("2026-08-31");
    expect(cells.some((cell) => cell.key === "2026-09-30" && cell.inMonth)).toBe(true);
  });

  it("formats accumulated and overtime durations", () => {
    expect(formatDuration(5400, true)).toBe("1h 30min");
    expect(formatTimer(0, 1500)).toBe("25:00");
    expect(formatTimer(1565, 1500)).toBe("+01:05");
    expect(formatTimer(0, 5 * 3600 + 37 * 60)).toBe("05:37:00");
    expect(formatElapsedTimer(3661)).toBe("01:01:01");
    expect(formatFocusTimer(65, null)).toBe("01:05");
  });
});
