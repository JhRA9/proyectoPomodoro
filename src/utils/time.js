const DAY_MS = 86_400_000;

export function toLocalDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysKey(offset, from = new Date()) {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
  return toLocalDateKey(date);
}

export function parseLocalDate(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey ?? "")) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function differenceInCalendarDays(dateKey, now = new Date()) {
  const target = parseLocalDate(dateKey);
  if (!target) return Number.POSITIVE_INFINITY;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

export function dueCategory(task, now = new Date()) {
  if (!task?.dueDate) return "none";
  if (task.status === "completed") return "completed";
  const days = differenceInCalendarDays(task.dueDate, now);
  if (days < 0) return "overdue";
  if (days <= 2) return "urgent";
  if (days <= 7) return "soon";
  return "future";
}

export function formatDate(dateKey, options = {}) {
  const date = parseLocalDate(dateKey);
  if (!date) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: options.long ? "long" : "short",
    year: options.year ? "numeric" : undefined,
  }).format(date);
}

export function formatTime(timeValue) {
  const value = String(timeValue ?? "");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return "";
  const [hours, minutes] = value.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
}

export function dueDateTimeLabel(task, options = {}) {
  if (!task?.dueDate) return "Sin fecha límite";
  const date = formatDate(task.dueDate, options);
  const time = formatTime(task.dueTime);
  return time ? `${date} a las ${time}` : date;
}

export function relativeDueLabel(dateKey, now = new Date()) {
  const days = differenceInCalendarDays(dateKey, now);
  if (days < -1) return `Venció hace ${Math.abs(days)} días`;
  if (days === -1) return "Venció ayer";
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  return `Vence en ${days} días`;
}

export function formatDuration(totalSeconds = 0, compact = false) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (compact) {
    if (hours) return `${hours}h ${minutes}min`;
    if (minutes) return `${minutes}min`;
    return `${rest}s`;
  }
  return [hours, minutes, rest].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatElapsedTimer(totalSeconds = 0, forceHours = false) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (forceHours || hours > 0) {
    return [hours, minutes, rest].map((part) => String(part).padStart(2, "0")).join(":");
  }
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function formatTimer(elapsedSeconds, targetSeconds) {
  const elapsed = Math.max(0, Math.floor(elapsedSeconds));
  const remaining = targetSeconds - elapsed;
  const forceHours = Math.max(Math.abs(remaining), targetSeconds) >= 3600;
  return `${remaining < 0 ? "+" : ""}${formatElapsedTimer(Math.abs(remaining), forceHours)}`;
}

export function formatFocusTimer(elapsedSeconds, targetSeconds) {
  return targetSeconds === null ? formatElapsedTimer(elapsedSeconds) : formatTimer(elapsedSeconds, targetSeconds);
}

export function calendarCells(year, monthIndex) {
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const gridStart = new Date(year, monthIndex, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    return {
      key: toLocalDateKey(date),
      day: date.getDate(),
      inMonth: date.getMonth() === monthIndex,
      isToday: toLocalDateKey(date) === toLocalDateKey(),
    };
  });
}

export function monthLabel(year, monthIndex) {
  const label = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(new Date(year, monthIndex, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
