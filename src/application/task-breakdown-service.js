/**
 * 把一条任务整理成 agent 输入框草稿：上下文块 + 短正文 + 任务 mention。
 * 真正的拆解由用户发送后走 agent。
 */

import { normalizeNotes, normalizeTagIds } from '../domain/schedule/daily-task.js';
import {
  BREAKDOWN_USER_PROMPT,
  buildBreakdownContext,
  selectRelatedTasks
} from '../domain/schedule/task-breakdown.js';

export class TaskBreakdownService {
  /**
   * @param {object} deps
   * @param {import('./schedule-service.js').ScheduleService} deps.scheduleService
   */
  constructor({ scheduleService }) {
    this.scheduleService = scheduleService;
  }

  /**
   * @param {'required'|'optional'} type
   * @param {string} taskId
   * @returns {{ context: string, body: string, mentions: any[], flyText: string, dateKey: string }}
   */
  prepareComposer(type, taskId) {
    const dateKey = this.scheduleService.getDateKey();
    const task = this.scheduleService.findTaskOnDate(dateKey, type, taskId);
    if (!task) throw new Error('这条任务已经不在了');

    const tags = this.scheduleService.workspace?.tags || [];
    const nameById = new Map(tags.map((tag) => [tag.id, tag.name]));
    const tagIds = normalizeTagIds(task);
    const related = selectRelatedTasks({
      days: this.scheduleService.data,
      taskId,
      tagIds
    });
    const notes = normalizeNotes(task.notes, { note: task.note, subtasks: task.subtasks });
    const title = task.text || '';
    const context = buildBreakdownContext({
      title,
      tagNames: namesFor(tagIds, nameById),
      notes: notes.map((note) => note.text),
      related: related.map((item) => ({
        dateKey: item.dateKey,
        text: item.text,
        completed: item.completed,
        tagNames: namesFor(item.tagIds, nameById)
      }))
    });
    const body = BREAKDOWN_USER_PROMPT;
    const mentions = [{
      kind: 'task',
      id: task.id,
      title,
      date: dateKey,
      label: `${dateKey} ${title}`.trim()
    }];
    return { context, body, mentions, flyText: body, dateKey };
  }
}

/**
 * @param {string[]} ids
 * @param {Map<string, string>} nameById
 * @returns {string[]}
 */
function namesFor(ids, nameById) {
  return ids.map((id) => nameById.get(id)).filter(Boolean);
}
