/**
 * @typedef {Object} TaskNote
 * @property {string} id
 * @property {string} text
 */

/**
 * @typedef {Object} DailyTask
 * @property {string} id
 * @property {string} text
 * @property {boolean} completed
 * @property {number} time
 * @property {boolean} pinned
 * @property {string} recurrence
 * @property {string[]} tagIds
 * @property {TaskNote[]} notes
 */

/** 任务正文里出现的时间。先匹配更长的写法，避免「3点半」被收成「3点」。 */
const TIME_MENTION = /(上午|下午|晚上|中午|凌晨)?\s*(?:\d{1,2}\s*[:：]\s*\d{2}(?:\s*(?:am|pm))?|\d{1,2}\s*点半|\d{1,2}\s*点(?:\s*\d{1,2}\s*分)?|\d{1,2}\s*(?:am|pm))/gi;

/**
 * 把正文拆成普通文字和时间片段。时间留在原处，后面的文字紧跟着它。
 * @param {string} text
 * @returns {{ text: string, time: boolean }[]}
 */
export function splitTimeMentions(text) {
  const source = String(text || '');
  const parts = [];
  let last = 0;
  TIME_MENTION.lastIndex = 0;
  for (const match of source.matchAll(TIME_MENTION)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: source.slice(last, start), time: false });
    parts.push({ text: match[0], time: true });
    last = start + match[0].length;
  }
  if (last < source.length || parts.length === 0) parts.push({ text: source.slice(last), time: false });
  return parts;
}

/**
 * @param {string} text
 * @returns {{ hours: number, minutes: number } | null}
 */
export function parseTime(text) {
  const timePatterns = [
    /(\d{1,2}):(\d{2})/,
    /(\d{1,2})点/,
    /(\d{1,2})\s*(am|pm)/i
  ];

  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      let hours = parseInt(match[1], 10);
      let minutes = match[2] && !isNaN(parseInt(match[2], 10)) ? parseInt(match[2], 10) : 0;

      if (match[3]) {
        const period = match[3].toLowerCase();
        if (period === 'pm' && hours < 12) hours += 12;
        if (period === 'am' && hours === 12) hours = 0;
      }

      return { hours, minutes };
    }
  }
  return null;
}

/**
 * @param {string} text
 * @param {{ id?: string }} [overrides]
 * @returns {TaskNote}
 */
export function createNote(text, overrides = {}) {
  return {
    id: overrides.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: String(text || '').trim()
  };
}

/**
 * 编辑框里还没按回车确认的草稿，保存时也收成一条说明。
 * @param {TaskNote[]|null|undefined} notes
 * @param {string} draft
 * @returns {TaskNote[]}
 */
export function commitNoteDraft(notes, draft) {
  const list = Array.isArray(notes) ? notes : [];
  const text = String(draft || '').trim();
  if (!text) return list;
  return [...list, createNote(text)];
}

/**
 * 把拆解时误拆成「标题一条 + 正文一条」的说明收成一条。
 * @param {TaskNote[]} notes
 * @returns {TaskNote[]}
 */
function coalesceBreakdownNotes(notes) {
  /** @type {TaskNote[]} */
  const out = [];
  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index];
    const lines = String(note.text || '').split('\n');
    const title = String(lines[0] || '').trim();
    const body = lines.slice(1).join('\n').trim();
    const titleOnly = (title === '人类任务' || title === 'AI任务') && !body;
    if (!titleOnly) {
      out.push(note);
      continue;
    }
    const next = notes[index + 1];
    const nextTitle = next ? String(String(next.text || '').split('\n')[0] || '').trim() : '';
    if (next && nextTitle !== '人类任务' && nextTitle !== 'AI任务') {
      out.push(createNote(`${title}\n${next.text}`, { id: note.id }));
      index += 1;
      continue;
    }
    out.push(note);
  }
  return out;
}

/**
 * 已有的单条说明，加上原来的子任务正文，收成多条说明。
 * 已经是 notes 数组时直接用它，不再把旧字段再并一次。
 * @param {any} raw
 * @param {{ note?: string, subtasks?: any[] }} [legacy]
 * @returns {TaskNote[]}
 */
export function normalizeNotes(raw, legacy = {}) {
  /** @type {TaskNote[]} */
  let notes;
  if (Array.isArray(raw)) {
    notes = raw
      .filter((item) => item && (item.id || item.text))
      .map((item) => createNote(item.text || '', { id: item.id }))
      .filter((item) => item.text);
  } else {
    notes = [];
    const note = String(legacy.note || '').trim();
    if (note) notes.push(createNote(note));
    const subtasks = Array.isArray(legacy.subtasks) ? legacy.subtasks : [];
    subtasks.forEach((item) => {
      const text = String(item?.text || (typeof item === 'string' ? item : '')).trim();
      if (!text) return;
      notes.push(createNote(text, { id: typeof item?.id === 'string' ? item.id : undefined }));
    });
  }
  return coalesceBreakdownNotes(notes);
}

/**
 * 一条任务上的标签。旧数据里的单个 tagId / projectId 收成数组。
 * @param {any} raw
 * @returns {string[]}
 */
export function normalizeTagIds(raw) {
  const source = Array.isArray(raw?.tagIds)
    ? raw.tagIds
    : raw?.tagId
      ? [raw.tagId]
      : raw?.projectId
        ? [raw.projectId]
        : [];
  const seen = new Set();
  const ids = [];
  source.forEach((id) => {
    const value = typeof id === 'string' ? id.trim() : '';
    if (!value || seen.has(value)) return;
    seen.add(value);
    ids.push(value);
  });
  return ids;
}

/**
 * @param {string} text
 * @param {Date} baseDate
 * @param {Partial<DailyTask>} [overrides]
 * @returns {DailyTask}
 */
export function createDailyTask(text, baseDate, overrides = {}) {
  const timeMatch = parseTime(text);
  let time;
  if (timeMatch) {
    const now = new Date(baseDate);
    now.setHours(timeMatch.hours, timeMatch.minutes, 0, 0);
    time = now.getTime();
  } else {
    time = Date.now();
  }

  const {
    subtasks: rawSubtasks,
    notes: rawNotes,
    note: rawNote,
    pomodoros: _pomodoros,
    projectId: _projectId,
    tagId: _tagId,
    ...rest
  } = overrides;
  return {
    id: rest.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    completed: false,
    time,
    pinned: false,
    recurrence: '',
    ...rest,
    tagIds: normalizeTagIds(overrides),
    notes: normalizeNotes(rawNotes, { note: rawNote, subtasks: rawSubtasks })
  };
}

/**
 * Shallow-clone a task including a deep copy of notes (for sync).
 * @param {DailyTask|any} task
 * @returns {DailyTask}
 */
export function cloneDailyTask(task) {
  const copy = {
    ...task,
    tagIds: normalizeTagIds(task),
    notes: normalizeNotes(task?.notes, { note: task?.note, subtasks: task?.subtasks }).map((item) => ({ ...item }))
  };
  delete copy.projectId;
  delete copy.tagId;
  delete copy.pomodoros;
  delete copy.note;
  delete copy.subtasks;
  return copy;
}

/** @param {DailyTask[]} tasks */
export function sortTasks(tasks) {
  tasks.sort((a, b) => {
    if (a.pinned !== b.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    return a.time - b.time;
  });
  return tasks;
}
