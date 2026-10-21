/**
 * ask_choices 工具参数与用户回答的整理。只做纯函数，不碰存储。
 */

/**
 * @param {any} raw
 * @returns {{ ok: true, questions: Array<{ id: string, prompt: string, options: Array<{ id: string, label: string }>, allowOther: boolean }> } | { ok: false, error: string }}
 */
export function normalizeAskChoices(raw) {
  const list = Array.isArray(raw?.questions) ? raw.questions : [];
  if (!list.length) return { ok: false, error: '至少要有一道题' };
  /** @type {Array<{ id: string, prompt: string, options: Array<{ id: string, label: string }>, allowOther: boolean }>} */
  const questions = [];
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index] || {};
    const prompt = String(item.prompt || item.question || '').trim();
    if (!prompt) return { ok: false, error: `第 ${index + 1} 题没有题干` };
    const options = (Array.isArray(item.options) ? item.options : [])
      .map((option, optionIndex) => ({
        id: String(option?.id || `opt-${optionIndex + 1}`).trim(),
        label: String(option?.label || option?.text || '').trim()
      }))
      .filter((option) => option.label);
    if (!options.length) return { ok: false, error: `第 ${index + 1} 题没有选项` };
    questions.push({
      id: String(item.id || `q-${index + 1}`).trim(),
      prompt,
      options,
      allowOther: item.allowOther !== false
    });
  }
  return { ok: true, questions };
}

/**
 * @param {Array<{ id: string, prompt: string, options: Array<{ id: string, label: string }>, allowOther: boolean }>} questions
 * @param {Array<{ questionId: string, skipped?: boolean, optionId?: string, optionLabel?: string, otherText?: string }>} answers
 * @returns {string}
 */
export function formatChoiceAnswers(questions, answers) {
  const byId = new Map((answers || []).map((item) => [item.questionId, item]));
  const lines = ['用户回答了选择题：'];
  (questions || []).forEach((question, index) => {
    const answer = byId.get(question.id);
    const head = `${index + 1}. ${question.prompt}`;
    if (!answer || answer.skipped) {
      lines.push(`${head}\n跳过`);
      return;
    }
    if (answer.otherText) {
      lines.push(`${head}\n其他：${String(answer.otherText).trim()}`);
      return;
    }
    const label = answer.optionLabel
      || question.options.find((option) => option.id === answer.optionId)?.label
      || answer.optionId
      || '';
    lines.push(`${head}\n${label}`);
  });
  return lines.join('\n\n');
}

export const CHOICE_CLOSED_MESSAGE = '用户关闭了追问';
