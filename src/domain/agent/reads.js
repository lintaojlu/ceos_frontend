import { partitionIdeas } from '../ideas/readiness.js';
import { normalizeNotes, normalizeTagIds } from '../schedule/daily-task.js';

/**
 * @param {any} task
 */
export function taskView(task) {
  const tagIds = normalizeTagIds(task);
  const notes = normalizeNotes(task?.notes, { note: task?.note, subtasks: task?.subtasks });
  return {
    id: task.id,
    text: task.text || '',
    note: '',
    completed: !!task.completed,
    tagId: tagIds[0] || '',
    subtasks: notes.map((item) => ({
      id: item.id,
      text: item.text,
      completed: false
    }))
  };
}

/**
 * @param {Record<string, any>} schedule
 * @param {string} date
 */
function dayLists(schedule, date) {
  const day = schedule?.[date];
  return {
    required: Array.isArray(day?.required) ? day.required : [],
    optional: Array.isArray(day?.optional) ? day.optional : []
  };
}

/** @param {Array<{ id: string, name: string, description?: string }>} tags */
export function readListTags(tags) {
  return (tags || []).map((tag) => ({
    id: tag.id,
    name: tag.name || '',
    description: tag.description || ''
  }));
}

/**
 * @param {Record<string, any>} schedule
 * @param {string} date
 */
export function readListDay(schedule, date) {
  const lists = dayLists(schedule, date);
  return {
    date,
    required: lists.required.map(taskView),
    optional: lists.optional.map(taskView)
  };
}

/**
 * @param {Record<string, any>} schedule
 * @param {string} excludeDate
 */
export function readOpenDays(schedule, excludeDate) {
  return Object.keys(schedule || {})
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date !== excludeDate)
    .map((date) => {
      const open = [...dayLists(schedule, date).required, ...dayLists(schedule, date).optional].filter(
        (task) => task && task.text && !task.completed
      );
      return { date, openCount: open.length, titles: open.map((task) => task.text) };
    })
    .filter((row) => row.openCount > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * @param {Record<string, any>} schedule
 * @param {string} date
 */
export function readOpenTasks(schedule, date) {
  const lists = dayLists(schedule, date);
  const open = (list) => lists[list].filter((task) => task && !task.completed).map(taskView);
  return { date, required: open('required'), optional: open('optional') };
}

/**
 * @param {string[]} used
 * @param {string} date
 * @returns {{ ok: true, used: string[] } | { ok: false, error: string }}
 */
export function noteDetailDate(used, date) {
  const next = used.includes(date) ? used : [...used, date];
  if (next.length > 7) return { ok: false, error: '一轮最多查看 7 天的未完成明细' };
  return { ok: true, used: next };
}

/**
 * @param {any[]} ideas
 * @param {Record<string, any>} schedule
 * @param {string} today
 * @param {string} dayKey
 */
export function readReadyIdeas(ideas, schedule, today, dayKey) {
  const parts = partitionIdeas(ideas || [], { schedule, ideas: ideas || [], todayKey: today, dayKey });
  return parts.ready.map((idea) => ({
    id: idea.id,
    text: idea.title || idea.text || ''
  }));
}
