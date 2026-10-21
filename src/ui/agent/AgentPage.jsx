import React, { useEffect, useRef, useState } from 'react';
import { useApp, useShell } from '../app/context.jsx';
import { AgentTranscript } from './AgentTranscript.jsx';
import { useStickToBottom } from './use-stick-to-bottom.js';

export function AgentPage() {
  const app = useApp();
  const shell = useShell();
  void shell.revision;
  const threads = app.agentThreads;
  const view = threads.view();
  const tags = app.scheduleService.workspace.tags || [];
  const [error, setError] = useState('');
  const logRef = useRef(null);
  const tail = view.messages[view.messages.length - 1];
  useStickToBottom(logRef, `${tail?.text || ''}:${(tail?.events || []).length}:${view.phase}:${view.arranging}:${view.rows.length}`);

  useEffect(() => {
    setError('');
  }, [view.id]);

  return (
    <div className="agent-page">
      <div className="agent-page-log" ref={logRef}>
        <div className="agent-page-column">
        <AgentTranscript
          layout="page"
          messages={view.messages}
          rows={view.rows}
          tags={tags}
          busy={view.busy}
          arranging={view.arranging}
          phase={view.phase}
          pendingChoice={view.pendingChoice}
          onAnswerChoice={async (answers) => {
            setError('');
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
      </div>
    </div>
  );
}
