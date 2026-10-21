import { describe, expect, it } from 'vitest';
import {
  TAG_DESCRIPTION_SYSTEM,
  buildTagDescriptionPrompt,
  descriptionFromModel,
  tasksForTag
} from './tag-description.js';

describe('tag description', () => {
  it('keeps the latest copy of a task and ignores other tags', () => {
    const tasks = tasksForTag({
      '2026-10-01': {
        required: [{ id: 'a', text: '旧标题', tagIds: ['ceos'], notes: [{ id: 'n', text: '旧说明' }] }],
        optional: [{ id: 'b', text: '别的', tagIds: ['life'] }]
      },
      '2026-10-18': {
        required: [{ id: 'a', text: '新标题', tagIds: ['ceos'], notes: [{ id: 'n', text: '新说明' }] }],
        optional: []
      }
    }, 'ceos');
    expect(tasks).toEqual([{ date: '2026-10-18', title: '新标题', notes: ['新说明'] }]);
  });

  it('sends the name, the current description, and the tasks', () => {
    expect(TAG_DESCRIPTION_SYSTEM).toContain('{"description":"<描述>"}');
    expect(buildTagDescriptionPrompt({
      name: '  ceos  ',
      description: '  和这个应用有关  ',
      tasks: [
        { date: '2026-10-18', title: '写菜单', notes: ['先画菜单', ''] },
        { date: '2026-10-17', title: '改图标', notes: [] }
      ]
    })).toBe([
      '标签名称：',
      'ceos',
      '',
      '现有描述：',
      '和这个应用有关',
      '',
      '已有任务：',
      '- 2026-10-18 写菜单',
      '  先画菜单',
      '- 2026-10-17 改图标'
    ].join('\n'));
    expect(buildTagDescriptionPrompt({ name: '生活' })).toContain('现有描述：\n无');
    expect(buildTagDescriptionPrompt({ name: '生活' })).toContain('已有任务：\n无');
  });

  it('reads a description from JSON and clips it to 80 characters', () => {
    expect(descriptionFromModel('{"description":"  和日程应用有关  "}')).toBe('和日程应用有关');
    expect(descriptionFromModel('```json\n{"description":"抱石训练"}\n```')).toBe('抱石训练');
    expect(descriptionFromModel(`说明 {"description":"${'界'.repeat(90)}"}`)).toBe('界'.repeat(80));
    expect(descriptionFromModel('不是 JSON')).toBe('');
    expect(descriptionFromModel('{"description":"   "}')).toBe('');
  });
});
