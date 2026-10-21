import { describe, expect, it } from 'vitest';
import { EventBus } from './event-bus.js';
import { LlmService } from './llm-service.js';
import { ScheduleService } from './schedule-service.js';
import { TaskTagService } from './task-tag-service.js';
import { LocalStorageAdapter } from '../infrastructure/storage/local-storage-adapter.js';
import { ScheduleRepository } from '../infrastructure/storage/schedule-repository.js';
import { WorkspaceRepository } from '../infrastructure/storage/workspace-repository.js';
import { TAG_PALETTE } from '../domain/schedule/tag-palette.js';
import { addDays, getDateKey } from '../domain/shared/date-key.js';

function createSchedule() {
  const store = {};
  const adapter = new LocalStorageAdapter({
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; }
  });
  const service = new ScheduleService({
    scheduleRepo: new ScheduleRepository(adapter),
    workspaceRepo: new WorkspaceRepository(adapter),
    eventBus: new EventBus()
  });
  service.load();
  return service;
}

function llm(settings, chat) {
  return new LlmService({
    settingsRepo: { load: () => settings, save: (next) => next },
    eventBus: new EventBus(),
    chat
  });
}

describe('TaskTagService', () => {
  it('uses the default model when the tag model is empty', async () => {
    const schedule = createSchedule();
    const task = schedule.addTask('required', '写右键菜单');
    let seen = null;
    const service = new TaskTagService({
      scheduleService: schedule,
      llmService: llm(
        { baseUrl: 'https://example.com/v1', fullUrl: false, apiKey: 'k', model: 'big-model', tagModel: '' },
        async (input) => { seen = input; return '{"project":"日程"}'; }
      )
    });
    await expect(service.createForTask('required', task.id)).resolves.toBe('日程');
    expect(seen.model).toBe('big-model');
    expect(seen.slot).toBeUndefined();
  });

  it('fails when the tag model and the default model are both empty', async () => {
    const schedule = createSchedule();
    const task = schedule.addTask('required', '写右键菜单');
    let called = false;
    const service = new TaskTagService({
      scheduleService: schedule,
      llmService: llm(
        { baseUrl: 'https://example.com/v1', fullUrl: false, apiKey: 'k', model: '', tagModel: '' },
        async () => { called = true; return '日程'; }
      )
    });
    await expect(service.createForTask('required', task.id)).rejects.toThrow('请先在设置中填写默认模型');
    expect(called).toBe(false);
    expect(schedule.workspace.tags).toEqual([]);
    expect(schedule.getCurrentData().required[0].tagIds).toEqual([]);
  });

  it('creates a palette-colored tag with the small model and leaves other days alone', async () => {
    const schedule = createSchedule();
    const task = schedule.addTask('required', '写右键菜单');
    schedule.updateTask('required', task.id, { notes: [{ id: 'n1', text: '先画菜单' }, { id: 'n2', text: '再接保存' }] });
    schedule.addTag('生活');
    const origin = schedule.currentDate;
    const originKey = getDateKey(origin);
    schedule.setCurrentDate(addDays(origin, 1));
    schedule.insertTask('required', { ...task, tagIds: [] });
    schedule.setCurrentDate(origin);
    let seen = null;
    const service = new TaskTagService({
      scheduleService: schedule,
      llmService: llm(
        { baseUrl: 'https://example.com/v1', fullUrl: false, apiKey: 'k', model: 'big-model', tagModel: 'tiny-model' },
        async (input) => {
          seen = input;
          schedule.setCurrentDate(addDays(origin, 1));
          return '{"project":"日程 代理","description":"和日程代理的对话、工具有关"}';
        }
      )
    });
    await expect(service.createForTask('required', task.id)).resolves.toBe('日程 代理');
    expect(seen.model).toBe('tiny-model');
    expect(seen.system).toContain('{"project":"<项目名>","description":"<描述>"}');
    expect(seen.user).toContain('任务名称：\n写右键菜单');
    expect(seen.user).toContain('先画菜单\n再接保存');
    expect(seen.user).toContain('现有项目：\n生活');
    expect(schedule.workspace.tags.map((tag) => tag.name)).toEqual(['生活', '日程 代理']);
    expect(schedule.workspace.tags[1].description).toBe('和日程代理的对话、工具有关');
    expect(schedule.workspace.tags[1].color).toBe(TAG_PALETTE[1]);
    expect(schedule.data[originKey].required[0].tagIds).toEqual([schedule.workspace.tags[1].id]);
    schedule.setCurrentDate(addDays(origin, 1));
    expect(schedule.getCurrentData().required[0].tagIds).toEqual([]);
  });

  it('reuses an existing tag with the same name', async () => {
    const schedule = createSchedule();
    const existing = schedule.addTag('日程', '已经写好的边界');
    const task = schedule.addTask('required', '写菜单');
    const service = new TaskTagService({
      scheduleService: schedule,
      llmService: llm(
        { baseUrl: 'https://example.com/v1', fullUrl: false, apiKey: 'k', model: 'big', tagModel: 'tiny' },
        async () => '{"project":"日程","description":"不该盖掉"}'
      )
    });
    await service.createForTask('required', task.id);
    expect(schedule.workspace.tags).toHaveLength(1);
    expect(schedule.workspace.tags[0].description).toBe('已经写好的边界');
    expect(schedule.getCurrentData().required[0].tagIds).toEqual([existing.id]);
  });

  it('does not create or attach a tag when the model answers other', async () => {
    const schedule = createSchedule();
    const task = schedule.addTask('required', '写菜单');
    const service = new TaskTagService({
      scheduleService: schedule,
      llmService: llm(
        { baseUrl: 'https://example.com/v1', fullUrl: false, apiKey: 'k', model: 'big', tagModel: 'tiny' },
        async () => '{"project":"other","description":""}'
      )
    });
    await expect(service.createForTask('required', task.id)).resolves.toBeNull();
    expect(schedule.workspace.tags).toEqual([]);
    expect(schedule.getCurrentData().required[0].tagIds).toEqual([]);
  });

  it('creates the tag from the task title when the model returns nothing or invalid JSON', async () => {
    const schedule = createSchedule();
    const task = schedule.addTask('required', '写菜单');
    const service = new TaskTagService({
      scheduleService: schedule,
      llmService: llm(
        { baseUrl: 'https://example.com/v1', fullUrl: false, apiKey: 'k', model: 'big', tagModel: 'tiny' },
        async () => { throw new Error('模型没有返回文本'); }
      )
    });
    await expect(service.createForTask('required', task.id)).resolves.toBe('写菜单');
    expect(schedule.workspace.tags.map((tag) => tag.name)).toEqual(['写菜单']);

    const second = schedule.addTask('required', '相册瘦身整理计划超出十字');
    const again = new TaskTagService({
      scheduleService: schedule,
      llmService: llm(
        { baseUrl: 'https://example.com/v1', fullUrl: false, apiKey: 'k', model: 'big', tagModel: 'tiny' },
        async () => '不是 JSON'
      )
    });
    await expect(again.createForTask('required', second.id)).resolves.toBe('相册瘦身整理计划超出');
  });

  it('keeps a long existing project name and leaves the task’s other tags in place', async () => {
    const schedule = createSchedule();
    const existing = schedule.addTag('相册瘦身整理计划超出十字');
    const other = schedule.addTag('生活');
    const task = schedule.addTask('required', '整理相册');
    schedule.updateTask('required', task.id, { tagIds: [other.id] });
    const service = new TaskTagService({
      scheduleService: schedule,
      llmService: llm(
        { baseUrl: 'https://example.com/v1', fullUrl: false, apiKey: 'k', model: 'big', tagModel: 'tiny' },
        async () => '{"project":"相册瘦身整理计划超出十字"}'
      )
    });
    await expect(service.createForTask('required', task.id)).resolves.toBe('相册瘦身整理计划超出十字');
    expect(schedule.workspace.tags).toHaveLength(2);
    expect(schedule.getCurrentData().required[0].tagIds).toEqual([other.id, existing.id]);
  });

  it('writes a description from the tag’s tasks and the current text, without saving', async () => {
    const schedule = createSchedule();
    const tag = schedule.addTag('ceos', '旧描述');
    const task = schedule.addTask('required', '旧标题');
    schedule.updateTask('required', task.id, { tagIds: [tag.id], notes: [{ id: 'n1', text: '旧说明' }] });
    const origin = schedule.currentDate;
    schedule.setCurrentDate(addDays(origin, 1));
    schedule.insertTask('required', { ...schedule.data[getDateKey(origin)].required[0], text: '写菜单', notes: [{ id: 'n1', text: '先画菜单' }] });
    let seen = null;
    const service = new TaskTagService({
      scheduleService: schedule,
      llmService: llm(
        { baseUrl: 'https://example.com/v1', fullUrl: false, apiKey: 'k', model: 'big', tagModel: 'tiny' },
        async (input) => {
          seen = input;
          return '{"description":"和 CEOS 应用的设计与开发有关"}';
        }
      )
    });
    await expect(service.generateDescription(tag.id, { name: 'CEOS', description: '正在改的描述' })).resolves.toBe('和 CEOS 应用的设计与开发有关');
    expect(seen.model).toBe('tiny');
    expect(seen.system).toContain('{"description":"<描述>"}');
    expect(seen.user).toContain('标签名称：\nCEOS');
    expect(seen.user).toContain('现有描述：\n正在改的描述');
    expect(seen.user).toContain('写菜单');
    expect(seen.user).toContain('先画菜单');
    expect(seen.user).not.toContain('旧标题');
    expect(schedule.workspace.tags[0].description).toBe('旧描述');
  });
});
