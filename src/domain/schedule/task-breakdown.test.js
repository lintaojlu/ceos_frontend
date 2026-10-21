import { describe, expect, it } from 'vitest';
import {
  AI_TASK_TITLE,
  AI_TASK_UNAVAILABLE,
  BREAKDOWN_SYSTEM,
  HUMAN_TASK_TITLE,
  buildBreakdownPrompt,
  coalesceBreakdownSubtasks,
  mergeBreakdownSubtasks,
  noteBody,
  packAgentUserMessage,
  parseBreakdown,
  replaceBreakdownNotes,
  selectRelatedTasks,
  splitAgentUserMessage
} from './task-breakdown.js';

const days = {
  '2026-10-21': {
    required: [{ id: 'drop', text: '标签已摘', tagIds: ['life'], completed: false }]
  },
  '2026-10-20': {
    required: [{ id: 'cur', text: '当前', tagIds: ['work', 'ceos'], completed: false, notes: [{ id: 'keep', text: '先看现有说明' }] }]
  },
  '2026-10-19': {
    required: [{ id: 'both', text: '两边', tagIds: ['work', 'ceos'], completed: false }]
  },
  '2026-10-18': {
    required: [
      { id: 'w2', text: '工作2', tagIds: ['work'], completed: true },
      { id: 'w3', text: '工作3', tagIds: ['work'], completed: false }
    ],
    optional: [{ id: 'w4', text: '工作4', tagIds: ['work'], completed: false }]
  },
  '2026-10-17': {
    required: [{ id: 'w5', text: '工作5', tagIds: ['work'], completed: false }]
  },
  '2026-10-16': {
    required: [{ id: 'w6', text: '工作6', tagIds: ['work'], completed: false, notes: [{ id: 'secret', text: '秘密说明' }] }]
  },
  '2026-10-15': {
    required: [{ id: 'c2', text: '项目2', tagIds: ['ceos'], completed: false }]
  },
  '2026-10-12': {
    required: [{ id: 'drop', text: '曾经是项目', tagIds: ['ceos'], completed: false }]
  },
  '2026-10-10': {
    required: [{ id: 'both', text: '旧两边', tagIds: ['life'], completed: false }]
  },
  '2026-10-09': {
    required: [{ id: 'old-ceos', text: '旧项目', tagIds: ['ceos'], completed: true }]
  }
};

describe('selectRelatedTasks', () => {
  it('takes five tasks per tag, keeps one copy, and uses the newest tags', () => {
    const related = selectRelatedTasks({
      days,
      taskId: 'cur',
      tagIds: ['work', 'ceos']
    });
    expect(related.map((item) => item.id)).toEqual(['both', 'w2', 'w3', 'w4', 'w5', 'c2', 'old-ceos']);
    expect(related.find((item) => item.id === 'both')).toMatchObject({
      dateKey: '2026-10-19',
      tagIds: ['work', 'ceos'],
      text: '两边'
    });
    expect(related.some((item) => item.id === 'w6' || item.id === 'cur' || item.id === 'drop')).toBe(false);
    expect(related.find((item) => item.id === 'w2').completed).toBe(true);
  });

  it('returns nothing when the current task has no tags', () => {
    expect(selectRelatedTasks({ days, taskId: 'cur', tagIds: [] })).toEqual([]);
  });
});

describe('buildBreakdownPrompt', () => {
  it('includes the current notes and labels each related task once', () => {
    const related = selectRelatedTasks({ days, taskId: 'cur', tagIds: ['work', 'ceos'] });
    const names = { work: '工作', ceos: 'CEOS' };
    const prompt = buildBreakdownPrompt({
      title: '当前',
      tagNames: ['工作', 'CEOS'],
      notes: ['先看现有说明', '人类任务\n旧步骤'],
      related: related.map((item) => ({
        dateKey: item.dateKey,
        text: item.text,
        completed: item.completed,
        tagNames: item.tagIds.map((id) => names[id])
      }))
    });
    expect(prompt).toContain('标题：当前');
    expect(prompt).toContain('标签：工作、CEOS');
    expect(prompt).toContain('先看现有说明');
    expect(prompt).toContain('  人类任务\n  旧步骤');
    expect(prompt).toContain('- 2026-10-19 未完成 两边（标签：工作、CEOS）');
    expect(prompt).toContain('- 2026-10-18 完成 工作2（标签：工作）');
    expect(prompt).not.toContain('秘密说明');
    expect(prompt.match(/两边/g)).toHaveLength(1);
    expect(BREAKDOWN_SYSTEM).toContain(AI_TASK_UNAVAILABLE);
  });
});

