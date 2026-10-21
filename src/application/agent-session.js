import { AGENT_SYSTEM } from '../domain/agent/prompt.js';
import { CHOICE_NAMES, READ_NAMES, WRITE_NAMES, toolsForTurn } from '../domain/agent/catalog.js';
import { normalizeAskChoices } from '../domain/agent/choices.js';
import { classifyTurn } from '../domain/agent/turn.js';
import { tagDirective } from '../domain/agent/tag-intent.js';
import { formatMentions } from '../domain/agent/transcript.js';
import { redact } from '../domain/agent/redact.js';
import { AgentRuntime, dropStaged, editStaged, moveStaged, rowFromCall } from './agent-runtime.js';

const MAX_ROUNDS = 8;

export class AgentSession {
  /**
   * @param {object} deps
   * @param {AgentRuntime} deps.runtime
   * @param {(input: { messages: any[], tools: any[], model?: string, signal?: AbortSignal, onDelta?: (delta: any) => void }) => Promise<{ content: string, reasoning?: string, toolCalls: any[] }>} deps.complete
   * @param {(record: any) => Promise<void>|void} [deps.log]
   * @param {(event: any) => Promise<void>|void} [deps.onEvent]
   * @param {() => void} [deps.onLive]
   * @param {number} [deps.maxRounds]
   */
  constructor({ runtime, complete, log, onEvent, onLive, maxRounds = MAX_ROUNDS }) {
    this.runtime = runtime;
    this.complete = complete;
    this.log = log || (() => {});
    this.onEvent = onEvent || null;
    this.onLive = onLive || null;
    this.maxRounds = maxRounds;
    this.permission = 'default';
    this.model = '';
    this.phase = 'idle';
    this.pendingModelText = '';
    this.stopped = false;
    /** @type {AbortController | null} */
    this.abort = null;
    /** @type {{ role: 'user'|'assistant', text: string, mentions?: any[], events?: any[] }[]} */
    this.messages = [];
    /** @type {{ role: 'user'|'assistant', text: string }[]} */
    this.transcript = [];
    /** @type {any[]} */
    this.staged = [];
    /** @type {string[]} */
    this.detailDates = [];
    /** @type {{ callId: string, questions: any[] } | null} */
    this.pendingChoice = null;
    /** @type {any[]} */
    this.modelMessages = [{ role: 'system', content: AGENT_SYSTEM }];
  }

  /** @param {any} event */
  async emit(event) {
    if (this.onEvent) await this.onEvent(event);
  }

  live() {
    if (this.onLive) this.onLive();
  }

  prepare() {
    this.stopped = false;
    this.pendingModelText = '';
    this.phase = 'wait';
    this.abort = new AbortController();
  }

  requestStop() {
    this.stopped = true;
    this.abort?.abort();
  }

  /** @param {unknown} error */
  isAbort(error) {
    return this.stopped || !!this.abort?.signal.aborted || (error instanceof Error && error.name === 'AbortError');
  }

  /** @param {string} text */
  appendVisible(text) {
    if (!text) return;
    this.ensureAssistant().text += text;
    this.pendingModelText += text;
  }

  /** @param {string} kind @param {any} payload */
  async record(kind, payload) {
    await this.log(redact({ time: new Date().toISOString(), kind, ...payload }));
  }

  ensureAssistant() {
    const last = this.messages[this.messages.length - 1];
    if (last && last.role === 'assistant') return last;
    const created = { role: 'assistant', text: '', events: [] };
    this.messages.push(created);
    return created;
  }

  /** @param {{ messages?: any[], staged?: any[], modelMessages?: any[], permission?: string, model?: string }} state */
  restore(state) {
    this.messages = state?.messages || [];
    this.transcript = this.messages
      .filter((item) => item.text)
      .map((item) => ({ role: item.role, text: item.text }));
    this.staged = Array.isArray(state?.staged) ? state.staged : [];
    this.detailDates = [];
    this.pendingChoice = null;
    this.modelMessages = [{ role: 'system', content: AGENT_SYSTEM }, ...(state?.modelMessages || [])];
    this.permission = state?.permission || 'default';
    this.model = state?.model || '';
  }

