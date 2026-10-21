/** 创建标签时发给小模型的说明。只收一段 JSON。 */
export const TAG_NAME_SYSTEM = '只输出 JSON：{"project":"<项目名>","description":"<描述>"}。不解释、不询问，不返回除了 JSON 外任何内容。根据输入把任务归并到项目：可以选择现有项目，也可以创建项目。选中现有项目时 description 留空。创建项目时，description 用一句话说明什么情况下任务属于该项目，不超过 80 个字。无法判断该归入哪个项目时，project 填 other，description 留空。';

const NEW_PROJECT_LIMIT = 10;
const NEW_DESCRIPTION_LIMIT = 80;

/**
 * @param {string|{ name?: string, description?: string }} project
 * @returns {string}
 */
function projectLine(project) {
  if (project && typeof project === 'object') {
    const name = String(project.name || '').trim();
    const boundary = String(project.description || '').trim();
    if (!name) return '';
    return boundary ? `${name}：${boundary}` : name;
  }
  return String(project || '').trim();
}

/**
 * @param {object} input
 * @param {string} [input.title]
 * @param {string[]} [input.notes]
 * @param {Array<string|{ name?: string, description?: string }>} [input.projects]
 * @returns {string}
 */
export function buildTagNamePrompt({ title = '', notes = [], projects = [] } = {}) {
  const description = (Array.isArray(notes) ? notes : [])
    .map((note) => String(note || '').trim())
    .filter(Boolean)
    .join('\n');
  const lines = (Array.isArray(projects) ? projects : [])
    .map(projectLine)
    .filter(Boolean);
  const projectBlock = lines.length ? lines.join('\n') : '无';
  const section = (label, body) => (body ? `${label}\n${body}` : label);
  return [
    section('任务名称：', String(title || '').trim()),
    section('任务描述：', description),
    section('现有项目：', projectBlock)
  ].join('\n\n');
}

/**
 * 新建项目只去掉首尾空白，中间空格保留，再取前 10 个 Unicode 字。
 * @param {string} value
 * @returns {string}
 */
export function clipNewProjectName(value) {
  return Array.from(String(value || '').trim()).slice(0, NEW_PROJECT_LIMIT).join('');
}

/**
 * 新建项目的描述只去掉首尾空白，再取前 80 个 Unicode 字。
 * @param {string} value
 * @returns {string}
 */
export function clipTagDescription(value) {
  return Array.from(String(value || '').trim()).slice(0, NEW_DESCRIPTION_LIMIT).join('');
}

/**
 * @param {string} name
 * @param {string[]} existingNames
 * @returns {string}
 */
function storedName(name, existingNames) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '';
  const found = (existingNames || []).find((item) => String(item || '').trim() === trimmed);
  return found ? String(found) : '';
}

/**
 * 先按现有项目的全名匹配。对不上才截成新项目名，截断后再对一次现有项目。
 * @param {string} candidate
 * @param {string[]} existingNames
 * @returns {string}
 */
export function resolveProjectName(candidate, existingNames = []) {
  const exact = storedName(candidate, existingNames);
  if (exact) return exact;
  const clipped = clipNewProjectName(candidate);
  if (!clipped) return '';
  return storedName(clipped, existingNames) || clipped;
}

/**
 * @param {Array<string|{ name?: string }>} existing
 * @returns {string[]}
 */
function existingNamesOf(existing) {
  return (Array.isArray(existing) ? existing : []).map((item) => (
    item && typeof item === 'object' ? item.name : item
  ));
}

/**
 * 解析 {"project","description"}。没有返回、不是 JSON 或 project 为空时，用任务标题走同一套规则。
 * 对上现有项目时不带回描述，避免盖掉已经写好的说明。
 * @param {string} raw
 * @param {string} [fallbackTitle]
 * @param {Array<string|{ name?: string }>} [existing]
 * @returns {{ name: string, description: string, skipped: boolean }}
 */
export function projectFromModel(raw, fallbackTitle = '', existing = []) {
  const existingNames = existingNamesOf(existing);
  let candidate = '';
  let description = '';
  try {
    const parsed = JSON.parse(String(raw || '').trim());
    if (parsed && typeof parsed.project === 'string' && parsed.project.trim()) {
      candidate = parsed.project;
    }
    if (parsed && typeof parsed.description === 'string') {
      description = parsed.description;
    }
  } catch {
    candidate = '';
    description = '';
  }
  if (isOtherProject(candidate)) return { name: '', description: '', skipped: true };
  const name = resolveProjectName(candidate || fallbackTitle, existingNames);
  if (!name || storedName(name, existingNames)) return { name, description: '', skipped: false };
  return { name, description: clipTagDescription(description), skipped: false };
}

/**
 * 模型明确表示无法归类。不拿任务标题顶上，也不去对现有项目。
 * @param {string} value
 * @returns {boolean}
 */
function isOtherProject(value) {
  return String(value || '').trim().toLowerCase() === 'other';
}

/**
 * 解析项目名。没有返回、不是 JSON 或 project 为空时，用任务标题走同一套规则。
 * @param {string} raw
 * @param {string} [fallbackTitle]
 * @param {Array<string|{ name?: string }>} [existing]
 * @returns {string}
 */
export function projectNameFromModel(raw, fallbackTitle = '', existing = []) {
  return projectFromModel(raw, fallbackTitle, existing).name;
}