describe('parseBreakdown', () => {
  it('reads the two sections in either order', () => {
    expect(parseBreakdown('人类任务\n亲手做\n\nAI任务\n请实现')).toEqual({
      humanBody: '亲手做',
      aiBody: '请实现'
    });
    expect(parseBreakdown('```\n## AI任务\n代理来做\n## 人类任务：\n自己做\n```')).toEqual({
      humanBody: '自己做',
      aiBody: '代理来做'
    });
  });

  it('rejects a reply that is not two notes', () => {
    expect(() => parseBreakdown('只有一段')).toThrow('拆解结果无法读成两条说明');
    expect(() => parseBreakdown('人类任务\n有\nAI任务\n')).toThrow('拆解结果无法读成两条说明');
  });
});

describe('replaceBreakdownNotes', () => {
  it('replaces the two titled notes and keeps the others', () => {
    const notes = replaceBreakdownNotes([
      { id: 'hand', text: '手写' },
      { id: 'old-human', text: `${HUMAN_TASK_TITLE}\n旧` },
      { id: 'mention', text: '这里提到人类任务但不是标题' },
      { id: 'old-ai', text: `${AI_TASK_TITLE}\n旧 prompt` }
    ], '新步骤', '新 prompt');
    expect(notes.map((note) => note.text)).toEqual([
      '手写',
      '这里提到人类任务但不是标题',
      `${HUMAN_TASK_TITLE}\n新步骤`,
      `${AI_TASK_TITLE}\n新 prompt`
    ]);
    expect(notes[0].id).toBe('hand');
    expect(noteBody(notes[3].text)).toBe('新 prompt');
  });
});

describe('coalesceBreakdownSubtasks', () => {
  it('joins a bare title with the next body into one note', () => {
    expect(coalesceBreakdownSubtasks([
      HUMAN_TASK_TITLE,
      '亲手做',
      AI_TASK_TITLE,
      '请实现'
    ])).toEqual([
      `${HUMAN_TASK_TITLE}\n亲手做`,
      `${AI_TASK_TITLE}\n请实现`
    ]);
  });
});

describe('mergeBreakdownSubtasks', () => {
  it('keeps handwritten notes when the model only returns the two titled ones', () => {
    expect(mergeBreakdownSubtasks(
      ['手写', `${HUMAN_TASK_TITLE}\n旧`, `${AI_TASK_TITLE}\n旧`],
      [`${HUMAN_TASK_TITLE}\n新`, `${AI_TASK_TITLE}\n新`]
    )).toEqual(['手写', `${HUMAN_TASK_TITLE}\n新`, `${AI_TASK_TITLE}\n新`]);
  });

  it('coalesces a four-item split before merging', () => {
    expect(mergeBreakdownSubtasks(
      ['手写'],
      [HUMAN_TASK_TITLE, '亲手做', AI_TASK_TITLE, '请实现']
    )).toEqual(['手写', `${HUMAN_TASK_TITLE}\n亲手做`, `${AI_TASK_TITLE}\n请实现`]);
  });

  it('leaves an ordinary update alone', () => {
    expect(mergeBreakdownSubtasks(['手写'], ['只要这一条'])).toEqual(['只要这一条']);
  });
});

describe('packAgentUserMessage', () => {
  it('round-trips context and body', () => {
    const packed = packAgentUserMessage('规则\n材料', '请拆解');
    expect(packed).toContain('【上下文】');
    expect(splitAgentUserMessage(packed)).toEqual({ context: '规则\n材料', body: '请拆解' });
    expect(splitAgentUserMessage('普通一句话')).toEqual({ context: '', body: '普通一句话' });
  });
});
