/**
 * 任务页回车新建之后静默跑一遍：没有标签才分类，再一次问 JEV 要不要标准化和拆解。
 * 失败不抛出，也不写到任务行上。
 */

import { normalizeNotes, normalizeTagIds } from '../domain/schedule/daily-task.js';

export class TaskIntakeService {
  /**
   * @param {object} deps
   * @param {import('./schedule-service.js').ScheduleService} deps.scheduleService
   * @param {import('./jev-service.js').JevService} deps.jevService
   * @param {import('./task-tag-service.js').TaskTagService} deps.taskTagService
   * @param {import('./task-standardize-service.js').TaskStandardizeService} deps.taskStandardizeService
   * @param {import('./task-breakdown-service.js').TaskBreakdownService} deps.taskBreakdownService
   */
  constructor({ scheduleService, jevService, taskTagService, taskStandardizeService, taskBreakdownService }) {
    this.scheduleService = scheduleService;
    this.jevService = jevService;
    this.taskTagService = taskTagService;
    this.taskStandardizeService = taskStandardizeService;
    this.taskBreakdownService = taskBreakdownService;
  }

  /**
   * @param {'required'|'optional'} type
   * @param {string} taskId
   * @returns {Promise<void>}
   */
  async settle(type, taskId) {
    try {
      await this.classify(type, taskId);
      const snapshot = this.read(type, taskId);
      if (!snapshot) return;
      const decision = await this.judge(snapshot);
      if (decision.standardize && this.read(type, taskId)) {
        try {
          await this.taskStandardizeService.standardize(type, taskId);
        } catch {
          // 静默。失败不写到任务行。
        }
      }
      // 静默拆解先关掉：拆解改走输入框 + agent，避免往对话里自动灌消息。
    } catch {
      // 静默。整段流程都不打断新建。
    }
  }

  /**
   * @param {'required'|'optional'} type
   * @param {string} taskId
   */
  async classify(type, taskId) {
    const task = this.scheduleService.findTaskOnDate(this.scheduleService.getDateKey(), type, taskId);
    if (task && normalizeTagIds(task).length > 0) return;
    try {
      await this.taskTagService.createForTask(type, taskId);
    } catch {
      // 分类失败也继续判断。
    }
  }

  /**
   * @param {{ title: string, notes: string[], projects: string[] }} snapshot
   * @returns {Promise<{ standardize: boolean, breakdown: boolean }>}
   */
  async judge(snapshot) {
    try {
      return await this.jevService.decide(snapshot);
    } catch {
      return { standardize: false, breakdown: false };
    }
  }

  /**
   * 分类之后再读当前查看日的这一条。任务不在了就返回 null。
   * @param {'required'|'optional'} type
   * @param {string} taskId
   * @returns {{ title: string, notes: string[], projects: string[] }|null}
   */
  read(type, taskId) {
    const dateKey = this.scheduleService.getDateKey();
    const task = this.scheduleService.findTaskOnDate(dateKey, type, taskId);
    if (!task) return null;
    const notes = normalizeNotes(task.notes, { note: task.note, subtasks: task.subtasks }).map((note) => note.text);
    const nameById = new Map((this.scheduleService.workspace?.tags || []).map((tag) => [tag.id, tag.name]));
    const projects = normalizeTagIds(task).map((id) => nameById.get(id)).filter(Boolean);
    return { title: task.text || '', notes, projects };
  }
}
