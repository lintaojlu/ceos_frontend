/**
 * 把一条任务拆成「人类任务」和「AI任务」两条说明。
 * 只整理上下文和模型输出，不读存储、不发起请求。
 */

import { createNote, normalizeTagIds } from './daily-task.js';

export const HUMAN_TASK_TITLE = '人类任务';
export const AI_TASK_TITLE = 'AI任务';
export const AI_TASK_UNAVAILABLE = '这项没有可交给代理执行的部分';
export const RELATED_TASK_LIMIT = 5;

export const BREAKDOWN_SYSTEM = `你把一条任务拆成两条说明，只输出这两条，不要前言，也不要第三条。

格式必须是：
人类任务
正文

AI任务
正文

人类任务写用户要亲手做的步骤。
AI任务写成可以直接粘贴给代理执行的 prompt，包含目标、约束和做完的标准。
如果这项没有可以交给代理执行的部分，AI任务的正文只写：${AI_TASK_UNAVAILABLE}
正文里不要再写标题。`;

/** 拆解经 agent 发出时，塞进输入框「上下文」块的规则。 */
export const BREAKDOWN_AGENT_RULES = `你在拆解用户提到的那一条任务。

你要判断两件事，再写入说明：
1. 这条任务是否应当拆成「人类亲手做」和「交给 AI 代理做」两部分一起推进；还是几乎全是人类、或几乎全是 AI。
2. 若需要两边一起做，各自负责哪一段、交接边界是什么。

最终用 update_task 把说明写入 subtasks（note 留空）。subtasks 里恰好两项，每一项是一整段字符串：第一行标题，换行后是正文。不要把标题和正文拆成两条 subtasks。

正确示例（两项）：
["人类任务\\n亲手做的步骤…", "AI任务\\n请实现…"]

错误示例（四项，禁止）：
["人类任务", "亲手做的步骤…", "AI任务", "请实现…"]

人类任务写用户要亲手做的步骤。
AI任务写成可以直接粘贴给代理执行的 prompt，包含目标、约束和做完的标准。
如果这项没有可以交给代理执行的部分，AI任务的正文只写：${AI_TASK_UNAVAILABLE}

信息不够、没法判断要不要拆、或没法分清两边职责时，先调用 ask_choices 用选择题问清。问题必须针对这条任务本身，例如「这个任务的目的是什么？」「哪些步骤必须你本人完成？」「哪些可以交给代理？」。不要问与拆解无关的闲题，也不要猜。
问清后再 update_task。交回 subtasks 时带上该任务原有的其他说明，只替换或追加「人类任务」「AI任务」这两条。`;

/** 用户在输入框正文里看到、可编辑的短指令。 */
export const BREAKDOWN_USER_PROMPT = '请拆解我提到的这条任务：先弄清它的目的，再判断要不要拆成人类与 AI 一起做、以及各自做什么。不清楚就用选择题问我（问任务本身）。问清后写入「人类任务」和「AI任务」两条说明。';

const CONTEXT_OPEN = '【上下文】';
const BODY_OPEN = '【正文】';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export class BreakdownParseError extends Error {
  constructor(message = '拆解结果无法读成两条说明') {
    super(message);
    this.name = 'BreakdownParseError';
  }
}

/**
 * @param {string} text
 * @returns {string}
 */
export function noteTitle(text) {
  return String(text || '').split(/\r?\n/, 1)[0].trim();
}

/**
 * 标题行以下的正文。
 * @param {string} text
 * @returns {string}
 */
export function noteBody(text) {
  const lines = String(text || '').split(/\r?\n/);
  return lines.slice(1).join('\n').trim();
}

/**
 * @param {string} title
 * @param {string} body
 * @returns {string}
 */
export function formatBreakdownNote(title, body) {
  return `${title}\n${String(body || '').trim()}`;
}

/**
 * 换掉已有的两条拆解说明，其余说明按原顺序留下。新的两条接在末尾。
 * @param {Array<{ id?: string, text?: string }>|null|undefined} notes
 * @param {string} humanBody
 * @param {string} aiBody
 * @returns {Array<{ id: string, text: string }>}
 */
export function replaceBreakdownNotes(notes, humanBody, aiBody) {
  const kept = (notes || []).filter((note) => {
    const title = noteTitle(note?.text);
    return title !== HUMAN_TASK_TITLE && title !== AI_TASK_TITLE;
  });
  return [
    ...kept.map((note) => createNote(note.text || '', { id: note.id })),
    createNote(formatBreakdownNote(HUMAN_TASK_TITLE, humanBody)),
    createNote(formatBreakdownNote(AI_TASK_TITLE, aiBody))
  ];
}

/**
 * 模型常把「人类任务 / AI任务」标题和正文拆成相邻两条。收成「标题\\n正文」各一条。
 * @param {string[]} texts
 * @returns {string[]}
 */