  rows() {
    return this.staged.map(rowFromCall);
  }

  async persistStaged() {
    await this.emit({ type: 'staged', calls: this.staged });
  }

  /**
   * @param {string} id
   * @param {Record<string, any>} patch
   */
  async editRow(id, patch) {
    this.staged = editStaged(this.staged, id, patch);
    await this.record('proposal_edit', { id, patch });
    await this.persistStaged();
    return this.rows();
  }

  /** @param {string} id */
  async dropRow(id) {
    this.staged = dropStaged(this.staged, id);
    await this.record('proposal_edit', { id, dropped: true });
    await this.persistStaged();
    return this.rows();
  }

  /** @param {string} id @param {-1|1} direction */
  async moveRow(id, direction) {
    this.staged = moveStaged(this.staged, id, direction);
    await this.record('proposal_edit', { id, direction });
    await this.persistStaged();
    return this.rows();
  }

  async cancel() {
    this.staged = [];
    await this.record('cancel', {});
    await this.persistStaged();
    return this.rows();
  }

  async confirm() {
    const result = this.runtime.commit(this.staged);
    if (!result.ok) {
      const row = this.rows()[result.index] || null;
      await this.record('commit_rejected', { error: result.error, row });
      return { ok: false, error: result.error, row, rows: this.rows() };
    }
    this.staged = [];
    await this.record('commit_ok', {});
    await this.persistStaged();
    return { ok: true, rows: [] };
  }

  /**
   * @param {any} message
   */
  async pushModel(message) {
    this.modelMessages.push(message);
    await this.emit({ type: 'model', message });
  }

  /**
   * @param {{ id: string, name: string, arguments: any }} call
   * @param {ReturnType<typeof classifyTurn>} turn
   */
  async handleTool(call, turn) {
    await this.record('tool_call', { name: call.name, arguments: call.arguments || {} });
    this.ensureAssistant().events.push({
      kind: 'tool_call',
      id: call.id,
      name: call.name,
      arguments: call.arguments || {}
    });
    await this.emit({ type: 'tool_call', id: call.id, name: call.name, arguments: call.arguments || {} });
    this.phase = 'tools';
    this.live();

    /** @type {any} */
    let payload;
    if (CHOICE_NAMES.has(call.name)) {
      const normalized = normalizeAskChoices(call.arguments || {});
      if (!normalized.ok) {
        payload = { error: normalized.error };
        await this.finishTool(call, false, payload);
        return payload;
      }
      this.pendingChoice = { callId: call.id, questions: normalized.questions };
      this.ensureAssistant().events.push({
        kind: 'ask_choices',
        id: call.id,
        questions: normalized.questions
      });
      payload = { status: 'waiting_for_user' };
      await this.finishTool(call, true, payload);
      return payload;
    }
    if (READ_NAMES.has(call.name)) {
      const result = this.runtime.read(call.name, call.arguments || {}, this.detailDates);
      this.detailDates = result.detailDates || this.detailDates;
      payload = result.ok ? result.data : { error: result.error };
      await this.finishTool(call, result.ok, payload);
      return payload;
    }
    if (WRITE_NAMES.has(call.name)) {
      if (this.permission === 'read') {
        payload = { error: '当前是只读，不能改日程' };
        await this.finishTool(call, false, payload);
        return payload;
      }
      if (this.permission === 'auto') {
        const staged = this.runtime.stage([], call.name, call.arguments || {}, turn);
        if (!staged.ok) {
          payload = { error: staged.error };
          await this.finishTool(call, false, payload);
          return payload;
        }
        const only = staged.staged[staged.staged.length - 1];
        const committed = this.runtime.commit([only]);
        payload = committed.ok ? { ok: true } : { error: committed.error };
        await this.finishTool(call, committed.ok, payload);
        return payload;
      }
      const result = this.runtime.stage(this.staged, call.name, call.arguments || {}, turn);
      if (result.ok) this.staged = result.staged;
      payload = result.ok ? { ok: true } : { error: result.error };
      await this.finishTool(call, result.ok, payload);
      if (result.ok) await this.persistStaged();
      return payload;
    }
    payload = { error: '没有这个函数' };
    await this.finishTool(call, false, payload);
    return payload;
  }

