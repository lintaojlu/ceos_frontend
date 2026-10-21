import { describe, expect, it } from 'vitest';
import { LocalStorageAdapter } from '../infrastructure/storage/local-storage-adapter.js';
import { ScheduleRepository } from '../infrastructure/storage/schedule-repository.js';
import { WorkspaceRepository } from '../infrastructure/storage/workspace-repository.js';
import { addDays, getDateKey } from '../domain/shared/date-key.js';
import { BREAKDOWN_USER_PROMPT } from '../domain/schedule/task-breakdown.js';
import { EventBus } from './event-bus.js';
import { ScheduleService } from './schedule-service.js';
import { TaskBreakdownService } from './task-breakdown-service.js';

function createSchedule() {
  const store = {};
  const adapter = new LocalStorageAdapter({
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
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

describe('TaskBreakdownService.prepareComposer', () => {
  it('builds context, short body, and a task mention without calling the model', () => {
    const schedule = createSchedule();
    const work = schedule.addTag('工作');
    const ceos = schedule.addTag('CEOS');
    const task = schedule.addTask('required', '做拆解', [work.id, ceos.id]);
    schedule.addNote('required', task.id, '先看现有说明');
    const origin = schedule.currentDate;
    const originKey = getDateKey(origin);

    schedule.setCurrentDate(addDays(origin, -1));
    const past = schedule.addTask('required', '昨天的同类', ceos.id);
    schedule.toggleTask('required', past.id);
    schedule.setCurrentDate(origin);

    const service = new TaskBreakdownService({ scheduleService: schedule });
    const draft = service.prepareComposer('required', task.id);

    expect(draft.body).toBe(BREAKDOWN_USER_PROMPT);
    expect(draft.flyText).toBe(BREAKDOWN_USER_PROMPT);
    expect(draft.dateKey).toBe(originKey);
    expect(draft.context).toContain('做拆解');
    expect(draft.context).toContain('先看现有说明');
    expect(draft.context).toContain('昨天的同类');
    expect(draft.context).toContain('ask_choices');
    expect(draft.mentions).toEqual([{
      kind: 'task',
      id: task.id,
      title: '做拆解',
      date: originKey,
      label: `${originKey} 做拆解`
    }]);
  });
});
