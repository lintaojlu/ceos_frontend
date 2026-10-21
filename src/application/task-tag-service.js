/**
 * 用设置里的创建标签模型，根据任务标题生成标签名，并挂到当前查看日的这一条上。
 * 这一行空着时用默认模型。
 */

import { LlmRequestError } from './llm-service.js';
import { TAG_DESCRIPTION_SYSTEM, buildTagDescriptionPrompt, descriptionFromModel, tasksForTag } from '../domain/schedule/tag-description.js';
import { TAG_NAME_SYSTEM, buildTagNamePrompt, projectFromModel } from '../domain/schedule/tag-name.js';

export class TaskTagService {
  /**
   * @param {object} deps
   * @param {import('./schedule-service.js').ScheduleService} deps.scheduleService
   * @param {import('./llm-service.js').LlmService} deps.llmService
   */
  constructor({ scheduleService, llmService }) {
    this.scheduleService = scheduleService;
    this.llmService = llmService;
  }

  /**
   * @param {'required'|'optional'} type
   * @param {string} taskId
   * @returns {Promise<string|null>}
   */
  async createForTask(type, taskId) {
    const dateKey = this.scheduleService.getDateKey();
    const task = this.scheduleService.findTaskOnDate(dateKey, type, taskId);
    if (!task) throw new Error('这条任务已经不在了');

    const title = String(task.text || '').trim();
    const notes = (Array.isArray(task.notes) ? task.notes : []).map((note) => note?.text || '');
    const projects = (this.scheduleService.workspace.tags || []).map((tag) => ({
      name: tag?.name || '',
      description: tag?.description || ''
    }));
    let raw = '';
    try {
      raw = await this.llmService.complete({
        slot: 'tagModel',
        maxTokens: 200,
        system: TAG_NAME_SYSTEM,
        user: buildTagNamePrompt({ title, notes, projects })
      });
    } catch (error) {
      if (error instanceof LlmRequestError && error.code === 'not-configured') throw error;
      raw = '';
    }
    const draft = projectFromModel(raw, title, projects);
    if (draft.skipped) return null;
    if (!draft.name) throw new Error('没有得到可用的标签名');

    const saved = this.scheduleService.attachTagNamed(type, taskId, draft.name, dateKey, draft.description);
    if (!saved) throw new Error('这条任务已经不在了');
    return draft.name;
  }

  /**
   * 根据这个标签在各天的任务，以及调用方传来的现有描述，生成一句新描述。不写入。
   * @param {string} tagId
   * @param {{ name?: string, description?: string }} [draft]
   * @returns {Promise<string>}
   */
  async generateDescription(tagId, draft = {}) {
    const tag = (this.scheduleService.workspace.tags || []).find((item) => item.id === tagId);
    if (!tag) throw new Error('这个标签已经不在了');
    const name = String(draft.name ?? tag.name ?? '').trim() || tag.name;
    const description = draft.description !== undefined ? draft.description : (tag.description || '');
    const tasks = tasksForTag(this.scheduleService.data, tagId);
    const raw = await this.llmService.complete({
      slot: 'tagModel',
      maxTokens: 200,
      system: TAG_DESCRIPTION_SYSTEM,
      user: buildTagDescriptionPrompt({ name, description, tasks })
    });
    const next = descriptionFromModel(raw);
    if (!next) throw new Error('没有得到可用的描述');
    return next;
  }
}
