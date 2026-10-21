/**
 * 根据标签已有的任务和现有描述，生成一句描述。只收一段 JSON。
 */

import { normalizeNotes, normalizeTagIds } from './daily-task.js';
import { clipTagDescription } from './tag-name.js';

export const TAG_DESCRIPTION_SYSTEM = '只输出 JSON：{"description":"<描述>"}。不解释、不询问，不返回除了 JSON 外任何内容。description 用一句话说明什么情况下任务属于该标签，不超过 80 个字。根据已有任务和现有描述来写：现有描述里还成立的范围留下，任务里看出来的范围补上或收紧。';

const TASK_LIMIT = 40;
const NOTE_LIMIT = 80;

/**
 * 同一条任务在多天各有一份时，保留日期最晚的那一份。
 * @param {Record<string, { required?: any[], optional?: any[] }>} schedule
 * @param {string} tagId
 * @returns {{ date: string, title: string, notes: string[] }[]}
 */
export function tasksForTag(schedule, tagId) {
  /** @type {Map<string, { date: string, title: string, notes: string[] }>} */
  const byId = new Map();
  const dates = Object.keys(schedule || {}).filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key)).sort();
  dates.forEach((date) => {
    const day = schedule[date];
    ['required', 'optional'].forEach((list) => {
      (day?.[list] || []).forEach((task) => {
        if (!task || !normalizeTagIds(task).includes(tagId)) return;
        const title = String(task.text || '').trim();
        if (!title) return;
        const id = String(task.id || `${date}:${title}`);
        const notes = normalizeNotes(task.notes, task).map((note) => note.text).filter(Boolean);
        const prev = byId.get(id);
        if (!prev || prev.date <= date) byId.set(id, { date, title, notes });
      });
    });
  });
  return [...byId.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title < b.title ? -1 : 1));
}

/**
 * @param {string} value
 * @returns {string}
 */
function clipNote(value) {
  return Array.from(String(value || '').trim()).slice(0, NOTE_LIMIT).join('');
}

/**
 * @param {object} input
 * @param {string} [input.name]
 * @param {string} [input.description]
 * @param {{ date?: string, title?: string, notes?: string[] }[]} [input.tasks]
 * @returns {string}
 */
export function buildTagDescriptionPrompt({ name = '', description = '', tasks = [] } = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const shown = list.length > TASK_LIMIT ? list.slice(list.length - TASK_LIMIT) : list;
  const lines = shown.map((task) => {
    const title = String(task?.title || '').trim();
    const date = String(task?.date || '').trim();
    const head = date ? `- ${date} ${title}` : `- ${title}`;
    const note = (Array.isArray(task?.notes) ? task.notes : []).map(clipNote).filter(Boolean).join(' ');
    return note ? `${head}\n  ${note}` : head;
  });
  if (list.length > shown.length) lines.unshift(`共 ${list.length} 条，下面是最近 ${shown.length} 条。`);
  const current = String(description || '').trim();
  return [
    '标签名称：',
    String(name || '').trim(),
    '',
    '现有描述：',
    current || '无',
    '',
    '已有任务：',
    lines.length ? lines.join('\n') : '无'
  ].join('\n');
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function descriptionFromModel(raw) {
  let text = String(raw || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.description === 'string') return clipTagDescription(parsed.description);
  } catch {
    return '';
  }
  return '';
}
