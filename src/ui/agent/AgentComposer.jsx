import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/context.jsx';
import { Events } from '../../application/event-bus.js';
import { Symbol } from '../library/index.js';
import { AGENT_SKILLS, PERMISSIONS, filterMentions } from '../../domain/agent/transcript.js';
import { packAgentUserMessage } from '../../domain/schedule/task-breakdown.js';
import { holdImeEnter, imeCompositionProps, useImeEnterGuard } from '../keyboard/ime-enter.js';
import { AgentContextPill } from './AgentContextPill.jsx';

const KIND_LABEL = { day: '日期', task: '任务', tag: '标签', idea: '灵感' };

/**
 * @param {string} value
 * @param {number} cursor
 */
function activeToken(value, cursor) {
  const upto = String(value || '').slice(0, cursor);
  const match = upto.match(/(^|\s)([@/])([^\s@/]*)$/);
  if (!match) return null;
  const mark = match[2];
  const query = match[3];
  return {
    kind: mark === '@' ? 'mention' : 'skill',
    query,
    start: upto.length - mark.length - query.length
  };
}

/**
 * @param {string} value
 * @param {{ start: number, query: string } | null} token
 */
function removeToken(value, token) {
  if (!token) return value;
  const end = token.start + 1 + token.query.length;
  return `${value.slice(0, token.start)}${value.slice(end)}`.replace(/\s+/g, ' ').trim();
}

/**
 * @param {object} props
 * @param {string} props.permission
 * @param {string} props.model
 * @param {boolean} props.busy
 * @param {any[]} props.catalog
 * @param {(permission: string) => void} props.onPermission
 * @param {(model: string) => void} props.onModel
 * @param {(text: string, mentions: any[]) => void} props.onSend
 * @param {() => void} [props.onStop]
 * @param {() => void} [props.onFocus]
 */
