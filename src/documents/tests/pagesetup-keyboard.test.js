// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openPageSetup } from '../src/ui/pagesetup.js';
import { closeAllModals } from '../src/ui/modal.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
});
afterEach(() => {
  closeAllModals(); vi.runAllTimers(); vi.useRealTimers();
  document.body.replaceChildren(); vi.unstubAllGlobals();
});

it.each([
  ['方向', '横向'], ['单位', '厘米'], ['垂直对齐方式', '居中对齐'],
])('supports arrow selection and one tab stop for %s', async (label, next) => {
  const onApply = vi.fn(async () => null);
  const pending = openPageSetup({ current: { width: 8.5, height: 11, margins: { top: 1, bottom: 1, left: 1, right: 1 } }, onApply });
  const group = [...document.querySelectorAll('[role="radiogroup"]')].find((node) =>
    (node.getAttribute('aria-label') || document.getElementById(node.getAttribute('aria-labelledby'))?.textContent) === label);
  const buttons = [...group.querySelectorAll('[role="radio"]')];
  const selected = group.querySelector('[aria-checked="true"]');
  selected.focus();
  selected.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  expect(document.activeElement.textContent).toBe(next);
  expect(group.querySelector('[aria-checked="true"]')).toBe(document.activeElement);
  expect(buttons.filter((button) => button.tabIndex === 0)).toEqual([document.activeElement]);
  document.querySelector('form').requestSubmit();
  const result = await pending;
  if (label === '方向') expect(result.pageSetup).toMatchObject({ width: 11, height: 8.5, orientation: 'landscape' });
  if (label === '单位') expect(result.margins).toEqual({ top: 1, bottom: 1, left: 1, right: 1 });
  if (label === '垂直对齐方式') expect(result.verticalAlign).toBe('center');
  expect(onApply).toHaveBeenCalledOnce();
});

it('restores the entered settings and controls after an apply callback rejects', async () => {
  const onApply = vi.fn().mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValue(null);
  const result = openPageSetup({ current: { width: 8.5, height: 11 }, onApply });
  const form = document.querySelector('form');
  const margin = form.querySelector('[aria-label="左边距"]');
  margin.value = '0.75';
  form.requestSubmit();
  await vi.advanceTimersByTimeAsync(0);
  expect(form.querySelector('[role="alert"]').textContent).toBe('Connection lost');
  expect(form.getAttribute('aria-busy')).toBe('false');
  expect(margin.disabled).toBe(false);
  expect(margin.value).toBe('0.75');
  form.requestSubmit();
  await expect(result).resolves.toMatchObject({ margins: { left: 0.75 } });
  expect(onApply).toHaveBeenCalledTimes(2);
});

it.each(['resolved', 'rejected'])('aborts a pending apply and ignores its late %s result after closing', async (outcome) => {
  let finish;
  const onApply = vi.fn(() => new Promise((resolve, reject) => { finish = outcome === 'resolved' ? resolve : reject; }));
  const result = openPageSetup({ current: { width: 8.5, height: 11 }, onApply });
  const form = document.querySelector('form');
  form.requestSubmit(); await vi.advanceTimersByTimeAsync(0);
  const signal = onApply.mock.calls[0][1].signal;
  closeAllModals();
  await expect(result).resolves.toBeNull();
  expect(signal.aborted).toBe(true);
  finish(new Error('Late error')); await vi.advanceTimersByTimeAsync(0);
  expect(form.querySelector('[role="alert"]').hidden).toBe(true);
  form.requestSubmit();
  expect(onApply).toHaveBeenCalledOnce();
});