  /**
   * @param {{ id: string, name: string }} call
   * @param {boolean} ok
   * @param {any} payload
   */
  async finishTool(call, ok, payload) {
    this.ensureAssistant().events.push({
      kind: 'tool_result',
      id: call.id,
      name: call.name,
      ok,
      payload
    });
    await this.record('tool_result', { name: call.name, ok, payload });
    await this.emit({ type: 'tool_result', id: call.id, name: call.name, ok, payload });
    this.live();
  }

  async pushPendingAnswer() {
    const text = this.pendingModelText;
    this.pendingModelText = '';
    if (!text) return;
    const last = this.modelMessages[this.modelMessages.length - 1];
    const already = last && last.role === 'assistant' && !last.tool_calls && last.content === text;
    if (!already) await this.pushModel({ role: 'assistant', content: text });
  }

  /**
   * @param {string} text
   * @param {{ mentions?: any[] }} [extras]
   */
  async submit(text, extras = {}) {
    const raw = String(text || '').trim();
    if (!raw) return { ok: false, error: '先写一句话', rows: this.rows() };
    const mentions = Array.isArray(extras.mentions) ? extras.mentions : [];
    const world = this.runtime.world();
    const turn = classifyTurn(raw, { viewedKey: world.viewedKey, today: world.today });
    turn.tagDirective = tagDirective(raw, world.tags);
    this.detailDates = [];
    this.pendingChoice = null;
    this.messages.push({ role: 'user', text: raw, mentions });
    this.transcript.push({ role: 'user', text: raw });
    await this.record('user_message', { text: raw, turn });
    const proposalNote = this.staged.length ? `\n\n当前方案：\n${JSON.stringify(this.rows())}` : '';
    const context = this.runtime.contextFor(turn);
    const mentionNote = formatMentions(mentions);
    const spoken = mentionNote ? `${raw}\n\n${mentionNote}` : raw;
    const modelContent = `${context}\n\n${spoken}${proposalNote}`;
    await this.emit({ type: 'user', text: raw, mentions, modelContent });
    await this.pushModel({ role: 'user', content: modelContent });
    const tools = toolsForTurn(turn, this.permission);
    if (!this.abort || this.phase === 'idle' || this.phase === 'choose') this.prepare();
    this.phase = 'wait';
    this.live();

    for (let round = 0; round < this.maxRounds; round += 1) {
      if (this.isAbort()) return this.halt();
      this.phase = 'wait';
      this.live();
      await this.record('model_request', {
        round,
        messages: this.modelMessages,
        tools: tools.map((item) => item.function.name)
      });
      let streamed = '';
      let response;
      try {
        response = await this.complete({
          messages: this.modelMessages,
          tools,
          model: this.model || undefined,
          signal: this.abort?.signal,
          onDelta: (delta) => {
            if (this.isAbort()) return;
            if (delta?.type === 'content' && delta.text) {
              streamed += delta.text;
              this.appendVisible(delta.text);
              this.phase = 'text';
              this.live();
            } else if (delta?.type === 'tools') {
              this.phase = 'tools';
              this.live();
            }
          }
        });
      } catch (error) {
        if (this.isAbort(error)) return this.halt();
        const message = error && error.message ? error.message : '模型请求失败';
        return this.fail(message);
      }
      if (this.isAbort()) return this.halt();
      if (!response) return this.fail('模型没有返回文本');
      const content = typeof response.content === 'string' ? response.content : '';
      if (content.startsWith(streamed) && content.length > streamed.length) {
        this.appendVisible(content.slice(streamed.length));
        streamed = content;
      } else if (!streamed && content) {
        this.appendVisible(content);
        streamed = content;
      }
      const toolCalls = response.toolCalls || [];
      await this.record('model_response', { content: streamed, toolCalls });
      if (response.reasoning) {
        this.ensureAssistant().events.push({ kind: 'reasoning', text: response.reasoning });
        await this.emit({ type: 'reasoning', text: response.reasoning });
        this.live();
      }
      if (!toolCalls.length) break;
      this.phase = 'tools';
      this.live();
      const roundText = this.pendingModelText;
      this.pendingModelText = '';
      await this.pushModel({
        role: 'assistant',
        content: roundText,
        tool_calls: toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments || {}) }
        }))
      });
      let awaitingChoice = false;
      for (const call of toolCalls) {
        if (this.isAbort()) return this.halt();
        const payload = await this.handleTool(call, turn);
        if (this.isAbort()) return this.halt();
        await this.pushModel({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(payload)
        });
        if (CHOICE_NAMES.has(call.name) && this.pendingChoice) awaitingChoice = true;
      }
      if (awaitingChoice) return this.pauseForChoice();
    }

    return this.finish();
  }

  async pauseForChoice() {
    const bubble = this.ensureAssistant();
    if (!bubble.text) {
      bubble.text = '先确认这几项：';
      this.pendingModelText = bubble.text;
    }
    this.phase = 'choose';
    this.transcript.push({ role: 'assistant', text: bubble.text });
    await this.emit({ type: 'assistant', text: bubble.text, awaitingChoice: true });
    await this.record('assistant_message', { text: bubble.text, awaitingChoice: true });
    await this.pushPendingAnswer();
    this.live();
    return { ok: true, awaitingChoice: true, text: bubble.text, rows: this.rows() };
  }

  /** @param {string} message */
  async fail(message) {
    await this.record('model_response', { error: message });
    const bubble = this.ensureAssistant();
    bubble.text = bubble.text ? `${bubble.text}\n${message}` : message;
    this.phase = 'idle';
    this.transcript.push({ role: 'assistant', text: bubble.text });
    await this.emit({ type: 'assistant', text: bubble.text });
    this.live();
    return { ok: false, error: message, rows: this.rows() };
  }

  async finish() {
    const bubble = this.ensureAssistant();
    if (!bubble.text) {
      const fallback = this.staged.length ? '方案在下面，确认后写入。' : '这次没有改动。';
      bubble.text = fallback;
      this.pendingModelText = fallback;
    }
    this.phase = 'idle';
    this.transcript.push({ role: 'assistant', text: bubble.text });
    await this.emit({ type: 'assistant', text: bubble.text });
    await this.record('assistant_message', { text: bubble.text });
    await this.pushPendingAnswer();
    return { ok: true, text: bubble.text, rows: this.rows() };
  }

  async halt() {
    this.phase = 'idle';
    this.staged = [];
    await this.record('cancel', { stopped: true });
    await this.persistStaged();
    const last = this.messages[this.messages.length - 1];
    if (!last || last.role !== 'assistant') {
      return { ok: true, stopped: true, text: '', rows: [] };
    }
    if (!last.text && !(last.events || []).length) {
      this.messages.pop();
      this.pendingModelText = '';
      return { ok: true, stopped: true, text: '', rows: [] };
    }
    if (last.text) {
      this.transcript.push({ role: 'assistant', text: last.text });
      await this.emit({ type: 'assistant', text: last.text });
      await this.record('assistant_message', { text: last.text });
      await this.pushPendingAnswer();
    } else {
      this.pendingModelText = '';
    }
    return { ok: true, stopped: true, text: last.text || '', rows: [] };
  }
}
