import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Events } from '../../../application/event-bus.js';
import { normalizeNotes } from '../../../domain/schedule/daily-task.js';
import { displayTagColor } from '../../../domain/schedule/fixed-tags.js';
import { AI_TASK_TITLE, HUMAN_TASK_TITLE, noteBody, noteTitle } from '../../../domain/schedule/task-breakdown.js';
import { todayKey } from '../../../domain/shared/date-key.js';
import { useApp } from '../../app/context.jsx';
import { flyTextToComposer } from '../../agent/fly-to-composer.js';
import { Checkbox, ContextMenu, Symbol } from '../../library/index.js';
import { TaskText } from './TaskText.jsx';

function NoteCard({ note, onFocus }) {
  const textRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [copied, setCopied] = useState(false);
  const aiTask = noteTitle(note.text) === AI_TASK_TITLE;
  const humanTask = noteTitle(note.text) === HUMAN_TASK_TITLE;

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return undefined;
    const measure = () => setTruncated(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [note.text, expanded]);

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(noteBody(note.text));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={expanded ? 'note-card is-open' : 'note-card'}>
      <div className="note-card-body">
        <p ref={textRef} className="note-card-text">{note.text}</p>
        {truncated || expanded ? (
          <button
            type="button"
            className={expanded ? 'note-expand is-open' : 'note-expand'}
            aria-label={expanded ? '收起说明' : '展开说明'}
            onClick={() => setExpanded((value) => !value)}
          >
            <Symbol name="expand" size={14} />
          </button>
        ) : null}
      </div>
      {aiTask || (humanTask && onFocus) ? (
        <div className="note-card-actions">
          {humanTask && onFocus ? (
            <button type="button" className="icon-button" aria-label="专注" onClick={onFocus}>
              <Symbol name="clock" size={14} />
            </button>
          ) : null}
          {aiTask ? (
            <button type="button" className="icon-button" aria-label={copied ? '已复制' : '复制'} onClick={copyBody}>
              <Symbol name={copied ? 'check' : 'copy'} size={14} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TaskRow({ task, type, onEdit, dropEdge, dragging = false, onReorderStart }) {
  const app = useApp();
  const drag = useRef(false);
  const rowRef = useRef(null);
  const [breaking, setBreaking] = useState(false);
  const [breakError, setBreakError] = useState('');
  const [tagState, setTagState] = useState('');
  const [standardState, setStandardState] = useState('');
  const [menu, setMenu] = useState(null);
  const notes = normalizeNotes(task.notes, { note: task.note, subtasks: task.subtasks });
  const recurrence = task.recurrence === 'daily' ? '每日' : task.recurrence === 'weekdays' ? '工作日' : '';
  const edge = dropEdge === 'before' ? ' is-drop-before' : dropEdge === 'after' ? ' is-drop-after' : '';
  const viewingToday = app.scheduleService.getDateKey() === todayKey();
  const owned = new Set(task.tagIds || []);
  const tags = (app.scheduleService.workspace.tags || []).filter((item) => owned.has(item.id));

  function focus() {
    app.pomodoroService.focusTask(type, task.id);
  }

  async function breakdown() {
    if (breaking) return;
    setBreaking(true);
    setBreakError('');
    try {
      const draft = app.taskBreakdownService.prepareComposer(type, task.id);
      const from = rowRef.current?.getBoundingClientRect();
      if (from) await flyTextToComposer(from, draft.flyText);
      app.eventBus.emit(Events.AGENT_COMPOSER_DRAFT, draft);
    } catch (error) {
      setBreakError(error?.message || '拆解失败');
    } finally {
      setBreaking(false);
    }
  }

  async function standardize() {
    if (standardState === 'pending') return;
    setStandardState('pending');
    try {
      await app.taskStandardizeService.standardize(type, task.id);
      setStandardState('');
    } catch (error) {
      setStandardState(error?.message || '标准化失败');
    }
  }

  async function createTag() {
    if (tagState === 'pending') return;
    setTagState('pending');
    try {
      await app.taskTagService.createForTask(type, task.id);
      setTagState('');
    } catch (error) {
      setTagState(error?.message || '分类失败');
    }
  }

  const canFocus = viewingToday && !task.completed;

  return (
    <div className={`task-block${edge}${dragging ? ' is-dragging' : ''}`}>
      <div
        ref={rowRef}
        className="task-row is-reorderable"
        data-task-id={task.id}
        data-task-type={type}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          if (event.target.closest('button, input, textarea, a, label, select')) return;
          const startX = event.clientX;
          const startY = event.clientY;
          drag.current = false;
          const move = (moveEvent) => {
            if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) >= 6) drag.current = true;
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
          onReorderStart?.(event, type, task.id);
        }}
        onDoubleClick={(event) => {
          if (drag.current) return;
          if (event.target.closest('button, input, textarea, a, label, select')) return;
          onEdit(type, task.id);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        <Checkbox checked={task.completed} onChange={() => app.scheduleService.toggleTask(type, task.id)} />
        <div className="task-main" title="双击编辑">
          <div className="task-line">
            {tags.map((tag) => <span key={tag.id} className="tag-dot" style={{ background: displayTagColor(tag) }} />)}
            <TaskText text={task.text || ''} done={task.completed} />
            {recurrence ? <span className="chip">{recurrence}</span> : null}
          </div>
        </div>
        {breaking ? (
          <span
            className="task-break-spin"
            role="status"
            aria-label="正在拆解"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          />
        ) : null}
      </div>
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { id: 'edit', label: '编辑', onSelect: () => onEdit(type, task.id) },
            { id: 'focus', label: '专注', disabled: !canFocus, onSelect: focus },
            { id: 'breakdown', label: '拆解', disabled: !canFocus || breaking, onSelect: breakdown },
            { id: 'standardize', label: '标准化', disabled: standardState === 'pending', onSelect: standardize },
            { id: 'tag', label: '分类', disabled: tagState === 'pending', onSelect: createTag }
          ]}
        />
      ) : null}
      {notes.length || breakError || tagState || standardState ? (
        <div className="note-stack">
          {standardState === 'pending' ? <p className="task-tag-status" role="status">正在标准化…</p> : null}
          {standardState && standardState !== 'pending' ? <p className="task-break-error">{standardState}</p> : null}
          {tagState === 'pending' ? <p className="task-tag-status" role="status">正在分类…</p> : null}
          {tagState && tagState !== 'pending' ? <p className="task-break-error">{tagState}</p> : null}
          {breakError ? <p className="task-break-error">{breakError}</p> : null}
          {notes.length ? (
            <div className="note-cards">
              {notes.map((note) => <NoteCard key={note.id} note={note} onFocus={canFocus ? focus : null} />)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
