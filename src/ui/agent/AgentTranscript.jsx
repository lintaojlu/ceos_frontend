import React, { useEffect, useState } from 'react';
import { splitAgentUserMessage } from '../../domain/schedule/task-breakdown.js';
import { DeleteButton, Markdown, Symbol } from '../library/index.js';
import { activityStatus, toolHint, toolSteps, toolTitle } from './activity.js';
import { AgentChoiceCard } from './AgentChoiceCard.jsx';
import { AgentContextPill } from './AgentContextPill.jsx';
import { repairStreamingMarkdown } from './stream-markdown.js';

function tagName(tags, id) {
  if (!id) return '不挂标签';
  return tags.find((tag) => tag.id === id)?.name || '不挂标签';
}

function useElapsed(active) {
  const [seconds, setSeconds] = useState(1);
  useEffect(() => {
    if (!active) return undefined;
    const started = Date.now();
    setSeconds(1);
    const timer = window.setInterval(() => {
      setSeconds(Math.max(1, Math.floor((Date.now() - started) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return seconds;
}

/**
 * @param {object} props
 * @param {any[]} props.messages
 * @param {any[]} props.rows
 * @param {any[]} props.tags
 * @param {boolean} props.busy
 * @param {boolean} [props.arranging]
 * @param {string} [props.phase]
 * @param {{ callId: string, questions: any[] } | null} [props.pendingChoice]
 * @param {(answers: any) => void} [props.onAnswerChoice]
 * @param {(id: string, patch: Record<string, any>) => void} props.onEdit
 * @param {(id: string) => void} props.onDrop
 * @param {(id: string, direction: -1 | 1) => void} props.onMove
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onCancel
 * @param {'dock' | 'page'} [props.layout]
 */
export function AgentTranscript({
  messages,
  rows,
  tags,
  busy,
  arranging = false,
  phase = 'idle',
  pendingChoice = null,
  onAnswerChoice,
  onEdit,
  onDrop,
  onMove,
  onConfirm,
  onCancel,
  layout = 'dock'
}) {
  const page = layout === 'page';
  const last = messages[messages.length - 1];
  const waiting = arranging && last?.role !== 'assistant';
  return (
    <div className={page ? 'agent-log is-page' : 'agent-log'} aria-live="polite">
      {messages.map((item, index) => (
        item.role === 'user' ? (
          <UserTurn key={`user-${index}`} message={item} layout={layout} />
        ) : (
          <AssistantTurn
            key={`assistant-${index}`}
            message={item}
            layout={layout}
            pending={arranging && index === messages.length - 1}
            streaming={busy && index === messages.length - 1}
            phase={index === messages.length - 1 ? phase : 'idle'}
            choice={pendingChoice && index === messages.length - 1 ? pendingChoice : null}
            onAnswerChoice={onAnswerChoice}
            choiceDisabled={busy}
          />
        )
      ))}
      {waiting ? (
        <div className={page ? 'agent-turn agent-turn-assistant' : 'agent-turn'}>
          {page ? <Identity /> : null}
          <LiveStatus phase="wait" events={[]} text="" />
        </div>
      ) : null}
      {rows.length ? (
        <div className="agent-rows">
          {rows.map((row) => (
            <div key={row.id} className={row.removing ? 'agent-row is-removing' : 'agent-row'}>
              <div className="agent-row-top">
                <span className="agent-row-date">{row.date}</span>
                {row.removing ? <span className="agent-row-flag">将从这一天拿下</span> : null}
                <span className="agent-row-actions">
                  <button type="button" className="btn btn-quiet" onClick={() => onMove(row.id, -1)} aria-label="上移">↑</button>
                  <button type="button" className="btn btn-quiet" onClick={() => onMove(row.id, 1)} aria-label="下移">↓</button>
                  <DeleteButton label="从方案拿掉" onClick={() => onDrop(row.id)} />
                </span>
              </div>
              {row.removing ? (
                <div className="agent-row-title">{row.title}</div>
              ) : row.idea ? (
                <>
                  <input
                    className="field agent-title"
                    value={row.title}
                    aria-label="标题"
                    onChange={(event) => onEdit(row.id, { text: event.target.value })}
                  />
                  <textarea
                    className="textarea agent-steps"
                    aria-label="正文"
                    placeholder="Markdown 正文"
                    value={row.note}
                    onChange={(event) => onEdit(row.id, { note: event.target.value })}
                  />
                  <div className="agent-row-fields">
                    <label className="field-label">
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={!!row.completed}
                        onChange={(event) => onEdit(row.id, { completed: event.target.checked })}
                      />
                      已完成
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <input
                    className="field agent-title"
                    value={row.title}
                    aria-label="标题"
                    onChange={(event) => onEdit(row.id, { text: event.target.value })}
                  />
                  <div className="agent-row-fields">
                    <select
                      className="field"
                      aria-label="必做或选做"
                      value={row.list}
                      onChange={(event) => onEdit(row.id, { list: event.target.value })}
                    >
                      <option value="required">必做</option>
                      <option value="optional">选做</option>
                    </select>
                    <select
                      className="field"
                      aria-label="标签"
                      value={row.tagId}
                      onChange={(event) => onEdit(row.id, { tagId: event.target.value })}
                    >
                      <option value="">不挂标签</option>
                      {tags.map((tag) => (
                        <option key={tag.id} value={tag.id}>{tag.name}</option>
                      ))}
                    </select>
                    {row.writableDates.length > 1 ? (
                      <select
                        className="field"
                        aria-label="日期"
                        value={row.date}
                        onChange={(event) => onEdit(row.id, { date: event.target.value })}
                      >
                        {row.writableDates.map((key) => (
                          <option key={key} value={key}>{key}</option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                  <textarea
                    className="textarea agent-steps"
                    aria-label="说明"
                    placeholder="说明，一行一条"
                    defaultValue={(row.subtasks || []).join('\n')}
                    key={`${row.id}:${(row.subtasks || []).join('\n')}`}
                    onBlur={(event) => {
                      const subtasks = event.target.value.split('\n').map((line) => line.trim()).filter(Boolean);
                      onEdit(row.id, { subtasks });
                    }}
                  />
                  <div className="agent-row-meta">{tagName(tags, row.tagId)}</div>
                </>
              )}
            </div>
          ))}
          <div className="agent-confirm">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onConfirm}>确定</button>
            <button type="button" className="btn" disabled={busy} onClick={onCancel}>放弃</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Identity() {
  return (
    <div className="agent-identity">
      <span className="agent-avatar"><Symbol name="agent" size={15} /></span>
      <span>Agent</span>
    </div>
  );
}

function UserTurn({ message, layout }) {
  const page = layout === 'page';
  const [open, setOpen] = useState(false);
  const parts = splitAgentUserMessage(message.text || '');
  const body = (
    <div className={page ? 'agent-bubble agent-bubble-user' : 'agent-line agent-line-user'}>
      <AgentContextPill text={parts.context} open={open} onOpenChange={setOpen} />
      {parts.body ? <span className="agent-user-body">{parts.body}</span> : null}
    </div>
  );
  return (
    <div className={page ? 'agent-turn agent-turn-user' : 'agent-turn'}>
      {message.mentions?.length ? (
        <div className="agent-chips">
          {message.mentions.map((mention) => (
            <span key={`${mention.kind}:${mention.id}`} className="agent-chip is-static">{mention.label}</span>
          ))}
        </div>
      ) : null}
      {body}
    </div>
  );
}

function AssistantTurn({ message, layout, pending, streaming, phase, choice, onAnswerChoice, choiceDisabled }) {
  const page = layout === 'page';
  const events = message.events || [];
  const steps = toolSteps(events);
  const reasoning = events.filter((event) => event.kind === 'reasoning');
  const live = pending || streaming;
  const shown = page && streaming ? repairStreamingMarkdown(message.text) : message.text;
  const body = message.text
    ? (page ? <div className="agent-answer"><Markdown text={shown} /></div> : <p className="agent-line">{message.text}</p>)
    : null;
  return (
    <div className={page ? 'agent-turn agent-turn-assistant' : 'agent-turn'}>
      {page ? <Identity /> : null}
      {live ? <Elapsed /> : null}
      {reasoning.length ? <Thinking events={reasoning} /> : null}
      {steps.length ? (
        <div className="agent-steps-list">
          {steps.map((step) => <ToolStep key={step.id} step={step} />)}
        </div>
      ) : null}
      {live ? <LiveStatus phase={phase} events={events} text={message.text} showElapsed={false} /> : null}
      {body}
      {choice ? (
        <AgentChoiceCard
          questions={choice.questions}
          disabled={choiceDisabled}
          onDone={(answers) => onAnswerChoice?.(answers)}
        />
      ) : null}
    </div>
  );
}

function Elapsed() {
  const seconds = useElapsed(true);
  return <p className="agent-elapsed">已处理 {seconds}s</p>;
}

function LiveStatus({ phase, events, text, showElapsed = true }) {
  const status = activityStatus({ phase, events, text });
  return (
    <>
      {showElapsed ? <Elapsed /> : null}
      {status ? <p className="agent-status">{status}</p> : null}
    </>
  );
}

function Thinking({ events }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="agent-step">
      <button type="button" className="agent-step-toggle" onClick={() => setOpen((value) => !value)}>
        <Symbol name="search" size={14} />
        <span className="agent-step-title">深度思考</span>
        <Symbol name={open ? 'chevron-down' : 'chevron-right'} size={14} />
      </button>
      {open ? events.map((event, index) => (
        <p key={`think-${index}`} className="agent-process-line">{event.text}</p>
      )) : null}
    </div>
  );
}

function ToolStep({ step }) {
  const [open, setOpen] = useState(false);
  const hint = toolHint(step.name, step.arguments);
  const questions = Array.isArray(step.questions) ? step.questions : [];
  const detail = questions.length
    ? questions.map((item) => item?.prompt || '').filter(Boolean).join('\n')
    : JSON.stringify({ parameters: step.arguments || {} }, null, 2);
  return (
    <div className="agent-step">
      <button type="button" className="agent-step-toggle" onClick={() => setOpen((value) => !value)}>
        <Symbol name="search" size={14} />
        <span className="agent-step-title">{toolTitle(step.name)}</span>
        {hint ? <span className="agent-step-hint">{hint}</span> : null}
        {step.ok === false ? <span className="agent-step-fail">失败</span> : null}
        <Symbol name={open ? 'chevron-down' : 'chevron-right'} size={14} />
      </button>
      {open ? <pre className="agent-step-panel">{detail}</pre> : null}
    </div>
  );
}
