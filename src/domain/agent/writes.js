import { bodyAfterTitle, ideaTitle } from '../ideas/idea-document.js';
import { normalizeNotes, normalizeTagIds } from '../schedule/daily-task.js';
import { coalesceBreakdownSubtasks, mergeBreakdownSubtasks, noteTitle, AI_TASK_TITLE, HUMAN_TASK_TITLE } from '../schedule/task-breakdown.js';
import { WRITE_NAMES } from './catalog.js';

/**
 * @param {Record<string, any>} schedule
 * @param {string} date
 * @param {string} taskId
 */
export function findTask(schedule, date, taskId) {
  const day = schedule?.[date];
  for (const list of ['required', 'optional']) {
    const task = (day?.[list] || []).find((item) => item && item.id === taskId);
    if (task) return { list, task };
  }
  return null;
}

/**
 * @param {any} call
 * @returns {string}
 */
export function identityKey(call) {
  if (!call) return '';
  if (call.name === 'create_idea') return `create:${call.id}`;
  if (call.name === 'pickup_idea' || call.name === 'update_idea') return `idea:${call.args.ideaId}`;
  if (call.name === 'create_task') return `create:${call.id}`;
  if (call.args?.taskId) return `task:${call.args.taskId}`;
  return '';
}

/**
 * @param {any} args
 * @returns {string[]}
 */
function cleanSubtasks(args) {
  if (!Array.isArray(args?.subtasks)) return [];
  return coalesceBreakdownSubtasks(args.subtasks.map((item) => String(item || '').trim()).filter(Boolean));
}

/** @param {any} task */
function storedNotes(task) {
  return normalizeNotes(task?.notes, { note: task?.note, subtasks: task?.subtasks }).map((item) => item.text);
}

/** @param {string[]} texts */
function hasBreakdownTitle(texts) {
  return (texts || []).some((text) => {
    const title = noteTitle(text);
    return title === HUMAN_TASK_TITLE || title === AI_TASK_TITLE;
  });
}

/**
 * @param {string} name
 * @param {any} raw
 */
export function normalizeWriteArgs(name, raw) {
  const args = raw && typeof raw === 'object' ? raw : {};
  if (name === 'create_idea' || name === 'update_idea') {
    const next = {
      text: String(args.text || args.title || '').trim(),
      note: String(args.note ?? args.body ?? ''),
      completed: args.completed === true
    };
    if (name === 'update_idea') next.ideaId = String(args.ideaId || '').trim();
    return next;
  }
  const list = args.list === 'optional' ? 'optional' : 'required';
  const base = {
    date: String(args.date || '').trim(),
    list,
    text: String(args.text || '').trim(),
    note: String(args.note || ''),
    tagId: typeof args.tagId === 'string' ? args.tagId.trim() : '',
    subtasks: cleanSubtasks(args)
  };
  if (name === 'update_task' || name === 'remove_task' || name === 'copy_open_task') {
    base.taskId = String(args.taskId || '').trim();
  }
  if (name === 'pickup_idea') base.ideaId = String(args.ideaId || '').trim();
  if (name === 'copy_open_task') base.sourceDate = String(args.sourceDate || '').trim();
  return base;
}

/**
 * @param {any} call
 * @param {any} world
 * @returns {boolean}
 */
export function countsAsRequiredPlacement(call, world) {
  if (!call || call.args.list !== 'required') return false;
  if (call.name === 'pickup_idea' || call.name === 'copy_open_task' || call.name === 'create_task') return true;
  if (call.name !== 'update_task') return false;
  const found = findTask(world.schedule, call.args.date, call.args.taskId);
  return !!found && found.list === 'optional';
}

