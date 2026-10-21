import React, { useEffect, useRef, useState } from 'react';
import { AppProvider, useApp, useShell } from './context.jsx';
import { navigate, pageFromHash } from './router.js';
import { Sidebar } from './Sidebar.jsx';
import { Icon } from '../library/index.js';
import { SettingsModal } from '../modals/SettingsModal.jsx';
import { PomodoroOverlay } from '../components/PomodoroOverlay.jsx';
import { AgentDock } from '../agent/AgentDock.jsx';
import { AgentPage } from '../agent/AgentPage.jsx';
import { AgentTopBar } from '../agent/AgentTopBar.jsx';
import { HomePage } from '../pages/home/HomePage.jsx';
import { TasksPage } from '../pages/tasks/TasksPage.jsx';
import { TasksTopBar } from '../pages/tasks/TasksTopBar.jsx';
import { IdeasPage } from '../pages/ideas/IdeasPage.jsx';
import { DEFAULT_IDEA_FILTER, IdeaStatusFilter } from '../pages/ideas/IdeaStatusFilter.jsx';
import { msUntilNextHour, quoteForHour } from '../../domain/quotes/quote-library.js';
import { SIDEBAR_WIDTH, normalizeSidebarWidth } from '../../infrastructure/storage/ui-prefs-repository.js';

function clampSidebarWidth(value) {
  const max = Math.max(SIDEBAR_WIDTH.min, Math.min(SIDEBAR_WIDTH.max, window.innerWidth - 320));
  return Math.min(max, Math.max(SIDEBAR_WIDTH.min, normalizeSidebarWidth(value)));
}

const PAGE_TITLE = { tasks: '任务', ideas: '灵感', agent: 'Agent' };

