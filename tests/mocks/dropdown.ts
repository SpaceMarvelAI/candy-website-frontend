/**
 * Test helper for src/pages/crm/ui.tsx's `Select` (a button + listbox popup, not a native
 * <select> — see that file for why: an open <select> popup can't be restyled cross-browser).
 * Both the trigger button and each option button carry `data-value` for exactly this purpose.
 */
import userEvent from '@testing-library/user-event';

/** The currently selected value — no need to open the dropdown. */
export function getValue(trigger: HTMLElement): string {
  return trigger.dataset.value ?? '';
}

/** Opens the dropdown, clicks the option with this value (which closes it), same as picking
 * an option in the old native <select> via userEvent.selectOptions. */
export async function selectValue(trigger: HTMLElement, value: string): Promise<void> {
  await userEvent.click(trigger);
  const option = document.querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`);
  if (!option) throw new Error(`No option with value "${value}" found — is the dropdown open?`);
  await userEvent.click(option);
}

/** Every option's value, in DOM order. Opens the dropdown to read it, then closes it again
 * (via the trigger, not an option, so nothing gets selected as a side effect). */
export async function getOptionValues(trigger: HTMLElement): Promise<string[]> {
  await userEvent.click(trigger);
  const values = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).map((o) => o.dataset.value ?? '');
  await userEvent.click(trigger);
  return values;
}

/** Every option's visible label text, in DOM order. Same open/close handling as getOptionValues. */
export async function getOptionLabels(trigger: HTMLElement): Promise<string[]> {
  await userEvent.click(trigger);
  const labels = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).map((o) => o.textContent ?? '');
  await userEvent.click(trigger);
  return labels;
}