export function AgentComposer({ permission, model, busy, catalog, onPermission, onModel, onSend, onStop, onFocus }) {
  const app = useApp();
  const [draft, setDraft] = useState('');
  const [context, setContext] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const [mentions, setMentions] = useState([]);
  const [models, setModels] = useState(/** @type {string[]} */ ([]));
  const [menu, setMenu] = useState(/** @type {null | { kind: 'mention' | 'skill', query: string, token: any }} */ (null));
  const inputRef = useRef(null);
  const formRef = useRef(null);
  const ime = useImeEnterGuard();

  useEffect(() => {
    if (!menu) return undefined;
    function onPointerDown(event) {
      const target = event.target;
      if (target instanceof Node && formRef.current?.contains(target)) return;
      setMenu(null);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menu]);

  useEffect(() => {
    let live = true;
    app.llmService.listModels().then((ids) => {
      if (live) setModels(ids);
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [app]);

  useEffect(() => {
    return app.eventBus.on(Events.AGENT_COMPOSER_DRAFT, (payload) => {
      const nextContext = String(payload?.context || '');
      const nextBody = String(payload?.body || '');
      const nextMentions = Array.isArray(payload?.mentions) ? payload.mentions : [];
      setContext(nextContext);
      setContextOpen(false);
      setDraft(nextBody);
      setMentions(nextMentions);
      setMenu(null);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.style.height = 'auto';
          inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
          inputRef.current.focus();
        }
      });
      onFocus?.();
    });
  }, [app, onFocus]);

  const settingsModel = app.llmService.modelFor('agentModel');
  const chosen = model || settingsModel;
  const options = chosen && !models.includes(chosen) ? [chosen, ...models] : models;
  const modelOptions = options.length ? options : (chosen ? [chosen] : []);

  const mentionItems = menu?.kind === 'mention' ? filterMentions(catalog, menu.query).slice(0, 30) : [];
  const skillItems = menu?.kind === 'skill'
    ? AGENT_SKILLS.filter((skill) => !menu.query || skill.name.includes(menu.query))
    : [];

  function resize(field) {
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }

  function syncMenu(value, cursor) {
    const token = activeToken(value, cursor);
    if (!token) {
      setMenu((current) => (current && !current.token ? current : null));
      return;
    }
    setMenu({ kind: token.kind, query: token.query, token });
  }

  function addMention(item) {
    setMentions((current) => {
      const key = `${item.kind}:${item.id}`;
      if (current.some((entry) => `${entry.kind}:${entry.id}` === key)) return current;
      return [...current, item];
    });
    if (menu?.token) {
      const next = removeToken(draft, menu.token);
      setDraft(next);
    }
    setMenu(null);
    inputRef.current?.focus();
  }

  function chooseSkill() {
    if (menu?.token) setDraft(removeToken(draft, menu.token));
    setMenu(null);
    inputRef.current?.focus();
  }

  function send() {
    const body = draft.trim();
    if ((!body && !context.trim()) || busy) return;
    onSend(packAgentUserMessage(context, body || '（无正文）'), mentions);
    setDraft('');
    setContext('');
    setContextOpen(false);
    setMentions([]);
    setMenu(null);
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }

  function onKeyDown(event) {
    if (holdImeEnter(event, ime)) return;
    if (event.key === 'Escape') {
      setMenu(null);
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (menu?.token && menu.kind === 'mention' && mentionItems.length) {
      event.preventDefault();
      addMention(mentionItems[0]);
      return;
    }
    if (menu?.token && menu.kind === 'skill' && skillItems.length) {
      event.preventDefault();
      chooseSkill();
      return;
    }
    event.preventDefault();
    if (ime.shouldIgnoreSubmit()) return;
    send();
  }

  const canSend = Boolean(draft.trim() || context.trim());

  return (
    <form
      ref={formRef}
      className="agent-bar"
      data-agent-composer="bar"
      {...imeCompositionProps(ime)}
      onSubmit={(event) => {
        event.preventDefault();
        if (ime.shouldIgnoreSubmit()) return;
        send();
      }}
    >
      <AgentContextPill
        text={context}
        open={contextOpen}
        editable
        onOpenChange={setContextOpen}
        onChange={setContext}
        onRemove={() => { setContext(''); setContextOpen(false); }}
      />
      {mentions.length ? (
        <div className="agent-chips">
          {mentions.map((item) => (
            <span key={`${item.kind}:${item.id}`} className="agent-chip is-static">
              <span>{item.label}</span>
              <button
                type="button"
                className="agent-chip-remove"
                aria-label={`去掉 ${item.label}`}
                onClick={() => setMentions((current) => current.filter((entry) => entry.id !== item.id || entry.kind !== item.kind))}
              >
                <Symbol name="close" size={10} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <textarea
        ref={inputRef}
        className="agent-input"
        data-agent-composer="input"
        rows={1}
        value={draft}
        placeholder="今天帮你做些什么？"
        aria-label="给 Agent 发消息"
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          const value = event.target.value;
          setDraft(value);
          resize(event.target);
          syncMenu(value, event.target.selectionStart || value.length);
        }}
      />
      <div className="agent-tools">
        <button
          type="button"
          className="agent-plus"
          aria-label="添加上下文"
          onClick={() => setMenu({ kind: 'mention', query: '', token: null })}
        >
          <Symbol name="plus" size={16} />
        </button>
        <select
          className="agent-select"
          aria-label="权限"
          value={permission || 'default'}
          disabled={busy}
          onChange={(event) => onPermission(event.target.value)}
        >
          {PERMISSIONS.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
        <span className="agent-tools-spacer" />
        <select
          className="agent-select"
          aria-label="模型"
          value={chosen}
          disabled={busy || !modelOptions.length}
          onChange={(event) => onModel(event.target.value)}
        >
          {modelOptions.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
        <button
          type={busy ? 'button' : 'submit'}
          className="agent-send"
          disabled={!busy && !canSend}
          aria-label={busy ? '停止' : '发送'}
          onClick={() => { if (busy) onStop?.(); }}
        >
          <Symbol name={busy ? 'stop' : 'send'} size={16} />
        </button>
      </div>
      {menu ? (
        <div className="agent-menu" role="listbox">
          {menu.kind === 'mention' ? mentionItems.map((item) => (
            <button key={`${item.kind}:${item.id}:${item.date}`} type="button" className="agent-menu-item" onClick={() => addMention(item)}>
              <span className="agent-menu-kind">{KIND_LABEL[item.kind] || item.kind}</span>
              <span>{item.label}</span>
            </button>
          )) : null}
          {menu.kind === 'mention' && !mentionItems.length ? <p className="agent-menu-empty">没有可挂的内容</p> : null}
          {menu.kind === 'skill' ? skillItems.map((skill) => (
            <button key={skill.id} type="button" className="agent-menu-item" onClick={chooseSkill}>
              <span>{skill.name}</span>
            </button>
          )) : null}
        </div>
      ) : null}
    </form>
  );
}