export function coalesceBreakdownSubtasks(texts) {
  const list = (texts || []).map((item) => String(item || '').trim()).filter(Boolean);
  /** @type {string[]} */
  const out = [];
  for (let index = 0; index < list.length; index += 1) {
    const text = list[index];
    const title = noteTitle(text);
    const titleOnly = (title === HUMAN_TASK_TITLE || title === AI_TASK_TITLE) && !noteBody(text);
    if (!titleOnly) {
      out.push(text);
      continue;
    }
    const next = list[index + 1];
    const nextTitle = next ? noteTitle(next) : '';
    if (next && nextTitle !== HUMAN_TASK_TITLE && nextTitle !== AI_TASK_TITLE) {
      out.push(formatBreakdownNote(title, next));
      index += 1;
      continue;
    }
    out.push(text);
  }
  return out;
}

/**
 * 写回说明时只替换「人类任务」「AI任务」，其它说明保持原样。
 * 若传入列表里没有这两条标题，原样返回传入列表。
 * @param {string[]} existing
 * @param {string[]} incoming
 * @returns {string[]}
 */
export function mergeBreakdownSubtasks(existing, incoming) {
  const current = coalesceBreakdownSubtasks(existing);
  const next = coalesceBreakdownSubtasks(incoming);
  const human = next.find((text) => noteTitle(text) === HUMAN_TASK_TITLE);
  const ai = next.find((text) => noteTitle(text) === AI_TASK_TITLE);
  if (!human && !ai) return next;
  const kept = current.filter((text) => {
    const title = noteTitle(text);
    return title !== HUMAN_TASK_TITLE && title !== AI_TASK_TITLE;
  });
  // 标题单独成条时，后面误拆出的正文不要再当普通说明留下。
  const breakdownBodies = new Set(
    [human, ai].filter(Boolean).map((text) => noteBody(text)).filter(Boolean)
  );
  const keptClean = kept.filter((text) => !breakdownBodies.has(text));
  const oldHuman = current.find((text) => noteTitle(text) === HUMAN_TASK_TITLE);
  const oldAi = current.find((text) => noteTitle(text) === AI_TASK_TITLE);
  const out = [...keptClean];
  if (human) out.push(human);
  else if (oldHuman) out.push(oldHuman);
  if (ai) out.push(ai);
  else if (oldAi) out.push(oldAi);
  return out;
}

/**
 * @param {object} input
 * @param {string} [input.rules]
 * @param {string} input.title
 * @param {string[]} [input.tagNames]
 * @param {string[]} [input.notes]
 * @param {Array<{ dateKey: string, text: string, completed: boolean, tagNames: string[] }>} [input.related]
 * @returns {string}
 */
export function buildBreakdownContext(input) {
  const rules = String(input?.rules || BREAKDOWN_AGENT_RULES).trim();
  const materials = buildBreakdownPrompt(input);
  return `${rules}\n\n${materials}`;
}

/**
 * @param {string} context
 * @param {string} body
 * @returns {string}
 */
export function packAgentUserMessage(context, body) {
  const ctx = String(context || '').trim();
  const text = String(body || '').trim();
  if (!ctx) return text;
  if (!text) return `${CONTEXT_OPEN}\n${ctx}\n${BODY_OPEN}\n`;
  return `${CONTEXT_OPEN}\n${ctx}\n${BODY_OPEN}\n${text}`;
}

/**
 * @param {string} text
 * @returns {{ context: string, body: string }}
 */
export function splitAgentUserMessage(text) {
  const raw = String(text || '');
  const pattern = /^【上下文】\n([\s\S]*?)\n【正文】\n([\s\S]*)$/;
  const match = raw.match(pattern);
  if (!match) return { context: '', body: raw };
  return { context: match[1], body: match[2] };
}

/**
 * 收起时显示的第一行摘要。
 * @param {string} text
 * @param {number} [max]
 * @returns {string}
 */
export function contextSummary(text, max = 42) {
  const line = String(text || '').split(/\r?\n/).map((part) => part.trim()).find(Boolean) || '';
  if (line.length <= max) return line;
  return `${line.slice(0, max)}…`;
}

/**
 * 每个标签各自取最近的若干条，合并后同一条任务只留一次。
 * 日期新的在前；同一天里必做在选做前面，并保持清单顺序。
 * 同一任务在多天都有副本时，只留日期最新的那一份，并用这一份的标签决定它进哪些名单。
 * @param {object} input
 * @param {Record<string, { required?: any[], optional?: any[] }>} input.days
 * @param {string} input.taskId
 * @param {string[]} input.tagIds
 * @param {number} [input.limit]
 * @returns {Array<{ id: string, dateKey: string, text: string, completed: boolean, tagIds: string[] }>}
 */
