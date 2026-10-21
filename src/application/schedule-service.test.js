import { describe, it, expect } from 'vitest';
import { LocalStorageAdapter } from '../infrastructure/storage/local-storage-adapter.js';
import { ScheduleRepository } from '../infrastructure/storage/schedule-repository.js';
import { WorkspaceRepository } from '../infrastructure/storage/workspace-repository.js';
import { EventBus } from './event-bus.js';
import { ScheduleService } from './schedule-service.js';
import { getDateKey, addDays, parseDateKey } from '../domain/shared/date-key.js';

function createService() {
  const store = {};
  const adapter = new LocalStorageAdapter({
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    }
  });
  const service = new ScheduleService({
    scheduleRepo: new ScheduleRepository(adapter),
    workspaceRepo: new WorkspaceRepository(adapter),
    eventBus: new EventBus()
  });
  service.load();
  return service;
}

describe('tags on daily tasks', () => {
  it('keeps a bracket title as plain text and does not create a tag', () => {
    const service = createService();
    const task = service.addTask('optional', '【CEOS】写计划');
    expect(task.text).toBe('【CEOS】写计划');
    expect(task.tagIds).toEqual([]);
    expect(service.workspace.tags).toEqual([]);
    expect(service.taskTitle(task)).toBe('【CEOS】写计划');
  });

  it('attaches the only selected tag when adding a task', () => {
    const service = createService();
    const tag = service.addTag('CEOS');
    const task = service.addTask('required', '写计划', tag.id);
    expect(task.tagIds).toEqual([tag.id]);
    expect(service.addTag('CEOS')).toBeNull();
  });

  it('keeps several tags on one task and drops only the deleted one', () => {
    const service = createService();
    const first = service.addTag('CEOS');
    const second = service.addTag('攀岩');
    const task = service.addTask('required', '写计划', [first.id, second.id]);
    expect(task.tagIds).toEqual([first.id, second.id]);
    service.deleteTag(second.id);
    expect(service.getCurrentData().required[0].text).toBe('写计划');
    expect(service.getCurrentData().required[0].tagIds).toEqual([first.id]);
  });

  it('changes the tag only on the viewed day', () => {
    const service = createService();
    const tag = service.addTag('CEOS');
    const other = service.addTag('攀岩');
    const task = service.addTask('required', '写计划', tag.id);
    const today = service.currentDate;
    const todayKey = getDateKey(today);

    service.setCurrentDate(addDays(today, 1));
    service.insertTask('required', { ...task, tagId: tag.id, subtasks: [] });
    service.setTaskTag('required', task.id, other.id);
    expect(service.getCurrentData().required[0].tagIds).toEqual([other.id]);
    expect(service.data[todayKey].required[0].tagIds).toEqual([tag.id]);
  });

  it('copies the tag when syncing, then leaves the two days independent', () => {
    const service = createService();
    const tag = service.addTag('CEOS');
    const task = service.addTask('required', '留下', tag.id);
    const originKey = getDateKey(service.currentDate);
    service.setCurrentDate(addDays(service.currentDate, 1));
    expect(service.syncTasksFrom(originKey)).toBe(true);
    expect(service.getCurrentData().required[0].tagIds).toEqual([tag.id]);
    service.setTaskTag('required', task.id, '');
    expect(service.getCurrentData().required[0].tagIds).toEqual([]);
    expect(service.data[originKey].required[0].tagIds).toEqual([tag.id]);
  });

  it('deletes a tag by clearing the mark on every day', () => {
    const service = createService();
    const tag = service.addTag('CEOS');
    const task = service.addTask('required', '写计划', tag.id);
    const todayKey = getDateKey(service.currentDate);
    service.setCurrentDate(addDays(service.currentDate, 1));
    service.insertTask('optional', { ...task, tagId: tag.id, subtasks: [] });
    service.deleteTag(tag.id);
    expect(service.workspace.tags).toEqual([]);
    expect(service.data[todayKey].required[0].text).toBe('写计划');
    expect(service.data[todayKey].required[0].tagIds).toEqual([]);
    expect(service.getCurrentData().optional[0].tagIds).toEqual([]);
  });

  it('renames a tag without rewriting task ids', () => {
    const service = createService();
    const tag = service.addTag('CEOS', '和 CEOS 这个应用有关');
    const task = service.addTask('required', '写计划', tag.id);
    expect(service.renameTag(tag.id, '日程', '  和日程应用的设计与开发有关  ')).toBeTruthy();
    expect(service.workspace.tags.find((item) => item.id === tag.id).name).toBe('日程');
    expect(service.workspace.tags.find((item) => item.id === tag.id).description).toBe('和日程应用的设计与开发有关');
    expect(service.getCurrentData().required[0].tagIds).toEqual(task.tagIds);
    service.load();
    expect(service.workspace.tags.find((item) => item.id === tag.id).description).toBe('和日程应用的设计与开发有关');
  });

  it('copies unfinished tasks from a chosen day, not only yesterday', () => {
    const service = createService();
    const origin = service.currentDate;
    const originKey = getDateKey(origin);
    service.addTask('required', '留下');
    service.addTask('optional', '做完了');
    service.getCurrentData().optional[0].completed = true;
    service.setCurrentDate(addDays(origin, 3));
    service.addTask('required', '当天的');

    expect(service.listSyncSources().map((row) => row.dateKey)).toContain(originKey);
    expect(service.syncTasksFrom(service.getDateKey())).toBe(false);
    expect(service.syncTasksFrom(originKey)).toBe(true);

    const required = service.getCurrentData().required.map((t) => t.text);
    expect(required).toContain('留下');
    expect(required).toContain('当天的');
    expect(service.getCurrentData().optional).toEqual([]);
    expect(service.syncTasksFrom(originKey)).toBe(true);
    expect(service.getCurrentData().required.filter((t) => t.text === '留下')).toHaveLength(1);
  });

  it('puts a newly added task at the top of its list', () => {
    const service = createService();
    service.addTask('required', '先');
    service.addTask('required', '后');
    expect(service.getCurrentData().required.map((task) => task.text)).toEqual(['后', '先']);
  });

  it('keeps drag order inside a column and when moving between columns', () => {
    const service = createService();
    const first = service.addTask('required', '甲');
    const second = service.addTask('required', '乙');
    const third = service.addTask('required', '丙');
    service.placeTask('required', third.id, 'required', first.id);
    expect(service.getCurrentData().required.map((task) => task.text)).toEqual(['乙', '丙', '甲']);

    const fourth = service.addTask('optional', '丁');
    service.placeTask('required', first.id, 'optional', fourth.id);
    expect(service.getCurrentData().required.map((task) => task.id)).toEqual([second.id, third.id]);
    expect(service.getCurrentData().optional.map((task) => task.text)).toEqual(['甲', '丁']);
  });

  it('keeps stored 生活 and 工作 ids and lets them be renamed or deleted', () => {
    const store = {
      ceoWorkspace: JSON.stringify({
        ideas: [],
        milestones: [],
        tags: [
          { id: 'tag-life', name: '生活', color: '#F5C400' },
          { id: 'tag-work', name: '工作', color: '#111111' }
        ]
      })
    };
    const adapter = new LocalStorageAdapter({
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    });
    const service = new ScheduleService({
      scheduleRepo: new ScheduleRepository(adapter),
      workspaceRepo: new WorkspaceRepository(adapter),
      eventBus: new EventBus()
    });
    service.load();
    expect(service.workspace.tags.map((tag) => [tag.id, tag.name, tag.color])).toEqual([
      ['tag-life', '生活', '#F5C400'],
      ['tag-work', '工作', '#111111']
    ]);
    expect(service.renameTag('tag-life', '日常').id).toBe('tag-life');
    const task = service.addTask('required', '买菜', 'tag-work');
    expect(task.tagIds).toEqual(['tag-work']);
    expect(service.deleteTag('tag-work')).toBe(true);
    expect(service.getCurrentData().required[0].text).toBe('买菜');
    expect(service.getCurrentData().required[0].tagIds).toEqual([]);
    expect(service.workspace.tags.map((tag) => tag.id)).toEqual(['tag-life']);
  });

  it('stores pin on the tag and keeps it after reload', () => {
    const service = createService();
    const tag = service.addTag('CEOS');
    expect(service.toggleTagPin(tag.id).pinned).toBe(true);
    service.load();
    expect(service.workspace.tags.find((item) => item.id === tag.id).pinned).toBe(true);
    expect(service.toggleTagPin(tag.id).pinned).toBe(false);
  });

  it('reuses a same-named tag and only marks the viewed day', () => {
    const service = createService();
    const existing = service.addTag('日程');
    const task = service.addTask('required', '写菜单');
    const origin = service.currentDate;
    const originKey = getDateKey(origin);
    service.setCurrentDate(addDays(origin, 1));
    service.insertTask('required', { ...task, tagIds: [] });
    service.setCurrentDate(origin);
    const saved = service.attachTagNamed('required', task.id, '日程');
    expect(saved.tagIds).toEqual([existing.id]);
    expect(service.workspace.tags.filter((item) => item.name === '日程')).toHaveLength(1);
    expect(service.data[originKey].required[0].tagIds).toEqual([existing.id]);
    service.setCurrentDate(addDays(origin, 1));
    expect(service.getCurrentData().required[0].tagIds).toEqual([]);
  });
});