function QuoteTitle() {
  const [quote, setQuote] = useState(() => quoteForHour());

  useEffect(() => {
    let timer = 0;
    function showCurrentHour() {
      setQuote(quoteForHour());
      timer = window.setTimeout(showCurrentHour, msUntilNextHour());
    }
    timer = window.setTimeout(showCurrentHour, msUntilNextHour());
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="topbar-heading is-quote">
      <h1 className="topbar-title" title={quote.text}>{quote.text}</h1>
    </div>
  );
}

function TopBar({ page, sidebarHidden, onToggle, toggleRef, onCreateIdea, ideaFilter, onIdeaFilter }) {
  useShell();
  const title = PAGE_TITLE[page] || '';
  return (
    <header className="topbar" data-tauri-drag-region="deep">
      <div className="sidebar-tools" data-tauri-drag-region="false">
        {sidebarHidden ? null : (
          <div className="sidebar-logo">
            <img src="/logo.svg" alt="" />
          </div>
        )}
        <button
          ref={toggleRef}
          type="button"
          className="sidebar-toggle"
          aria-label={sidebarHidden ? '显示侧边栏' : '隐藏侧边栏'}
          onClick={onToggle}
        >
          <Icon name="sidebar" />
        </button>
      </div>
      {page === 'agent' ? <AgentTopBar /> : (
        <>
          {page === 'home' ? <QuoteTitle /> : title ? (
            <div className="topbar-heading">
              <h1 className="topbar-title">{title}</h1>
              {page === 'ideas' ? (
                <span className="idea-heading-tools">
                  <button type="button" className="idea-compose" aria-label="新建灵感" onClick={onCreateIdea}>
                    <Icon name="compose" />
                  </button>
                  <IdeaStatusFilter value={ideaFilter} onChange={onIdeaFilter} />
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="topbar-actions">
            {page === 'tasks' ? <TasksTopBar /> : null}
          </div>
        </>
      )}
    </header>
  );
}

function Shell() {
  const app = useApp();
  // 订阅界面壳上下文。事件只抬高 revision，页面作为 children 传入，必须读这个上下文才会跟着重绘。
  useShell();
  const [page, setPage] = useState(() => {
    const initial = pageFromHash(window.location.hash) || app.uiPrefs.get().page || 'home';
    if (initial === 'home') app.insightService.refresh();
    return initial;
  });

  useEffect(() => {
    const apply = () => {
      const fromHash = pageFromHash(window.location.hash);
      if (!fromHash) {
        const fallback = app.uiPrefs.get().page || 'home';
        const next = `#/${fallback}`;
        if (window.location.hash !== next) window.location.replace(next);
        setPage(fallback);
        return;
      }
      setPage(fromHash);
      if (app.uiPrefs.get().page !== fromHash) app.uiPrefs.update({ page: fromHash });
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, [app]);

  const focusing = app.pomodoroService.getSnapshot().phase !== 'idle';
  const sidebarHidden = app.uiPrefs.get().sidebarHidden === true;
  const preferredSidebarWidth = useRef(normalizeSidebarWidth(app.uiPrefs.get().sidebarWidth));
  const [sidebarWidth, setSidebarWidth] = useState(() => clampSidebarWidth(preferredSidebarWidth.current));
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const toggleRef = useRef(null);
  const sidebarHiddenRef = useRef(sidebarHidden);
  const [ideaFilter, setIdeaFilter] = useState(DEFAULT_IDEA_FILTER);
  const [openIdeaId, setOpenIdeaId] = useState(null);
  const [ideaFocus, setIdeaFocus] = useState(0);

  function createIdea() {
    const created = app.ideaInboxService.addIdea('');
    if (!created) return null;
    if (ideaFilter === 'done') setIdeaFilter('open');
    setOpenIdeaId(created.id);
    return created;
  }

  function openIdeas() {
    setIdeaFocus((token) => token + 1);
    navigate('ideas');
  }

  const ensuredFocus = useRef(0);
  useEffect(() => {
    if (page !== 'ideas' || !ideaFocus || ensuredFocus.current === ideaFocus) return;
    ensuredFocus.current = ideaFocus;
    if (openIdeaId && app.ideaInboxService.find(openIdeaId)) return;
    createIdea();
  }, [page, ideaFocus]);

  useEffect(() => {
    if (sidebarHiddenRef.current === sidebarHidden) return;
    sidebarHiddenRef.current = sidebarHidden;
    toggleRef.current?.focus();
  }, [sidebarHidden]);

  useEffect(() => {
    function onResize() {
      setViewportWidth(window.innerWidth);
      setSidebarWidth(clampSidebarWidth(preferredSidebarWidth.current));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function toggleSidebar() {
    app.uiPrefs.update({ sidebarHidden: !sidebarHidden });
  }

  function beginSidebarResize(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = preferredSidebarWidth.current;
    document.body.classList.add('is-sidebar-resizing');

    function move(moveEvent) {
      moveEvent.preventDefault();
      const next = clampSidebarWidth(startWidth + (moveEvent.clientX - startX));
      preferredSidebarWidth.current = next;
      setSidebarWidth(next);
    }

    function up(upEvent) {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.body.classList.remove('is-sidebar-resizing');
      const next = clampSidebarWidth(startWidth + (upEvent.clientX - startX));
      preferredSidebarWidth.current = next;
      setSidebarWidth(next);
      app.uiPrefs.update({ sidebarWidth: next });
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  const sidebarCompact = viewportWidth <= 960;
  const shellStyle = !sidebarHidden && !sidebarCompact
    ? { '--sidebar-width': `${sidebarWidth}px` }
    : undefined;

  return (
    <div
      className={['app-shell', sidebarHidden ? 'is-sidebar-hidden' : ''].filter(Boolean).join(' ')}
      style={shellStyle}
    >
      <div className="app-frame" inert={focusing ? true : undefined}>
        <div className="window-drag" data-tauri-drag-region />
        <TopBar
          page={page}
          sidebarHidden={sidebarHidden}
          onToggle={toggleSidebar}
          toggleRef={toggleRef}
          onCreateIdea={createIdea}
          ideaFilter={ideaFilter}
          onIdeaFilter={setIdeaFilter}
        />
        {sidebarHidden ? null : (
          <Sidebar
            page={page}
            onOpenIdeas={openIdeas}
            width={sidebarWidth}
            onResizeStart={beginSidebarResize}
          />
        )}
        <main className="main">
          {page === 'home' ? <HomePage /> : null}
          {page === 'tasks' ? <TasksPage /> : null}
          {page === 'ideas' ? (
            <IdeasPage
              filter={ideaFilter}
              openIdeaId={openIdeaId}
              onOpenIdea={setOpenIdeaId}
            />
          ) : null}
          {page === 'agent' ? <AgentPage /> : null}
        </main>
        <SettingsModal />
        <AgentDock page={page} />
      </div>
      <PomodoroOverlay />
    </div>
  );
}

export function App({ app }) {
  return (
    <AppProvider app={app}>
      <Shell />
    </AppProvider>
  );
}
