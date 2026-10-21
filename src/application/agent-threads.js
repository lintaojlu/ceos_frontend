import { AgentSession } from './agent-session.js';
import { Events } from './event-bus.js';
import { CHOICE_CLOSED_MESSAGE, formatChoiceAnswers } from '../domain/agent/choices.js';
import { parseIndex, replayTranscript, stripSkillToken, threadTitle } from '../domain/agent/transcript.js';

function createThreadId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 多段对话。底部对话框和完整页读同一段。
 * 发出第一句才写入磁盘。
 */
export class AgentThreads {
  /**
   * @param {object} deps
   * @param {import('./agent-runtime.js').AgentRuntime} deps.runtime
   * @param {AgentSession['complete']} deps.complete
   * @param {(record: any) => Promise<void>|void} [deps.log]
   * @param {ReturnType<import('../infrastructure/agent/transcript-store.js').createMemoryAgentStore>} deps.store
   * @param {import('./event-bus.js').EventBus} deps.eventBus
   * @param {() => string} [deps.defaultModel]
   * @param {() => string} [deps.createId]
   * @param {() => string} [deps.now]
   * @param {number} [deps.maxRounds]
   */
  constructor({ runtime, complete, log, store, eventBus, defaultModel, createId, now, maxRounds }) {
    this.runtime = runtime;
    this.complete = complete;
    this.log = log;
    this.store = store;
    this.eventBus = eventBus;
    this.defaultModel = defaultModel || (() => '');
    this.createId = createId || createThreadId;
    this.now = now || (() => new Date().toISOString());
    this.maxRounds = maxRounds;
    this.busy = false;
    this.index = { currentId: '', threads: [] };
    this.meta = this.blankMeta();
    /** @type {AgentSession} */
    this.session = this.makeSession();
  }

  blankMeta() {
    return {
      id: '',
      title: '',
      titleLocked: false,
      model: this.defaultModel(),
      permission: 'default',
      persisted: false,
      updatedAt: ''
    };
  }

  makeSession() {
    const session = new AgentSession({
      runtime: this.runtime,
      complete: (input) => this.complete(input),
      log: this.log,
      maxRounds: this.maxRounds,
      onEvent: (event) => this.recordEvent(event),
      onLive: () => { this.emitUpdate(); }
    });
    session.permission = this.meta?.permission || 'default';
    session.model = this.meta?.model || '';
    return session;
  }

  resetDraft() {
    this.meta = this.blankMeta();
    this.session = this.makeSession();
  }

  /** @param {any} event */
  async recordEvent(event) {
    if (!this.meta.persisted || !this.meta.id) return;
    const line = JSON.stringify({ time: this.now(), ...event });
    await this.store.appendSession(this.meta.id, line);
    await this.touch();
  }

  async touch() {
    if (!this.meta.persisted || !this.meta.id) return;
    const updatedAt = this.now();
    this.meta.updatedAt = updatedAt;
    const summary = {
      id: this.meta.id,
      title: this.meta.title || '新对话',
      updatedAt,
      model: this.meta.model,
      permission: this.meta.permission
    };
    const rest = this.index.threads.filter((item) => item.id !== this.meta.id);
    this.index.threads = [summary, ...rest];
    this.index.currentId = this.meta.id;
    await this.store.writeIndex(JSON.stringify(this.index));
  }

  emitUpdate() {
    this.eventBus?.emit(Events.AGENT_UPDATED, {});
  }

