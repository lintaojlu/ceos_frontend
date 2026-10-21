export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
  }

  /** @param {string} event @param {Function} handler */
  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /** @param {string} event @param {Function} handler */
  off(event, handler) {
    const set = this.listeners.get(event);
    if (set) set.delete(handler);
  }

  /** @param {string} event @param {any} [payload] */
  emit(event, payload) {
    const set = this.listeners.get(event);
    if (!set) return;
    set.forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.error(`[EventBus] ${event}`, e);
      }
    });
  }
}

export const Events = {
  DATE_CHANGED: 'date:changed',
  TASK_COMPLETED: 'task:completed',
  TASK_MOVED: 'task:moved',
  TASKS_UPDATED: 'tasks:updated',
  IDEAS_UPDATED: 'ideas:updated',
  REFLECTION_UPDATED: 'reflection:updated',
  INSIGHTS_UPDATED: 'insights:updated',
  LLM_SETTINGS_UPDATED: 'llm-settings:updated',
  UI_PREFS_UPDATED: 'ui-prefs:updated',
  POMODORO_UPDATED: 'pomodoro:updated',
  AGENT_UPDATED: 'agent:updated',
  AGENT_COMPOSER_DRAFT: 'agent:composer-draft'
};
