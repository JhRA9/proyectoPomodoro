export function isDailyRecurringTask(task) {
  return task?.recurrence?.frequency === "daily";
}

export function isRecurringTaskActiveOn(task, dateKey) {
  if (!isDailyRecurringTask(task) || !dateKey) return false;
  const { startDate, endDate } = task.recurrence;
  return dateKey >= startDate && (!endDate || dateKey <= endDate);
}

export function isRecurringOccurrenceCompleted(task, dateKey) {
  return isDailyRecurringTask(task) && task.recurrence.completedDates.includes(dateKey);
}

export function isRecurringTaskFinished(task, dateKey) {
  return isDailyRecurringTask(task) && Boolean(task.recurrence.endDate && dateKey > task.recurrence.endDate);
}

export function recurringDateRangeLabel(task, formatDate) {
  if (!isDailyRecurringTask(task)) return "";
  const start = formatDate(task.recurrence.startDate, { year: true });
  const end = task.recurrence.endDate ? formatDate(task.recurrence.endDate, { year: true }) : "sin fecha final";
  return `Todos los días · ${start} – ${end}`;
}
