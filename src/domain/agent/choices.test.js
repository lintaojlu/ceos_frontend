import { describe, expect, it } from 'vitest';
import { CHOICE_CLOSED_MESSAGE, formatChoiceAnswers, normalizeAskChoices } from './choices.js';

describe('normalizeAskChoices', () => {
  it('accepts one or more questions', () => {
    const result = normalizeAskChoices({
      questions: [
        {
          id: 'q1',
          prompt: '你最终想拿到的是什么？',
          options: [
            { id: 'a', label: '可播放的 mp4' },
            { id: 'b', label: '元数据+内容分析' }
          ]
        }
      ]
    });
    expect(result.ok).toBe(true);
    expect(result.questions[0].allowOther).toBe(true);
    expect(result.questions[0].options).toHaveLength(2);
  });

  it('rejects an empty list', () => {
    expect(normalizeAskChoices({ questions: [] }).ok).toBe(false);
  });
});

describe('formatChoiceAnswers', () => {
  const questions = [{
    id: 'q1',
    prompt: '你最终想拿到的是什么？',
    options: [{ id: 'a', label: '可播放的 mp4' }],
    allowOther: true
  }];

  it('formats picks, skips, and other text', () => {
    expect(formatChoiceAnswers(questions, [
      { questionId: 'q1', optionId: 'a', optionLabel: '可播放的 mp4' }
    ])).toContain('可播放的 mp4');
    expect(formatChoiceAnswers(questions, [
      { questionId: 'q1', skipped: true }
    ])).toContain('跳过');
    expect(formatChoiceAnswers(questions, [
      { questionId: 'q1', otherText: '只要字幕' }
    ])).toContain('其他：只要字幕');
  });

  it('keeps the closed message constant', () => {
    expect(CHOICE_CLOSED_MESSAGE).toBe('用户关闭了追问');
  });
});
