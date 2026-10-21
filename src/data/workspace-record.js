/**
 * Global workspace: tags, and any ideas still stored on this record.
 * A daily task stores at most one tag id. Tags do not own a task list.
 */

/**
 * @typedef {import('./schedule-record.js').TaskRefRecord} TaskRefRecord
 */

/**
 * @typedef {Object} IdeaRecord
 * @property {string} id
 * @property {string} text
 * @property {string} note
 * @property {number} createdAt
 * @property {string|null} dueDate
 * @property {TaskRefRecord[]} dependsOn
 * @property {boolean} completed
 * @property {boolean} archived
 * @property {boolean} pinned
 * @property {{ x: number, y: number }|null} position
 */

/**
 * @typedef {Object} TagRecord
 * @property {string} id
 * @property {string} name
 * @property {string} description 什么情况下任务属于这个标签
 * @property {string} color
 * @property {boolean} pinned
 */

/**
 * @typedef {Object} WorkspaceRecord
 * @property {IdeaRecord[]} ideas
 * @property {TagRecord[]} tags
 */

/** @returns {WorkspaceRecord} */
export function createEmptyWorkspace() {
  return { ideas: [], tags: [] };
}

/**
 * @param {any} raw
 * @returns {{ x: number, y: number }|null}
 */
function normalizePosition(raw) {
  if (
    raw &&
    typeof raw.x === 'number' &&
    typeof raw.y === 'number' &&
    !Number.isNaN(raw.x) &&
    !Number.isNaN(raw.y)
  ) {
    return { x: raw.x, y: raw.y };
  }
  return null;
}

/**
 * @param {any} raw
 * @returns {IdeaRecord[]}
 */
export function normalizeIdeas(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && (t.id || t.text))
    .map((t) => ({
      id: t.id ? String(t.id) : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: t.text || '',
      note: t.note || '',
      completed: !!t.completed,
      archived: !!t.archived,
      pinned: !!t.pinned,
      createdAt: typeof t.createdAt === 'number' ? t.createdAt : typeof t.time === 'number' ? t.time : Date.now(),
      dueDate: t.dueDate ?? null,
      dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.map((r) => ({ ...r })) : [],
      position: normalizePosition(t.position)
    }));
}

/**
 * Historical upgrades still fold old milestone rows. The live workspace does not keep them.
 * @param {any} raw
 * @returns {Array<{ id: string, title: string, date: string, completed: boolean }>}
 */
export function normalizeMilestones(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && m.id && (m.title || m.date))
    .map((m) => ({
      id: String(m.id),
      title: String(m.title || ''),
      date: String(m.date || ''),
      completed: !!m.completed
    }));
}

/**
 * @param {any} raw
 * @returns {TagRecord[]}
 */
export function normalizeTags(raw) {
  if (!Array.isArray(raw)) return [];
  const names = new Set();
  /** @type {TagRecord[]} */
  const tags = [];
  raw.forEach((tag) => {
    const name = String(tag?.name || '').trim();
    if (!tag?.id || !name || names.has(name)) return;
    names.add(name);
    const color = typeof tag.color === 'string' && tag.color ? tag.color : '';
    tags.push({
      id: String(tag.id),
      name,
      description: String(tag.description || '').trim(),
      color,
      pinned: tag.pinned === true
    });
  });
  return tags;
}

/**
 * @param {any} raw
 * @returns {WorkspaceRecord}
 */
export function normalizeWorkspace(raw) {
  if (!raw || typeof raw !== 'object') return createEmptyWorkspace();
  return {
    ideas: normalizeIdeas(raw.ideas),
    tags: normalizeTags(raw.tags)
  };
}