/**
 * @param {any} call
 * @param {any} world
 * @param {{ writableDates: string[], allowCreate: boolean, allowRemove: boolean }} gate
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateCall(call, world, gate) {
  if (!WRITE_NAMES.has(call?.name)) return { ok: false, error: '没有这个函数' };
  if (call.name === 'create_idea' || call.name === 'update_idea') return validateIdeaWrite(call, world);
  const args = call.args;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date || '')) return { ok: false, error: '日期无效' };
  if (!(gate.writableDates || []).includes(args.date)) {
    const allowed = (gate.writableDates || []).join('、') || '无';
    return { ok: false, error: `这一天不在这句话里。允许写入：${allowed}` };
  }
  if (args.tagId && !(world.tagIds || []).includes(args.tagId)) return { ok: false, error: '标签不存在' };

  if (call.name === 'create_task') {
    if (!gate.allowCreate) return { ok: false, error: '这次不能新建任务' };
    if (!args.text) return { ok: false, error: '任务标题是空的' };
    return { ok: true };
  }

  if (call.name === 'remove_task') {
    if (!gate.allowRemove) return { ok: false, error: '没有说就这些或只留，不能删除' };
    if (!findTask(world.schedule, args.date, args.taskId)) return { ok: false, error: '这一天没有这条任务' };
    return { ok: true };
  }

  if (call.name === 'update_task') {
    if (!findTask(world.schedule, args.date, args.taskId)) return { ok: false, error: '这一天没有这条任务' };
    if (!args.text) return { ok: false, error: '任务标题是空的' };
    return { ok: true };
  }

  if (call.name === 'pickup_idea') {
    if (!(world.readyIds || []).includes(args.ideaId)) return { ok: false, error: '灵感还不能捡起' };
    if (!args.text) return { ok: false, error: '任务标题是空的' };
    return { ok: true };
  }

  if (call.name === 'copy_open_task') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.sourceDate || '')) return { ok: false, error: '来源日期无效' };
    if (args.sourceDate === args.date) return { ok: false, error: '来源日和目标日是同一天' };
    const source = findTask(world.schedule, args.sourceDate, args.taskId);
    if (!source || source.task.completed) return { ok: false, error: '来源日没有这条未完成任务' };
    if (findTask(world.schedule, args.date, args.taskId)) return { ok: false, error: '目标日已经有这条任务' };
    if (!args.text) return { ok: false, error: '任务标题是空的' };
    return { ok: true };
  }

  return { ok: false, error: '没有这个函数' };
}

/**
 * @param {any} call
 * @param {any} world
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function validateIdeaWrite(call, world) {
  const args = call.args || {};
  if (!args.text) return { ok: false, error: '灵感标题是空的' };
  if (call.name === 'create_idea') return { ok: true };
  const idea = (world.ideas || []).find((item) => item.id === args.ideaId);
  if (!idea) return { ok: false, error: '灵感不存在' };
  return { ok: true };
}

/**
 * @param {any[]} calls
 * @param {any} world
 * @returns {{ ok: true } | { ok: false, index: number, error: string }}
 */
export function validateProposal(calls, world) {
  const seen = new Set();
  let cappedRequired = 0;
  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index];
    const key = identityKey(call);
    if (key && seen.has(key)) return { ok: false, index, error: '这条已经在方案里' };
    if (key) seen.add(key);
    const one = validateCall(call, world, {
      writableDates: call.writableDates || [],
      allowCreate: call.allowCreate === true,
      allowRemove: call.allowRemove === true
    });
    if (!one.ok) return { ok: false, index, error: one.error };
    if (call.capped && countsAsRequiredPlacement(call, world)) {
      cappedRequired += 1;
      if (cappedRequired > Number(call.cap)) {
        return { ok: false, index, error: `这次放进必做的最多 ${call.cap} 条` };
      }
    }
  }
  return { ok: true };
}

/**
 * 把模型参数补成方案里的完整一行。
 * @param {string} name
 * @param {any} raw
 * @param {any} world
 */
export function completeWriteArgs(name, raw, world) {
  const args = normalizeWriteArgs(name, raw);
  if (name === 'update_task') {
    const found = findTask(world.schedule, args.date, args.taskId);
    if (found) {
      if (!raw || raw.text == null) args.text = found.task.text || '';
      if (!raw || raw.note == null) args.note = '';
      if (!raw || raw.list == null) args.list = found.list;
      if (!raw || raw.tagId == null) args.tagId = normalizeTagIds(found.task)[0] || '';
      if (!raw || raw.subtasks == null) args.subtasks = storedNotes(found.task);
      else if (hasBreakdownTitle(args.subtasks)) {
        args.subtasks = mergeBreakdownSubtasks(storedNotes(found.task), args.subtasks);
      }
    }
  }
  if (name === 'pickup_idea') {
    const idea = (world.ideas || []).find((item) => item.id === args.ideaId);
    if (idea) {
      if (!raw || raw.text == null || !args.text) args.text = idea.title || idea.text || '';
      if (!raw || raw.note == null) args.note = idea.body || idea.note || '';
    }
  }
  if (name === 'update_idea') {
    const idea = (world.ideas || []).find((item) => item.id === args.ideaId);
    if (idea) {
      if (!raw || (raw.text == null && raw.title == null) || !args.text) args.text = ideaTitle(idea) || idea.title || idea.text || '';
      if (!raw || (raw.note == null && raw.body == null)) args.note = bodyAfterTitle(idea.body || idea.note || '');
      if (!raw || raw.completed == null) args.completed = !!idea.completed;
    }
  }
  if (name === 'copy_open_task') {
    const source = findTask(world.schedule, args.sourceDate, args.taskId);
    if (source) {
      if (!raw || raw.text == null || !args.text) args.text = source.task.text || '';
      if (!raw || raw.note == null) args.note = '';
      if (!raw || raw.subtasks == null) args.subtasks = storedNotes(source.task);
    }
  }
  if (name === 'remove_task') {
    const found = findTask(world.schedule, args.date, args.taskId);
    if (found) {
      args.text = found.task.text || '';
      args.note = '';
      args.list = found.list;
      args.tagId = normalizeTagIds(found.task)[0] || '';
      args.subtasks = storedNotes(found.task);
    }
  }
  return args;
}