describe('moveTaskToDate', () => {
  it('updates the viewed day when the date does not change', () => {
    const service = createService();
    const task = service.addTask('optional', '写计划');
    const key = service.getDateKey();
    const saved = service.moveTaskToDate('optional', task.id, key, { text: '改标题' });
    expect(saved.text).toBe('改标题');
    expect(service.data[key].optional.map((item) => item.id)).toEqual([task.id]);
    expect(service.getCurrentData().optional[0].text).toBe('改标题');
  });

  it('moves the viewed copy onto the chosen day and leaves other days', () => {
    const service = createService();
    const tag = service.addTag('CEOS');
    const task = service.addTask('required', '写计划', tag.id);
    service.addNote('required', task.id, '说明');
    task.completed = true;
    task.pinned = true;
    task.recurrence = 'daily';
    const origin = service.currentDate;
    const originKey = getDateKey(origin);
    const target = addDays(origin, 1);
    const targetKey = getDateKey(target);
    const thirdKey = getDateKey(addDays(origin, 2));

    service.setCurrentDate(target);
    const earlier = service.addTask('required', '8:00 已有');
    service.setCurrentDate(addDays(origin, 2));
    service.insertTask('required', {
      ...task,
      text: '第三天原文',
      notes: [{ id: 'other', text: '另一份' }],
      completed: false,
      pinned: false,
      recurrence: ''
    });
    service.setCurrentDate(origin);

    const when = parseDateKey(targetKey);
    when.setHours(9, 30, 0, 0);
    const moved = service.moveTaskToDate('required', task.id, targetKey, {
      text: '改过的标题',
      time: when.getTime()
    });

    expect(moved.id).toBe(task.id);
    expect(moved.text).toBe('改过的标题');
    expect(moved.completed).toBe(true);
    expect(moved.pinned).toBe(true);
    expect(moved.recurrence).toBe('daily');
    expect(moved.tagIds).toEqual([tag.id]);
    expect(moved.notes.map((note) => note.text)).toEqual(['说明']);
    expect(getDateKey(new Date(moved.time))).toBe(targetKey);
    expect(new Date(moved.time).getHours()).toBe(9);
    expect(new Date(moved.time).getMinutes()).toBe(30);
    expect(service.data[originKey].required).toEqual([]);
    expect(service.data[targetKey].required.map((item) => item.id)).toEqual([task.id, earlier.id]);
    expect(service.data[thirdKey].required[0].text).toBe('第三天原文');
    expect(service.data[thirdKey].required[0].notes[0].text).toBe('另一份');
    expect(service.data[thirdKey].required[0].completed).toBe(false);
    expect(service.getDateKey()).toBe(originKey);
  });

  it('does not write when the chosen day already has the same task id', () => {
    const service = createService();
    const task = service.addTask('required', '写计划');
    service.addNote('required', task.id, '说明');
    const origin = service.currentDate;
    const originKey = getDateKey(origin);
    const targetKey = getDateKey(addDays(origin, 1));
    service.setCurrentDate(addDays(origin, 1));
    service.insertTask('optional', { ...task, text: '目标日原文', notes: [{ id: 'kept', text: '留着' }] });
    service.setCurrentDate(origin);

    const result = service.moveTaskToDate('required', task.id, targetKey, { text: '不该写上' });

    expect(result).toEqual({ occupied: true });
    expect(service.data[originKey].required.map((item) => item.text)).toEqual(['写计划']);
    expect(service.data[originKey].required[0].notes.map((note) => note.text)).toEqual(['说明']);
    expect(service.data[targetKey].optional.map((item) => item.text)).toEqual(['目标日原文']);
    expect(service.data[targetKey].optional[0].notes.map((note) => note.text)).toEqual(['留着']);
    expect(service.data[targetKey].required).toEqual([]);
  });
});
