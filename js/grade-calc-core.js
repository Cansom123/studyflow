// Pure "what do I need on the final" calculator used by the Settings grade calculator.
// Takes the three raw inputs and returns everything the DOM layer needs to render --
// no DOM reads/writes here, so this is fully testable without a document.
export function calculateNeededGrade(current, weightPercent, target) {
  const weight = weightPercent / 100;
  if (isNaN(current) || isNaN(weight) || isNaN(target) || weight <= 0) {
    return { visible: false };
  }

  const needed = (target - (1 - weight) * current) / weight;

  if (needed < 0) {
    return {
      visible: true, needed, category: 'secured',
      background: 'var(--connected-bg)',
      labelColor: 'var(--connected-color)', scoreColor: 'var(--connected-color)', msgColor: 'var(--connected-color)',
      label: 'Already secured', score: '🎉',
      msg: "You've already hit your target - even a 0% on the final keeps you there.",
    };
  }
  if (needed > 100) {
    return {
      visible: true, needed, category: 'impossible',
      background: 'var(--error-bg)',
      labelColor: 'var(--error-color)', scoreColor: 'var(--error-color)', msgColor: 'var(--error-color)',
      label: 'Not possible', score: `${needed.toFixed(1)}%`,
      msg: "Even a perfect score won't get you there. Aim as high as you can.",
    };
  }
  if (needed >= 90) {
    return {
      visible: true, needed, category: 'hard',
      background: 'var(--ai-bg)',
      labelColor: 'var(--ai-label)', scoreColor: 'var(--ai-label)', msgColor: 'var(--ai-text)',
      label: 'You need', score: `${needed.toFixed(1)}%`,
      msg: "Challenging - you'll need to bring your A-game.",
    };
  }
  return {
    visible: true, needed, category: 'normal',
    background: 'var(--connected-bg)',
    labelColor: 'var(--connected-color)', scoreColor: 'var(--connected-color)', msgColor: 'var(--connected-color)',
    label: 'You need', score: `${needed.toFixed(1)}%`,
    msg: needed < 60 ? "You're in great shape - very achievable." : "Totally doable. You've got this.",
  };
}
