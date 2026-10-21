/**
 * 从任务行飞一张文字卡到 agent 输入框。
 * @param {DOMRect} from
 * @param {string} text
 * @returns {Promise<void>}
 */
export function flyTextToComposer(from, text) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve();
      return;
    }
    const target = document.querySelector('[data-agent-composer="input"]');
    const to = target?.getBoundingClientRect();
    if (!from || !to) {
      resolve();
      return;
    }
    const card = document.createElement('div');
    card.className = 'agent-fly-card';
    card.textContent = String(text || '');
    const width = Math.min(280, Math.max(160, from.width));
    card.style.width = `${width}px`;
    card.style.left = `${from.left + (from.width - width) / 2}px`;
    card.style.top = `${from.top}px`;
    document.body.appendChild(card);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    requestAnimationFrame(() => {
      card.style.transform = `translate(${dx}px, ${dy}px) scale(0.86)`;
      card.style.opacity = '0.15';
    });
    window.setTimeout(() => {
      card.remove();
      resolve();
    }, 420);
  });
}
