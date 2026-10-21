const TITLES = {
  list_tags: '查看标签',
  list_ready_ideas: '查看可捡起的灵感',
  read_idea: '读取灵感',
  list_day: '查看这一天',
  list_open_days: '查看未完成的日期',
  list_open_tasks: '查看未完成任务',
  update_task: '修改任务',
  pickup_idea: '捡起灵感',
  copy_open_task: '带上未完成任务',
  create_task: '新建任务',
  remove_task: '拿下任务',
  create_idea: '新建灵感',
  update_idea: '修改灵感',
  ask_choices: '向用户提问'
};

/**
 * @param {string} name
 */
export function toolTitle(name) {
  return TITLES[name] || name || '调用工具';
}

/**
 * @param {string} name
 * @param {any} args
 */
export function toolHint(name, args) {
  if (!args || typeof args !== 'object') return '';
  if (name === 'ask_choices') {
    const questions = Array.isArray(args.questions) ? args.questions : [];
    return clip(questions[0]?.prompt || '');
  }
  for (const key of ['text', 'date', 'ideaId', 'taskId', 'sourceDate']) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) return clip(value.trim());
  }
  return '';
}

/**
 * 把一轮里的调用和结果收成一行。向用户提问只留一行。
 * @param {any[]} events
 */
export function toolSteps(events) {
  /** @type {any[]} */
  const steps = [];
  /** @type {Map<string, any>} */
  const byId = new Map();
  for (const event of events || []) {
    if (!event || event.kind === 'reasoning') continue;
    if (event.kind === 'ask_choices') {
      const step = event.id ? byId.get(event.id) : null;
      if (step) step.questions = event.questions || [];
      continue;
    }
    if (event.kind === 'tool_call') {
      const step = {
        id: event.id || `call-${steps.length}`,
        name: event.name || '',
        arguments: event.arguments || {},
        ok: null,
        questions: event.name === 'ask_choices' ? (event.arguments?.questions || []) : null
      };
      steps.push(step);
      if (event.id) byId.set(event.id, step);
      continue;
    }
    if (event.kind === 'tool_result') {
      const step = event.id
        ? byId.get(event.id)
        : [...steps].reverse().find((item) => item.name === event.name && item.ok === null);
      if (step) step.ok = event.ok === true;
    }
  }
  return steps;
}

/**
 * @param {{ phase?: string, events?: any[], text?: string }} input
 */
export function activityStatus({ phase, events, text }) {
  if (phase === 'tools') {
    const name = runningTool(events);
    if (name) return `调用工具中 ${name}`;
    return toolSteps(events).length ? '等待模型响应' : '调用工具中';
  }
  if (phase === 'wait') {
    const started = !!(text && String(text).trim()) || toolSteps(events).length > 0;
    return started ? '等待模型响应' : '准备中';
  }
  return '';
}

/**
 * @param {any[]} events
 */
function runningTool(events) {
  /** @type {Map<string, string>} */
  const open = new Map();
  for (const event of events || []) {
    if (event?.kind === 'tool_call' && event.id) open.set(event.id, event.name || '');
    if (event?.kind === 'tool_result' && event.id) open.delete(event.id);
  }
  const names = [...open.values()].filter(Boolean);
  return names[names.length - 1] || '';
}

/**
 * @param {string} text
 */
function clip(text) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  return [...flat].length > 24 ? `${[...flat].slice(0, 24).join('')}…` : flat;
}
