import { parseDateKey } from '../shared/date-key.js';
import { readListDay, readOpenDays, readReadyIdeas } from './reads.js';

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/**
 * @param {string} template
 * @param {Record<string, string>} values
 */
export function fillAgentContext(template, values) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (token, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : token
  ));
}

/** @param {string} today */
export function weekdayLabel(today) {
  const date = parseDateKey(today);
  if (!date) return '';
  return WEEKDAYS[date.getDay()];
}

/**
 * @param {Record<string, any>} schedule
 * @param {string} date
 * @param {Array<{ id: string, name: string }>} tags
 */
function formatDay(schedule, date, tags) {
  const day = readListDay(schedule, date);
  const rows = [
    ...day.required.map((task) => ({ ...task, list: '必做' })),
    ...day.optional.map((task) => ({ ...task, list: '选做' }))
  ];
  if (!rows.length) return `${date}\n这一天没有任务`;
  const lines = rows.map((task) => {
    const tag = tags.find((item) => item.id === task.tagId);
    const tagName = tag ? tag.name : '不挂';
    const state = task.completed ? '已完成' : '未完成';
    return `- id=${task.id} ${task.list} ${state} 标签=${tagName} ${task.text}`;
  });
  return `${date}\n${lines.join('\n')}`;
}

/**
 * @param {string} template
 * @param {object} input
 * @param {string} input.today
 * @param {Array<{ id: string, name: string }>} input.tags
 * @param {Record<string, any>} input.schedule
 * @param {any[]} input.ideas
 * @param {string[]} input.writableDates
 */
export function buildAgentContext(template, input) {
  const tags = input.tags || [];
  const writableDates = input.writableDates || [];
  const today = input.today || '';
  const ready = readReadyIdeas(input.ideas, input.schedule, today, today);
  const openDays = readOpenDays(input.schedule, '').filter((row) => !writableDates.includes(row.date));
  const tasks = writableDates.map((date) => formatDay(input.schedule, date, tags)).join('\n\n');
  return fillAgentContext(template, {
    today,
    weekday: weekdayLabel(today),
    writableDates: writableDates.join('、') || '无',
    tags: tags.length ? tags.map((tag) => {
      const line = `${tag.name} id=${tag.id}`;
      const boundary = String(tag.description || '').trim();
      return boundary ? `${line}：${boundary}` : line;
    }).join('\n') : '无',
    tasks: tasks || '无',
    readyIdeas: ready.length ? ready.map((idea) => idea.text).filter(Boolean).join('\n') || '无' : '无',
    openDays: openDays.length ? openDays.map((row) => `${row.date} ${row.openCount}条`).join('\n') : '无'
  });
}
