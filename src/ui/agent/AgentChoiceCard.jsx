import React, { useState } from 'react';
import { Symbol } from '../library/index.js';
import { holdImeEnter, imeCompositionProps, useImeEnterGuard } from '../keyboard/ime-enter.js';

/**
 * @param {object} props
 * @param {Array<{ id: string, prompt: string, options: Array<{ id: string, label: string }>, allowOther: boolean }>} props.questions
 * @param {(answers: Array<{ questionId: string, skipped?: boolean, optionId?: string, optionLabel?: string, otherText?: string }> | 'closed') => void} props.onDone
 * @param {boolean} [props.disabled]
 */
export function AgentChoiceCard({ questions, onDone, disabled = false }) {
  const list = Array.isArray(questions) ? questions : [];
  const [index, setIndex] = useState(0);
  /** @type {[{ [id: string]: { skipped?: boolean, optionId?: string, optionLabel?: string, otherText?: string } }, Function]} */
  const [answers, setAnswers] = useState({});
  const [othering, setOthering] = useState(false);
  const [otherDraft, setOtherDraft] = useState('');
  const [hoverId, setHoverId] = useState('');
  const ime = useImeEnterGuard();
  const question = list[index];
  if (!question) return null;
  const total = list.length;
  const answered = answers[question.id];

  function commitAll(nextAnswers) {
    const rows = list.map((item) => {
      const value = nextAnswers[item.id];
      if (!value) return { questionId: item.id, skipped: true };
      return { questionId: item.id, ...value };
    });
    onDone(rows);
  }

  function advance(patch) {
    const nextAnswers = { ...answers, [question.id]: patch };
    setAnswers(nextAnswers);
    setOthering(false);
    setOtherDraft('');
    if (index >= total - 1) {
      commitAll(nextAnswers);
      return;
    }
    setIndex(index + 1);
  }

  function pickOption(option) {
    if (disabled) return;
    advance({ optionId: option.id, optionLabel: option.label });
  }

  function skip() {
    if (disabled) return;
    advance({ skipped: true });
  }

  function submitOther() {
    const text = otherDraft.trim();
    if (!text || disabled) return;
    advance({ otherText: text });
  }

  return (
    <div className="agent-choice-card">
      <div className="agent-choice-head">
        <div className="agent-choice-prompt">{question.prompt}</div>
        <div className="agent-choice-nav">
          {total > 1 ? (
            <>
              <button
                type="button"
                className="agent-choice-page"
                aria-label="上一题"
                disabled={disabled || index <= 0}
                onClick={() => setIndex((value) => Math.max(0, value - 1))}
              >
                <Symbol name="chevron-left" size={14} />
              </button>
              <span className="agent-choice-count">{index + 1}/{total}</span>
              <button
                type="button"
                className="agent-choice-page"
                aria-label="下一题"
                disabled={disabled || index >= total - 1}
                onClick={() => setIndex((value) => Math.min(total - 1, value + 1))}
              >
                <Symbol name="chevron-right" size={14} />
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="agent-choice-close"
            aria-label="关闭追问"
            disabled={disabled}
            onClick={() => onDone('closed')}
          >
            <Symbol name="close" size={14} />
          </button>
        </div>
      </div>
      <div className="agent-choice-list">
        {question.options.map((option, optionIndex) => {
          const selected = answered && !answered.skipped && answered.optionId === option.id;
          const hot = hoverId === option.id || selected;
          return (
            <button
              key={option.id}
              type="button"
              className={hot ? 'agent-choice-option is-hot' : 'agent-choice-option'}
              disabled={disabled}
              onMouseEnter={() => setHoverId(option.id)}
              onMouseLeave={() => setHoverId('')}
              onClick={() => pickOption(option)}
            >
              <span className="agent-choice-index">{optionIndex + 1}</span>
              <span className="agent-choice-label">{option.label}</span>
              {hot ? <span className="agent-choice-arrow" aria-hidden="true">→</span> : null}
            </button>
          );
        })}
        {question.allowOther ? (
          othering ? (
            <div className="agent-choice-other-edit">
              <span className="agent-choice-index" aria-hidden="true">
                <Symbol name="edit" size={12} />
              </span>
              <input
                className="field agent-choice-other-input"
                autoFocus
                placeholder="其他补充…"
                value={otherDraft}
                disabled={disabled}
                {...imeCompositionProps(ime)}
                onChange={(event) => setOtherDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (holdImeEnter(event, ime)) return;
                  if (event.key === 'Escape') {
                    setOthering(false);
                    setOtherDraft('');
                    return;
                  }
                  if (event.key !== 'Enter' || event.shiftKey) return;
                  event.preventDefault();
                  if (ime.shouldIgnoreSubmit()) return;
                  submitOther();
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              className="agent-choice-option"
              disabled={disabled}
              onClick={() => { if (!disabled) setOthering(true); }}
            >
              <span className="agent-choice-index" aria-hidden="true">
                <Symbol name="edit" size={12} />
              </span>
              <span className="agent-choice-label">其他补充…</span>
            </button>
          )
        ) : null}
      </div>
      <div className="agent-choice-foot">
        <button type="button" className="agent-choice-skip" disabled={disabled} onClick={skip}>跳过</button>
      </div>
    </div>
  );
}
