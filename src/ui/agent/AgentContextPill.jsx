import React, { useEffect, useRef } from 'react';
import { contextSummary } from '../../domain/schedule/task-breakdown.js';
import { Symbol } from '../library/index.js';

/**
 * 上下文胶囊：收起时一行摘要，点开展开全文。
 * @param {object} props
 * @param {string} props.text
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {(text: string) => void} [props.onChange]
 * @param {() => void} [props.onRemove]
 * @param {boolean} [props.editable]
 */
export function AgentContextPill({ text, open, onOpenChange, onChange, onRemove, editable = false }) {
  const editorRef = useRef(null);
  const value = String(text || '');

  useEffect(() => {
    if (!open || !editable || !editorRef.current) return;
    editorRef.current.style.height = 'auto';
    editorRef.current.style.height = `${Math.min(editorRef.current.scrollHeight, 220)}px`;
  }, [open, editable, value]);

  if (!value.trim()) return null;

  return (
    <div className={open ? 'agent-context-block is-open' : 'agent-context-block'}>
      <div className="agent-context-pill-row">
        <button
          type="button"
          className="agent-context-pill"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          <Symbol name="file" size={12} />
          <span>{open ? '上下文' : contextSummary(value, 28)}</span>
        </button>
        {onRemove ? (
          <button type="button" className="agent-chip-remove" aria-label="去掉上下文" onClick={onRemove}>
            <Symbol name="close" size={10} />
          </button>
        ) : null}
      </div>
      {open ? (
        editable ? (
          <textarea
            ref={editorRef}
            className="agent-context-editor"
            value={value}
            aria-label="上下文"
            onChange={(event) => onChange?.(event.target.value)}
          />
        ) : (
          <pre className="agent-context-full">{value}</pre>
        )
      ) : null}
    </div>
  );
}
