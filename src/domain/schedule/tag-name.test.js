import { describe, expect, it } from 'vitest';
import { TAG_NAME_SYSTEM, buildTagNamePrompt, projectFromModel, projectNameFromModel } from './tag-name.js';

describe('projectNameFromModel', () => {
  it('keeps an existing project name in full and keeps spaces in a new name', () => {
    const existing = ['很长的现有项目名称', 'CEOS 日程'];
    expect(projectNameFromModel('{"project":"  很长的现有项目名称  "}', '标题', existing)).toBe('很长的现有项目名称');
    expect(projectNameFromModel('{"project":"  日程 代理  "}', '标题', existing)).toBe('日程 代理');
    expect(projectNameFromModel('{"project":"🚀项目"}', '标题')).toBe('🚀项目');
  });

  it('clips a new name to 10 characters, then reuses an existing project when the clip matches', () => {
    expect(projectNameFromModel('{"project":"一二三四五六七八九十十一"}', '标题')).toBe('一二三四五六七八九十');
    expect(projectNameFromModel(
      '{"project":"一二三四五六七八九十十一"}',
      '标题',
      ['一二三四五六七八九十']
    )).toBe('一二三四五六七八九十');
  });

  it('uses the task title when the response is empty, not JSON, or has an empty project', () => {
    expect(projectNameFromModel('', '写右键菜单')).toBe('写右键菜单');
    expect(projectNameFromModel('「」', '写菜单')).toBe('写菜单');
    expect(projectNameFromModel('{"project":""}', '一二三四五六七八九十十一')).toBe('一二三四五六七八九十');
    expect(projectNameFromModel('{"project":"   "}', '  已有项目  ', ['已有项目'])).toBe('已有项目');
  });

  it('sends the title, every note, and every project name with its boundary', () => {
    expect(TAG_NAME_SYSTEM).toContain('{"project":"<项目名>","description":"<描述>"}');
    expect(buildTagNamePrompt({
      title: '  写右键菜单  ',
      notes: ['  先画菜单  ', '', '再接保存'],
      projects: [
        '生活',
        '  ',
        { name: 'CEOS', description: '  和 CEOS 这个应用的设计、开发有关  ' },
        { name: '', description: '没有名字' }
      ]
    })).toBe([
      '任务名称：',
      '写右键菜单',
      '',
      '任务描述：',
      '先画菜单',
      '再接保存',
      '',
      '现有项目：',
      '生活',
      'CEOS：和 CEOS 这个应用的设计、开发有关'
    ].join('\n'));
    expect(buildTagNamePrompt({ title: '写菜单' })).toContain('任务描述：\n\n现有项目：\n无');
  });

  it('keeps a new boundary and drops it when the project already exists', () => {
    expect(projectFromModel(
      '{"project":"日程","description":"  和日程应用的设计与开发有关  "}',
      '标题'
    )).toEqual({ name: '日程', description: '和日程应用的设计与开发有关', skipped: false });
    expect(projectFromModel(
      '{"project":"很长的现有项目名称","description":"新的边界"}',
      '标题',
      ['很长的现有项目名称']
    )).toEqual({ name: '很长的现有项目名称', description: '', skipped: false });
    const long = '界'.repeat(90);
    expect(projectFromModel(`{"project":"新项目","description":"${long}"}`, '标题').description).toBe('界'.repeat(80));
    expect(projectFromModel('', '写菜单')).toEqual({ name: '写菜单', description: '', skipped: false });
  });

  it('skips classification when the model answers other', () => {
    expect(TAG_NAME_SYSTEM).toContain('project 填 other');
    expect(projectFromModel('{"project":"other","description":"随便"}', '写菜单', ['生活'])).toEqual({
      name: '',
      description: '',
      skipped: true
    });
    expect(projectFromModel('{"project":" Other "}', '写菜单')).toEqual({ name: '', description: '', skipped: true });
    expect(projectNameFromModel('{"project":"other"}', '写菜单')).toBe('');
  });
});
