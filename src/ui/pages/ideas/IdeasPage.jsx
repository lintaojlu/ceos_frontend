import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp, useShell } from '../../app/context.jsx';
import { IDEA_LIST_WIDTH, normalizeIdeaListWidth } from '../../../infrastructure/storage/ui-prefs-repository.js';
import { IdeaEditor } from './IdeaEditor.jsx';
import { IdeaListView } from './IdeaListView.jsx';

function clampIdeaListWidth(value) {
  const sidebar = document.querySelector('.sidebar')?.getBoundingClientRect().width || 0;
  const max = Math.max(IDEA_LIST_WIDTH.min, Math.min(IDEA_LIST_WIDTH.max, window.innerWidth - sidebar - 280));
  return Math.min(max, Math.max(IDEA_LIST_WIDTH.min, normalizeIdeaListWidth(value)));
}

export function IdeasPage({ filter, openIdeaId, onOpenIdea }) {
  const app = useApp();
  useShell();
  const [pickupId, setPickupId] = useState(null);
  const preferredWidth = useRef(normalizeIdeaListWidth(app.uiPrefs.get().ideasListWidth));
  const [listWidth, setListWidth] = useState(() => clampIdeaListWidth(preferredWidth.current));
  const selected = openIdeaId ? app.ideaInboxService.find(openIdeaId) : null;

  useLayoutEffect(() => {
    const shell = document.querySelector('.app-shell');
    shell?.style.setProperty('--ideas-list-width', `${listWidth}px`);
    return () => shell?.style.removeProperty('--ideas-list-width');
  }, [listWidth]);

  useEffect(() => {
    function onResize() {
      setListWidth(clampIdeaListWidth(preferredWidth.current));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function beginResize(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = preferredWidth.current;
    document.body.classList.add('is-ideas-list-resizing');

    function move(moveEvent) {
      moveEvent.preventDefault();
      const next = clampIdeaListWidth(startWidth + (moveEvent.clientX - startX));
      preferredWidth.current = next;
      setListWidth(next);
    }

    function up(upEvent) {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.body.classList.remove('is-ideas-list-resizing');
      const next = clampIdeaListWidth(startWidth + (upEvent.clientX - startX));
      preferredWidth.current = next;
      setListWidth(next);
      app.uiPrefs.update({ ideasListWidth: next });
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  useEffect(() => {
    if (!selected?.id) return;
    document.getElementById(`idea-row-${selected.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [selected?.id]);

  const { ready, completed } = app.ideaInboxService.partition();
  const total = ready.length + completed.length;
  const visible = filter === 'done' ? completed.length : filter === 'all' ? total : ready.length;

  let blank = '从左边选择一条灵感。';
  if (total === 0) blank = '还没有灵感。';
  else if (visible === 0) blank = '当前筛选下没有灵感。';

  return (
    <div className="ideas-split">
      <aside className="ideas-list" aria-label="灵感列表">
        <div className="ideas-list-scroll">
          <IdeaListView filter={filter} selectedId={selected ? selected.id : null} onSelect={onOpenIdea} />
        </div>
        <div
          className="ideas-list-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整灵感列表宽度"
          aria-valuemin={IDEA_LIST_WIDTH.min}
          aria-valuemax={IDEA_LIST_WIDTH.max}
          aria-valuenow={listWidth}
          onPointerDown={beginResize}
        />
      </aside>
      <section className="ideas-pane" aria-label="灵感正文">
        {selected ? (
          <IdeaEditor ideaId={selected.id} onPickup={setPickupId} />
        ) : (
          <div className="ideas-blank">
            <p className="empty">{blank}</p>
          </div>
        )}
      </section>
      {pickupId ? <IdeaPickupModal ideaId={pickupId} onClose={() => setPickupId(null)} /> : null}
    </div>
  );
}