const TAGGED_WRITES = new Set(['create_task', 'update_task', 'pickup_idea', 'copy_open_task']);

/**
 * 没写日期且只允许一天时填上那一天。标签按这句话改写。
 * @param {string} name
 * @param {any} raw
 * @param {any} world
 * @param {{ writableDates?: string[], tagDirective?: { mode: string, tagId?: string } }} turn
 * @returns {{ ok: true, args: any } | { ok: false, error: string }}
 */
export function applyTurnOverrides(name, raw, world, turn) {
  if (name === 'create_idea' || name === 'update_idea') {
    const args = completeWriteArgs(name, raw, world);
    return { ok: true, args };
  }
  const allowed = turn?.writableDates || [];
  const given = String(raw?.date || '').trim();
  let date = given;
  if (!date) {
    if (allowed.length !== 1) {
      return { ok: false, error: `补上允许写入里的一个日期：${allowed.join('、') || '无'}` };
    }
    date = allowed[0];
  }
  const args = completeWriteArgs(name, { ...(raw || {}), date }, world);
  const directive = turn?.tagDirective;
  if (directive && TAGGED_WRITES.has(name)) {
    if (directive.mode === 'set') args.tagId = directive.tagId || '';
    if (directive.mode === 'clear') args.tagId = '';
  }
  return { ok: true, args };
}

/**
 * @param {any[]} staged
 * @param {any} call
 */
export function upsertCall(staged, call) {
  const key = identityKey(call);
  if (!key || key.startsWith('create:')) return [...staged, call];
  const index = staged.findIndex((item) => identityKey(item) === key);
  if (index < 0) return [...staged, call];
  const next = staged.slice();
  next[index] = { ...call, id: staged[index].id };
  return next;
}

/**
 * @param {any[]} staged
 * @param {any} call
 * @param {any} world
 * @returns {{ ok: true, staged: any[] } | { ok: false, error: string, staged: any[] }}
 */
export function stageWrite(staged, call, world) {
  const next = upsertCall(staged, call);
  const checked = validateProposal(next, world);
  if (!checked.ok) return { ok: false, error: checked.error, staged };
  return { ok: true, staged: next };
}

/**
 * @param {any} call
 */
export function rowFromCall(call) {
  const idea = call.name === 'create_idea' || call.name === 'update_idea';
  return {
    id: call.id,
    name: call.name,
    date: idea ? '' : call.args.date,
    title: call.args.text || '',
    note: call.args.note || '',
    list: call.args.list === 'optional' ? 'optional' : 'required',
    tagId: call.args.tagId || '',
    subtasks: call.args.subtasks || [],
    removing: call.name === 'remove_task',
    writableDates: call.writableDates || [],
    idea,
    completed: idea ? !!call.args.completed : false
  };
}

/**
 * @param {any[]} staged
 * @param {string} id
 * @param {Record<string, any>} patch
 */
export function editStaged(staged, id, patch) {
  return staged.map((call) => {
    if (call.id !== id || call.name === 'remove_task') return call;
    const args = { ...call.args };
    if (patch.text != null) args.text = String(patch.text);
    if (patch.note != null) args.note = String(patch.note);
    if (patch.list === 'required' || patch.list === 'optional') args.list = patch.list;
    if (patch.tagId != null) args.tagId = String(patch.tagId);
    if (Array.isArray(patch.subtasks)) {
      args.subtasks = coalesceBreakdownSubtasks(
        patch.subtasks.map((item) => String(item || '').trim()).filter(Boolean)
      );
    }
    if (patch.date != null) args.date = String(patch.date);
    if (patch.completed != null) args.completed = !!patch.completed;
    return { ...call, args };
  });
}

/** @param {any[]} staged @param {string} id */
export function dropStaged(staged, id) {
  return staged.filter((call) => call.id !== id);
}

/**
 * @param {any[]} staged
 * @param {string} id
 * @param {-1|1} direction
 */
export function moveStaged(staged, id, direction) {
  const index = staged.findIndex((call) => call.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= staged.length) return staged;
  const next = staged.slice();
  const [row] = next.splice(index, 1);
  next.splice(target, 0, row);
  return next;
}
