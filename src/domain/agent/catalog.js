const DATE = { type: 'string', description: 'YYYY-MM-DD' };
const LIST = { type: 'string', enum: ['required', 'optional'], description: 'required 是必做，optional 是选做' };
const TAG = { type: 'string', description: '已有标签的 id，或空字符串。空字符串表示不挂标签。' };
const SUBTASKS = { type: 'array', items: { type: 'string' }, description: '任务说明，一条一项。没有说明时给空数组。' };

/**
 * @param {string} name
 * @param {string} description
 * @param {Record<string, object>} properties
 * @param {string[]} required
 */
function tool(name, description, properties, required) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties, required, additionalProperties: false }
    }
  };
}

export const READ_TOOLS = [
  tool('list_tags', '列出已有标签的 id、名字和描述。描述说明什么情况下任务属于该标签。', {}, []),
  tool('list_ready_ideas', '列出当前可以捡起的灵感。只有标题。', {}, []),
  tool('read_idea', '读取一条灵感的标题和 Markdown 正文。不含图片。', { ideaId: { type: 'string' } }, ['ideaId']),
  tool('list_day', '列出某一天的全部必做和选做，含已完成。', { date: DATE }, ['date']),
  tool('list_open_days', '列出正在看的那一天以外、还有未完成任务的日期。只含日期、条数和标题。', {}, []),
  tool('list_open_tasks', '列出某一天未完成任务的正文和说明。一轮最多 7 个不同日期。', { date: DATE }, ['date'])
];

const UPDATE = tool(
  'update_task',
  '改目标日已有的一条任务。tagId 传空字符串会摘掉标签。',
  {
    date: DATE,
    taskId: { type: 'string' },
    text: { type: 'string' },
    note: { type: 'string' },
    list: LIST,
    tagId: TAG,
    subtasks: SUBTASKS
  },
  ['date', 'taskId', 'text', 'note', 'list', 'tagId', 'subtasks']
);

const PICKUP = tool(
  'pickup_idea',
  '把一条可捡起的灵感收成某一天的一条任务。灵感里这条会消失。',
  {
    ideaId: { type: 'string' },
    date: DATE,
    list: LIST,
    tagId: TAG,
    text: { type: 'string' },
    note: { type: 'string' },
    subtasks: SUBTASKS
  },
  ['ideaId', 'date', 'list', 'tagId', 'text', 'note', 'subtasks']
);

const COPY = tool(
  'copy_open_task',
  '把过去某一天的一条未完成任务带到目标日，沿用原来的 id。来源日不动。',
  {
    sourceDate: DATE,
    taskId: { type: 'string' },
    date: DATE,
    list: LIST,
    tagId: TAG,
    text: { type: 'string' },
    note: { type: 'string' },
    subtasks: SUBTASKS
  },
  ['sourceDate', 'taskId', 'date', 'list', 'tagId', 'text', 'note', 'subtasks']
);

const CREATE = tool(
  'create_task',
  '新建一条任务。只在用户这句话里说出了新任务时才能用。时间写在 text 里。',
  {
    date: DATE,
    list: LIST,
    text: { type: 'string' },
    note: { type: 'string' },
    tagId: TAG,
    subtasks: SUBTASKS
  },
  ['date', 'list', 'text', 'note', 'tagId', 'subtasks']
);

const REMOVE = tool(
  'remove_task',
  '从某一天删掉一条任务，其他日期的副本还在。只有用户说了「就这些」或「只留」才能用。',
  { date: DATE, taskId: { type: 'string' } },
  ['date', 'taskId']
);

const CREATE_IDEA = tool(
  'create_idea',
  '新建一条灵感。text 会成为正文第一行，note 接在后面。正文是 Markdown，不要放图片。没有截止日期。',
  {
    text: { type: 'string', description: '正文第一行' },
    note: { type: 'string', description: '第一行之后的 Markdown' }
  },
  ['text', 'note']
);

const UPDATE_IDEA = tool(
  'update_idea',
  '修改一条灵感的正文或完成状态。text 是正文第一行，note 是其余 Markdown。没有截止日期，也没有前序。',
  {
    ideaId: { type: 'string' },
    text: { type: 'string' },
    note: { type: 'string' },
    completed: { type: 'boolean' }
  },
  ['ideaId', 'text', 'note', 'completed']
);

const ASK_CHOICES = tool(
  'ask_choices',
  '信息不够清楚时，向用户出示一道或多道选择题。调用后等待用户回答，不要同时改日程。',
  {
    questions: {
      type: 'array',
      description: '题目列表。一次可以多道，界面里左右翻题。',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '本题 id，一轮内唯一' },
          prompt: { type: 'string', description: '题干' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' }
              },
              required: ['id', 'label'],
              additionalProperties: false
            }
          },
          allowOther: { type: 'boolean', description: '是否提供「其他补充」。默认 true。' }
        },
        required: ['id', 'prompt', 'options'],
        additionalProperties: false
      }
    }
  },
  ['questions']
);

/**
 * @param {{ allowCreate: boolean, allowRemove: boolean }} turn
 * @param {'default'|'read'|'auto'} [permission]
 */
export function toolsForTurn(turn, permission = 'default') {
  if (permission === 'read') return [...READ_TOOLS, ASK_CHOICES];
  const writes = [UPDATE, PICKUP, COPY, CREATE_IDEA, UPDATE_IDEA];
  if (turn.allowCreate) writes.push(CREATE);
  if (turn.allowRemove) writes.push(REMOVE);
  return [...READ_TOOLS, ASK_CHOICES, ...writes];
}

export const WRITE_NAMES = new Set(['create_task', 'update_task', 'remove_task', 'pickup_idea', 'copy_open_task', 'create_idea', 'update_idea']);
export const READ_NAMES = new Set(READ_TOOLS.map((item) => item.function.name));
export const CHOICE_NAMES = new Set(['ask_choices']);
