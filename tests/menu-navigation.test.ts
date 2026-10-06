/** @vitest-environment happy-dom */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { missionRegistry } from '../src/content/missions';
import { briefing, onKeysWhileMounted } from '../src/ui/briefing';
import { missionSelect } from '../src/ui/screens';
import { pauseMenu } from '../src/ui/pause';

describe('menu back navigation', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="viewport"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('briefing Esc on the summary returns via onBack', () => {
    vi.useFakeTimers();
    const mission = missionRegistry.require('m01');
    const onBack = vi.fn();
    const node = briefing(mission, vi.fn(), onBack);
    document.body.appendChild(node);
    vi.advanceTimersByTime(300);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('briefing Esc on details closes details instead of leaving', () => {
    vi.useFakeTimers();
    const mission = missionRegistry.require('m01');
    const onBack = vi.fn();
    const node = briefing(mission, vi.fn(), onBack);
    document.body.appendChild(node);
    vi.advanceTimersByTime(300);
    const detailsBtn = [...node.querySelectorAll('button')].find((b) => b.textContent?.includes('DETAILS'));
    detailsBtn?.click();
    expect(node.textContent).toContain('ALL ORDERS');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onBack).not.toHaveBeenCalled();
    expect(node.textContent).not.toContain('ALL ORDERS');
  });

  it('mission select Esc calls onBack', () => {
    vi.useFakeTimers();
    const onBack = vi.fn();
    const node = missionSelect(vi.fn(), onBack);
    document.body.appendChild(node);
    vi.advanceTimersByTime(300);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('pause menu wires resume and abort actions', () => {
    vi.useFakeTimers();
    const onResume = vi.fn();
    const onMissionSelect = vi.fn();
    const onTitle = vi.fn();
    const node = pauseMenu({ onResume, onMissionSelect, onTitle });
    document.body.appendChild(node);
    vi.advanceTimersByTime(300);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onResume).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', bubbles: true }));
    expect(onMissionSelect).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', bubbles: true }));
    expect(onTitle).toHaveBeenCalledTimes(1);
  });

  it('onKeysWhileMounted detaches when the node is removed', () => {
    vi.useFakeTimers();
    const node = document.createElement('div');
    document.body.appendChild(node);
    const fn = vi.fn();
    onKeysWhileMounted(node, fn);
    vi.advanceTimersByTime(300);
    node.remove();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(fn).not.toHaveBeenCalled();
  });
});
