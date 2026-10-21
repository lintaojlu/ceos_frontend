import { describe, it, expect } from 'vitest';
import { commitNoteDraft, createDailyTask, createNote, normalizeNotes, splitTimeMentions, cloneDailyTask } from './daily-task.js';

describe('createDailyTask', () => {
  it('defaults to an empty notes array', () => {
    const task = createDailyTask('hello', new Date('2026-09-21'));
    expect(task.notes).toEqual([]);
    expect(task.note).toBeUndefined();
    expect(task.subtasks).toBeUndefined();
    expect(task.pomodoros).toBeUndefined();
  });

  it('merges the old note and subtasks into notes', () => {
    const task = createDailyTask('parent', new Date('2026-09-21'), {
      note: '原说明',
      subtasks: [{ id: 's1', text: 'a', completed: true }, null, { text: 'b' }]
    });
    expect(task.notes).toHaveLength(3);
    expect(task.notes[0].text).toBe('原说明');
    expect(task.notes[1]).toEqual({ id: 's1', text: 'a' });
    expect(task.notes[2].text).toBe('b');
    expect(task.notes[2].id).toBeTruthy();
    expect(task.note).toBeUndefined();
    expect(task.subtasks).toBeUndefined();
  });
});

describe('splitTimeMentions', () => {
  it('keeps a mentioned time in place so the task text follows it', () => {
    expect(splitTimeMentions('15:00 和客户开会')).toEqual([
      { text: '15:00', time: true },
      { text: ' 和客户开会', time: false }
    ]);
    expect(splitTimeMentions('下午3点和客户开会').map((part) => part.text).join('')).toBe('下午3点和客户开会');
    expect(splitTimeMentions('下午3点和客户开会').filter((part) => part.time).map((part) => part.text)).toEqual(['下午3点']);
    expect(splitTimeMentions('写方案')).toEqual([{ text: '写方案', time: false }]);
  });
});

describe('createNote / normalizeNotes', () => {
  it('createNote trims text and keeps internal line breaks', () => {
    expect(createNote('  第一行\n第二行  ')).toMatchObject({ text: '第一行\n第二行' });
  });

  it('keeps a draft that was typed but not confirmed with enter', () => {
    const notes = [{ id: 'n1', text: '已有' }];
    expect(commitNoteDraft(notes, '  ')).toBe(notes);
    const saved = commitNoteDraft(notes, '  新说明\n第二行  ');
    expect(saved).toHaveLength(2);
    expect(saved[0]).toBe(notes[0]);
    expect(saved[1].text).toBe('新说明\n第二行');
  });

  it('normalizeNotes returns [] when there is nothing to merge', () => {
    expect(normalizeNotes(null)).toEqual([]);
    expect(normalizeNotes(undefined, { note: '  ', subtasks: [] })).toEqual([]);
  });

  it('does not merge legacy fields again once notes exist', () => {
    expect(normalizeNotes([{ id: 'n1', text: '新的' }], { note: '旧的', subtasks: [{ text: '步骤' }] }))
      .toEqual([{ id: 'n1', text: '新的' }]);
  });

  it('joins a bare breakdown title with the following body', () => {
    expect(normalizeNotes([
      { id: 'h', text: '人类任务' },
      { id: 'hb', text: '亲手做' },
      { id: 'a', text: 'AI任务' },
      { id: 'ab', text: '请实现' }
    ]).map((note) => ({ id: note.id, text: note.text }))).toEqual([
      { id: 'h', text: '人类任务\n亲手做' },
      { id: 'a', text: 'AI任务\n请实现' }
    ]);
  });
});

describe('cloneDailyTask', () => {
  it('does not keep a pomodoro count on sync copies', () => {
    const task = createDailyTask('x', new Date('2026-09-21'), { pomodoros: 3 });
    expect(task.pomodoros).toBeUndefined();
    const cloned = cloneDailyTask({ ...task, pomodoros: 3 });
    expect(cloned.pomodoros).toBeUndefined();
    expect(cloned.id).toBe(task.id);
  });
});
