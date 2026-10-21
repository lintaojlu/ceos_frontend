import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Events } from '../../application/event-bus.js';
import { mentionCatalog } from '../../domain/agent/transcript.js';
import { useApp, useShell } from '../app/context.jsx';
import { Symbol } from '../library/index.js';
import { navigate } from '../app/router.js';
import { AgentComposer } from './AgentComposer.jsx';
import { AgentTranscript } from './AgentTranscript.jsx';
import { useStickToBottom } from './use-stick-to-bottom.js';

function scrollPageBehind(event) {
  const main = document.querySelector('.app-frame .main');
  if (!main) return;
  main.scrollTop += event.deltaY;
}

export function AgentDock({ page }) {
  const app = useApp();
  const shell = useShell();
  void shell.revision;
  const threads = app.agentThreads;
  const view = threads.view();
  const phase = app.pomodoroService.getSnapshot().phase;
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const fadeRef = useRef(null);
  const sheetRef = useRef(null);
  const panelRef = useRef(null);
  const dockHidden = phase !== 'idle' || page === 'ideas';
  const onAgentPage = page === 'agent';
  const hasWindow = view.messages.length > 0 || view.rows.length > 0 || view.busy || !!view.pendingChoice || !!error;
  const expanded = panelOpen && hasWindow && !onAgentPage;
  const tags = app.scheduleService.workspace.tags || [];
  const world = threads.runtime.world();
  const tail = view.messages[view.messages.length - 1];
  useStickToBottom(panelRef, `${expanded}:${tail?.text || ''}:${(tail?.events || []).length}:${view.phase}:${view.arranging}:${view.rows.length}`);
  const catalog = mentionCatalog({
    tags: world.tags,
    ideas: world.ideas,
    schedule: world.schedule,
    today: world.today
  });

  useLayoutEffect(() => {
    const shellNode = document.querySelector('.app-shell');
    if (!shellNode) return undefined;
    if (dockHidden) {
      shellNode.style.setProperty('--agent-dock-reserve', '0px');
      return undefined;
    }
    const fade = fadeRef.current;
    const sheet = sheetRef.current;
    if (!fade || !sheet) return undefined;
    const apply = () => {
      const height = Math.ceil(fade.getBoundingClientRect().height + sheet.getBoundingClientRect().height);
      shellNode.style.setProperty('--agent-dock-reserve', `${height}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(fade);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [dockHidden, expanded]);

  useEffect(() => {
    if (onAgentPage) setPanelOpen(false);
  }, [onAgentPage]);

  useEffect(() => {
    return app.eventBus.on(Events.AGENT_COMPOSER_DRAFT, () => {
      if (!onAgentPage) setPanelOpen(true);
    });
  }, [app, onAgentPage]);

  useEffect(() => {
    if (!expanded) return undefined;
    function onPointerDown(event) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || sheetRef.current?.contains(target)) return;
      setPanelOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [expanded]);

  if (dockHidden) return null;

  return (
    <div className={expanded ? 'agent-dock is-open' : 'agent-dock'}>
      <div className="agent-fade" ref={fadeRef} aria-hidden="true">
        <div className="agent-fade-blur" />
      </div>
      {expanded ? (
        <div className="agent-panel" ref={panelRef}>
          <button
            type="button"
            className="agent-close"
            aria-label="展开"
            onClick={() => {
              setPanelOpen(false);
              navigate('agent');
            }}
          >
            <Symbol name="open" size={14} />
          </button>
          <AgentTranscript
            messages={view.messages}
            rows={view.rows}
            tags={tags}
            busy={view.busy}
            arranging={view.arranging}
            phase={view.phase}
            pendingChoice={view.pendingChoice}
            onAnswerChoice={async (answers) => {
              setError('');
              setPanelOpen(true);
              const result = await threads.answerChoice(answers);
              if (!result.ok && result.error) setError(result.error);
            }}
            onEdit={(id, patch) => { threads.editRow(id, patch); }}
            onDrop={(id) => { threads.dropRow(id); }}
            onMove={(id, direction) => { threads.moveRow(id, direction); }}
            onConfirm={async () => {
              setError('');
              const result = await threads.confirm();
              if (!result.ok) setError(result.error || '没有写入');
            }}
            onCancel={async () => {
              setError('');
              await threads.cancel();
            }}
          />
          {error ? <p className="agent-error">{error}</p> : null}
        </div>
      ) : null}
      <div className="agent-sheet" ref={sheetRef} onWheel={scrollPageBehind}>
        <AgentComposer
          permission={view.permission}
          model={view.model}
          busy={view.busy}
          catalog={catalog}
          onStop={() => { threads.stop(); }}
          onPermission={(next) => { threads.setPermission(next); }}
          onModel={(next) => { threads.setModel(next); }}
          onFocus={() => {
            if (onAgentPage) return;
            if (view.messages.length || view.rows.length || error) setPanelOpen(true);
          }}
          onSend={async (text, mentions) => {
            setError('');
            if (!onAgentPage) setPanelOpen(true);
            const result = await threads.submit(text, mentions);
            if (!result.ok && result.error) setError(result.error);
          }}
        />
      </div>
    </div>
  );
}
