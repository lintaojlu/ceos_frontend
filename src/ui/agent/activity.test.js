import { describe, expect, it } from 'vitest';
import { activityStatus, toolHint, toolSteps, toolTitle } from './activity.js';

describe('agent activity', () => {
  it('names a tool and keeps a short hint', () => {
    expect(toolTitle('list_day')).toBe('查看这一天');
    expect(toolHint('list_day', { date: '2026-10-18' })).toBe('2026-10-18');
    expect(toolHint('ask_choices', { questions: [{ prompt: '先推进哪一项？' }] })).toBe('先推进哪一项？');
  });

  it('pairs a call with its result and keeps the question on one row', () => {
    const steps = toolSteps([
      { kind: 'tool_call', id: 'a', name: 'list_tags', arguments: {} },
      { kind: 'tool_result', id: 'a', name: 'list_tags', ok: true, payload: { tags: [] } },
      { kind: 'tool_call', id: 'b', name: 'ask_choices', arguments: { questions: [{ prompt: '哪一天？' }] } },
      { kind: 'ask_choices', id: 'b', questions: [{ prompt: '哪一天？' }] },
      { kind: 'tool_result', id: 'b', name: 'ask_choices', ok: true, payload: { status: 'waiting_for_user' } }
    ]);
    expect(steps).toHaveLength(2);
    expect(steps[0].ok).toBe(true);
    expect(steps[1].questions[0].prompt).toBe('哪一天？');
  });

  it('switches the status line as the turn moves', () => {
    expect(activityStatus({ phase: 'wait', events: [], text: '' })).toBe('准备中');
    expect(activityStatus({
      phase: 'tools',
      events: [{ kind: 'tool_call', id: 'a', name: 'list_day', arguments: {} }],
      text: ''
    })).toBe('调用工具中 list_day');
    expect(activityStatus({
      phase: 'tools',
      events: [
        { kind: 'tool_call', id: 'a', name: 'list_day', arguments: {} },
        { kind: 'tool_result', id: 'a', name: 'list_day', ok: true }
      ],
      text: ''
    })).toBe('等待模型响应');
    expect(activityStatus({
      phase: 'wait',
      events: [
        { kind: 'tool_call', id: 'a', name: 'list_day', arguments: {} },
        { kind: 'tool_result', id: 'a', name: 'list_day', ok: true }
      ],
      text: '先看。'
    })).toBe('等待模型响应');
    expect(activityStatus({ phase: 'text', events: [], text: '好' })).toBe('');
  });
});