export function selectRelatedTasks({ days, taskId, tagIds, limit = RELATED_TASK_LIMIT }) {
  const wanted = [...new Set((tagIds || []).filter(Boolean))];
  if (!wanted.length) return [];

  const dates = Object.keys(days || {}).filter((key) => DATE_KEY.test(key)).sort().reverse();
  const seen = new Set();
  /** @type {Array<{ id: string, dateKey: string, text: string, completed: boolean, tagIds: string[] }>} */
  const latest = [];
  dates.forEach((dateKey) => {
    const day = days[dateKey] || {};
    ['required', 'optional'].forEach((list) => {
      (day[list] || []).forEach((task) => {
        if (!task?.id || seen.has(task.id)) return;
        seen.add(task.id);
        if (task.id === taskId) return;
        latest.push({
          id: task.id,
          dateKey,
          text: task.text || '',
          completed: !!task.completed,
          tagIds: normalizeTagIds(task)
        });
      });
    });
  });

  const picked = new Set();
  wanted.forEach((tagId) => {
    let count = 0;
    latest.forEach((task) => {
      if (count >= limit) return;
      if (!task.tagIds.includes(tagId)) return;
      count += 1;
      picked.add(task.id);
    });
  });

  return latest.filter((task) => picked.has(task.id));
}

/**
 * @param {object} input
 * @param {string} input.title
 * @param {string[]} [input.tagNames]
 * @param {string[]} [input.notes]
 * @param {Array<{ dateKey: string, text: string, completed: boolean, tagNames: string[] }>} [input.related]
 * @returns {string}
 */
export function buildBreakdownPrompt({ title, tagNames = [], notes = [], related = [] }) {
  const tags = tagNames.length ? tagNames.join('、') : '（没有）';
  const noteBlock = notes.length
    ? notes.map((note, index) => `${index + 1}.\n  ${String(note).replace(/\n/g, '\n  ')}`).join('\n')
    : '（没有）';
  const relatedBlock = related.length
    ? related.map((item) => {
      const state = item.completed ? '完成' : '未完成';
      const names = item.tagNames?.length ? item.tagNames.join('、') : '（没有）';
      const text = String(item.text || '').replace(/\s+/g, ' ').trim();
      return `- ${item.dateKey} ${state} ${text}（标签：${names}）`;
    }).join('\n')
    : '（没有）';
  return [
    '当前任务',
    `标题：${title || ''}`,
    `标签：${tags}`,
    '说明：',
    noteBlock,
    '',
    '同类任务',
    relatedBlock
  ].join('\n');
}

/**
 * @param {string} raw
 * @returns {{ humanBody: string, aiBody: string }}
 */
export function parseBreakdown(raw) {
  const lines = stripFence(raw).split(/\r?\n/);
  /** @type {Array<{ title: string, index: number }>} */
  const marks = [];
  lines.forEach((line, index) => {
    const title = canonicalTitle(line);
    if (title) marks.push({ title, index });
  });
  const human = marks.find((mark) => mark.title === HUMAN_TASK_TITLE);
  const ai = marks.find((mark) => mark.title === AI_TASK_TITLE);
  if (!human || !ai) throw new BreakdownParseError();
  const humanBody = sliceBody(lines, human.index, marks);
  const aiBody = sliceBody(lines, ai.index, marks);
  if (!humanBody || !aiBody) throw new BreakdownParseError();
  return { humanBody, aiBody };
}

/**
 * @param {string} raw
 * @returns {string}
 */
function stripFence(raw) {
  const text = String(raw || '').trim();
  const fenced = text.match(/^```[\w]*\s*\n([\s\S]*?)\n?```$/);
  return fenced ? fenced[1].trim() : text;
}

/**
 * @param {string} line
 * @returns {string}
 */
function canonicalTitle(line) {
  let cleaned = String(line || '').trim();
  cleaned = cleaned.replace(/^#+\s*/, '');
  cleaned = cleaned.replace(/^[-*]\s*/, '');
  cleaned = cleaned.replace(/^\d+[.)、]\s*/, '');
  cleaned = cleaned.replace(/\*+/g, '');
  cleaned = cleaned.replace(/[：:]\s*$/, '').trim();
  if (cleaned === HUMAN_TASK_TITLE || cleaned === AI_TASK_TITLE) return cleaned;
  return '';
}

/**
 * @param {string[]} lines
 * @param {number} start
 * @param {Array<{ index: number }>} marks
 * @returns {string}
 */
function sliceBody(lines, start, marks) {
  const next = marks.map((mark) => mark.index).filter((index) => index > start).sort((a, b) => a - b)[0];
  const end = next == null ? lines.length : next;
  return lines.slice(start + 1, end).join('\n').trim();
}