  sorted() {
    return [...this.index.threads].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  view() {
    return {
      id: this.meta.id,
      title: this.meta.title,
      titleLocked: this.meta.titleLocked,
      model: this.meta.model || this.defaultModel(),
      permission: this.meta.permission || 'default',
      messages: this.session.messages,
      rows: this.busy ? [] : this.session.rows(),
      busy: this.busy,
      arranging: this.busy && this.session.phase !== 'text' && this.session.phase !== 'choose',
      phase: this.session.phase,
      pendingChoice: this.session.pendingChoice,
      persisted: this.meta.persisted,
      threads: this.sorted()
    };
  }

  async load() {
    this.index = parseIndex(await this.store.readIndex());
    const known = this.index.threads.some((item) => item.id === this.index.currentId);
    if (this.index.currentId && known) {
      await this.open(this.index.currentId);
      return;
    }
    const latest = this.sorted()[0];
    if (latest) {
      await this.open(latest.id);
      return;
    }
    this.resetDraft();
    this.emitUpdate();
  }

  /** @param {string} id */
  async open(id) {
    if (this.busy) return { ok: false, error: '还在回复' };
    const body = await this.store.readSession(id);
    if (!body) return { ok: false, error: '没有这段对话' };
    const state = replayTranscript(body);
    this.meta = {
      id: state.meta.id || id,
      title: state.meta.title || '',
      titleLocked: state.meta.titleLocked === true,
      model: state.meta.model || this.defaultModel(),
      permission: state.meta.permission || 'default',
      persisted: true,
      updatedAt: state.meta.updatedAt || ''
    };
    this.session = this.makeSession();
    this.session.restore({
      messages: state.messages,
      staged: state.staged,
      modelMessages: state.modelMessages,
      permission: this.meta.permission,
      model: this.meta.model
    });
    this.session.permission = this.meta.permission;
    this.session.model = this.meta.model;
    this.index.currentId = this.meta.id;
    await this.store.writeIndex(JSON.stringify(this.index));
    this.emitUpdate();
    return { ok: true };
  }

  beginNew() {
    if (this.busy) return { ok: false, error: '还在回复' };
    this.resetDraft();
    this.emitUpdate();
    return { ok: true };
  }

  /** @param {string} id */
  async remove(id) {
    if (this.busy) return { ok: false, error: '还在回复' };
    this.index.threads = this.index.threads.filter((item) => item.id !== id);
    await this.store.deleteSession(id);
    const removingCurrent = this.meta.id === id;
    if (!removingCurrent) {
      if (this.index.currentId === id) this.index.currentId = this.meta.id;
      await this.store.writeIndex(JSON.stringify(this.index));
      this.emitUpdate();
      return { ok: true };
    }
    const next = this.sorted()[0];
    this.index.currentId = next ? next.id : '';
    await this.store.writeIndex(JSON.stringify(this.index));
    if (next) return this.open(next.id);
    this.resetDraft();
    this.emitUpdate();
    return { ok: true };
  }

  /** @param {string} model */
  async setModel(model) {
    this.meta.model = String(model || '');
    this.session.model = this.meta.model;
    if (this.meta.persisted) {
      await this.recordEvent({ type: 'settings', model: this.meta.model, permission: this.meta.permission });
    }
    this.emitUpdate();
  }

  /** @param {string} permission */
  async setPermission(permission) {
    if (permission !== 'default' && permission !== 'read' && permission !== 'auto') return;
    this.meta.permission = permission;
    this.session.permission = permission;
    if (this.meta.persisted) {
      await this.recordEvent({ type: 'settings', model: this.meta.model, permission });
    }
    this.emitUpdate();
  }

  /** @param {string} title */
  async rename(title) {
    const next = String(title || '').trim();
    if (!next) return;
    this.meta.title = next;
    this.meta.titleLocked = true;
    if (this.meta.persisted) await this.recordEvent({ type: 'title', title: next, locked: true });
    this.emitUpdate();
  }

  async createFile() {
    const id = this.createId();
    const time = this.now();
    this.meta.id = id;
    this.meta.updatedAt = time;
    if (!this.meta.title) this.meta.title = '新对话';
    await this.store.appendSession(id, JSON.stringify({
      time,
      type: 'meta',
      id,
      title: this.meta.title,
      titleLocked: this.meta.titleLocked === true,
      model: this.meta.model,
      permission: this.meta.permission
    }));
    this.meta.persisted = true;
    await this.touch();
  }

  /**
   * @param {string} text
   * @param {any[]} [mentions]
   */
  async submit(text, mentions = []) {
    if (this.busy) return { ok: false, error: '还在回复', rows: this.session.rows() };
    const raw = stripSkillToken(text);
    if (!raw) return { ok: false, error: '先写一句话', rows: this.session.rows() };
    this.session.prepare();
    this.busy = true;
    this.emitUpdate();
    try {
      if (!this.meta.titleLocked && !this.meta.title) this.meta.title = threadTitle(raw);
      if (!this.meta.persisted) await this.createFile();
      this.session.model = this.meta.model;
      this.session.permission = this.meta.permission;
      return await this.session.submit(raw, { mentions });
    } finally {
      this.busy = false;
      if (this.session.phase !== 'choose') this.session.phase = 'idle';
      this.session.abort = null;
      await this.touch();
      this.emitUpdate();
    }
  }

  /**
   * @param {Array<{ questionId: string, skipped?: boolean, optionId?: string, optionLabel?: string, otherText?: string }> | 'closed'} answers
   */
  async answerChoice(answers) {
    if (this.busy) return { ok: false, error: '还在回复', rows: this.session.rows() };
    const pending = this.session.pendingChoice;
    if (!pending) return { ok: false, error: '没有待回答的选择题', rows: this.session.rows() };
    const text = answers === 'closed'
      ? CHOICE_CLOSED_MESSAGE
      : formatChoiceAnswers(pending.questions, answers);
    this.session.pendingChoice = null;
    return this.submit(text, []);
  }

  stop() {
    if (!this.busy) return;
    this.session.requestStop();
  }

  async confirm() {
    const result = await this.session.confirm();
    this.emitUpdate();
    return result;
  }

  async cancel() {
    const rows = await this.session.cancel();
    this.emitUpdate();
    return rows;
  }

  /**
   * @param {string} id
   * @param {Record<string, any>} patch
   */
  async editRow(id, patch) {
    const rows = await this.session.editRow(id, patch);
    this.emitUpdate();
    return rows;
  }

  /** @param {string} id */
  async dropRow(id) {
    const rows = await this.session.dropRow(id);
    this.emitUpdate();
    return rows;
  }

  /** @param {string} id @param {-1|1} direction */
  async moveRow(id, direction) {
    const rows = await this.session.moveRow(id, direction);
    this.emitUpdate();
    return rows;
  }
}
