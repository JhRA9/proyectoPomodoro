export function projectTasks(state, projectId) {
  return state.tasks.filter((task) => task.projectId === projectId);
}

export function projectStats(state, projectId) {
  const tasks = projectTasks(state, projectId);
  const completed = tasks.filter((task) => task.status === "completed").length;
  const pending = tasks.length - completed;
  return { total: tasks.length, completed, pending, progress: tasks.length ? Math.round((completed / tasks.length) * 100) : 0 };
}

function chronologicalEntries(state, entries) {
  const sessionTimes = new Map(state.focusSessions.map((session) => [session.id, session.endedAt]));
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const aTime = a.entry.createdAt ?? sessionTimes.get(a.entry.focusSessionId) ?? `${a.entry.date}T12:00:00.000Z`;
      const bTime = b.entry.createdAt ?? sessionTimes.get(b.entry.focusSessionId) ?? `${b.entry.date}T12:00:00.000Z`;
      return aTime.localeCompare(bTime) || a.index - b.index;
    })
    .map(({ entry }) => entry);
}

export function taskEntries(state, taskId) {
  return chronologicalEntries(state, state.learningEntries.filter((entry) => entry.taskId === taskId));
}

export function projectEntries(state, projectId) {
  return chronologicalEntries(state, state.learningEntries.filter((entry) => entry.projectId === projectId));
}

export function sessionsToday(state, taskId, todayKey) {
  return state.focusSessions.filter((session) => {
    const ended = new Date(session.endedAt);
    const localKey = `${ended.getFullYear()}-${String(ended.getMonth() + 1).padStart(2, "0")}-${String(ended.getDate()).padStart(2, "0")}`;
    return session.taskId === taskId && localKey === todayKey;
  });
}
