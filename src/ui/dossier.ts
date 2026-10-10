import type { CallAction, EvidenceEntry } from '../core/types';
import { CALL_PROMPT } from '../content/calls';
import { drawText, measureText } from '../render/font';
import { VIEW_H, VIEW_W } from '../render/renderer';
import { BASE_H, BASE_W, RES } from '../render/res';

export const DOSSIER_TEXT_W = 276;
export const DOSSIER_ROWS = 10;
// Panel bounds in base (320x200) coords: below the top message lines and
// above the 32px status bar (STATUS_H).
export const DOSSIER_X = 12;
export const DOSSIER_Y = 44;
export const DOSSIER_W = 296;
export const DOSSIER_H = 118;
/** Escape always closes, from either mode, so the log is not a second screen. */
export const DOSSIER_HINT = {
  file: '1-4 CALL  A/D PAGE  L LOG  ESC CLOSE',
  log: 'W/S SELECT  ENTER OPEN  ESC CLOSE',
} as const;

/** Case files carrying a "WHAT DO YOU DO?" call get fewer detail rows; the
 * call prompt and its options draw in the freed space above the hint. */
/** Body rows left above the call block (the rest page through with A/D). */
const DOSSIER_CALL_ROWS = 2;

export type DossierMode = 'file' | 'log';

/** Rows-per-page for a case file: call files get less room for detail text. */
export function layoutForEntry(entry: { label: string; detail: string; call?: unknown }) {
  return layoutCaseFile(entry, DOSSIER_TEXT_W, entry.call ? DOSSIER_CALL_ROWS : DOSSIER_ROWS);
}

export function layoutCaseFile(
  entry: { label: string; detail: string },
  maxW = DOSSIER_TEXT_W,
  rows = DOSSIER_ROWS,
): { title: string[]; pages: string[][] } {
  const width = Math.max(1, maxW);
  const rowCount = Math.max(1, Math.floor(rows));
  const wrap = (text: string): string[] => {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (measureText(candidate, 'small') <= width) {
          line = candidate;
          continue;
        }
        if (line) {
          lines.push(line);
          line = '';
        }
        if (measureText(word, 'small') <= width) {
          line = word;
          continue;
        }
        let chunk = '';
        for (const char of word) {
          if (chunk && measureText(chunk + char, 'small') > width) {
            lines.push(chunk);
            chunk = '';
          }
          chunk += char;
        }
        line = chunk;
      }
      lines.push(line);
    }
    return lines.length ? lines : [''];
  };

  const detailLines = wrap(entry.detail);
  const pageCount = Math.max(1, Math.ceil(detailLines.length / rowCount));
  const pages = Array.from({ length: pageCount }, (_, index) =>
    detailLines.slice(index * rowCount, (index + 1) * rowCount),
  );
  return { title: wrap(entry.label), pages };
}

export class Dossier {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private _enabled = false;
  private _isOpen = false;
  private _mode: DossierMode = 'file';
  private fileIndex = 0;
  private selectedIndex = 0;
  private pageIndex = 0;
  private dirty = true;

  constructor(
    private getEntries: () => EvidenceEntry[],
    private onCall?: (entityId: string, action: CallAction) => void,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    this.canvas.className = 'dossier';
    this.g = this.canvas.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('mousedown', this.onMouseDown, true);
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  get mode(): DossierMode {
    return this._mode;
  }

  get page(): number {
    return this.pageIndex + 1;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
    if (!value) this.close();
  }

  show(id: string): void {
    if (!this.enabled) return;
    const index = this.getEntries().findIndex((entry) => entry.id === id);
    if (index < 0) return;
    this.fileIndex = index;
    this.selectedIndex = index;
    this.pageIndex = 0;
    this._mode = 'file';
    this.setOpen(true);
  }

  toggleLog(): void {
    if (!this.enabled) return;
    const entries = this.getEntries();
    if (!this.isOpen) {
      this.selectedIndex = Math.min(this.fileIndex, Math.max(0, entries.length - 1));
      this._mode = 'log';
      this.setOpen(true);
      return;
    }
    if (this.mode === 'file') {
      this.selectedIndex = this.fileIndex;
      this._mode = 'log';
    } else {
      this.fileIndex = Math.min(this.selectedIndex, Math.max(0, entries.length - 1));
      this.pageIndex = 0;
      this._mode = 'file';
    }
    this.dirty = true;
  }

  close(): void {
    this.setOpen(false);
  }

  reset(): void {
    this._mode = 'file';
    this.fileIndex = 0;
    this.selectedIndex = 0;
    this.pageIndex = 0;
    this.close();
  }

  draw(): void {
    if (!this.isOpen || !this.dirty) return;
    this.dirty = false;
    const g = this.g;
    const entries = this.getEntries();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, VIEW_W, VIEW_H);
    g.setTransform(RES, 0, 0, RES, 0, 0);
    g.fillStyle = '#100806';
    g.fillRect(DOSSIER_X, DOSSIER_Y, DOSSIER_W, DOSSIER_H);
    g.fillStyle = '#806050';
    g.fillRect(DOSSIER_X, DOSSIER_Y, DOSSIER_W, 2);
    g.fillRect(DOSSIER_X, DOSSIER_Y, 2, DOSSIER_H);
    g.fillStyle = '#2a100c';
    g.fillRect(DOSSIER_X, DOSSIER_Y + DOSSIER_H, DOSSIER_W, 2);
    g.fillRect(DOSSIER_X + DOSSIER_W - 2, DOSSIER_Y, 2, DOSSIER_H);
    g.fillStyle = '#5a1b14';
    g.fillRect(DOSSIER_X + 4, DOSSIER_Y + 4, DOSSIER_W - 8, 16);
    g.fillStyle = '#c04428';
    g.fillRect(DOSSIER_X + 4, DOSSIER_Y + 4, DOSSIER_W - 8, 2);
    drawText(
      g,
      this.mode === 'log' ? 'CASE FILE LOG' : `CASE FILE ${entries.length ? this.fileIndex + 1 : 0}/${entries.length}`,
      DOSSIER_X + 9,
      DOSSIER_Y + 9,
      '#fff0c0',
    );

    this.callHits = [];
    if (this.mode === 'log') {
      this.drawLog(entries);
    } else {
      this.drawFile(entries);
    }
    const hint = DOSSIER_HINT[this.mode];
    drawText(g, hint, DOSSIER_X + 9, DOSSIER_Y + DOSSIER_H - 11, '#8a7868', 'small', null);
  }

  private drawFile(entries: EvidenceEntry[]): void {
    const g = this.g;
    const entry = entries[this.fileIndex];
    if (!entry) {
      drawText(g, 'NO EVIDENCE LOGGED', DOSSIER_X + 9, DOSSIER_Y + 28, '#e8d8b0');
      return;
    }
    const layout = layoutForEntry(entry);
    const pageCount = layout.pages.length;
    drawText(g, `PAGE ${this.pageIndex + 1}/${pageCount}`, DOSSIER_X + DOSSIER_W - 77, DOSSIER_Y + 9, '#ffc080');
    let y = DOSSIER_Y + 26;
    for (const line of layout.title) {
      drawText(g, line, 21, y, '#ffd040');
      y += 8;
    }
    y += 4;
    const page = layout.pages[this.pageIndex] ?? [];
    for (const line of page) {
      drawText(g, line, 21, y, '#e8e0d0');
      y += 8;
    }
    if (entry.call) this.drawCall(entry);
  }

  /** Clickable option rows of the open file's call (base 320x200 coords). */
  private callHits: { x: number; y: number; w: number; h: number; index: number }[] = [];

  /** The "WHAT DO YOU DO?" decision block at the bottom of a call file. */
  private drawCall(entry: EvidenceEntry): void {
    const g = this.g;
    const call = entry.call!;
    const hintY = DOSSIER_Y + DOSSIER_H - 11;
    const feedback = call.feedback
      ? layoutCaseFile({ label: '', detail: call.feedback }, DOSSIER_TEXT_W, 99).pages.flat().slice(0, 3)
      : [];
    const optionRows = call.resolved ? 1 : call.options.length;
    const top = hintY - 6 - 8 - optionRows * 8 - (feedback.length ? feedback.length * 8 + 2 : 0);
    // the call sits as an opaque panel over the file body, never interleaved
    g.fillStyle = '#100806';
    g.fillRect(DOSSIER_X + 4, top - 2, DOSSIER_W - 8, hintY - top + 12);
    g.fillStyle = '#806050';
    g.fillRect(DOSSIER_X + 6, top, DOSSIER_W - 12, 1);
    drawText(g, call.resolved ? 'TRIAGE CALL - LOGGED' : CALL_PROMPT, 21, top + 3,
      call.resolved ? '#5ce88a' : '#ffd040');
    let y = top + 12;
    call.options.forEach((option, index) => {
      // once logged, the file keeps only the call that was made
      if (call.resolved && call.picked !== index) return;
      const picked = call.picked === index;
      const color = picked ? (call.resolved ? '#5ce88a' : '#ff7a5a') : '#e8e0d0';
      const mark = picked ? (call.resolved ? '[+]' : '[X]') : `${index + 1}`;
      drawText(g, mark, 21, y, picked ? color : '#ffc080');
      drawText(g, option.text, 21 + (picked ? 20 : 14), y, color);
      if (!call.resolved) this.callHits.push({ x: DOSSIER_X + 6, y: y - 1, w: DOSSIER_W - 12, h: 8, index });
      y += 8;
    });
    for (const line of feedback) {
      drawText(g, line, 21, y + 2, call.resolved ? '#a8d8b0' : '#ffb09a');
      y += 8;
    }
  }

  private pickCall(index: number): void {
    const entry = this.getEntries()[this.fileIndex];
    const call = entry?.call;
    if (!entry || !call || call.resolved || index < 0 || index >= call.options.length) return;
    this.onCall?.(entry.entityId, call.options[index].action);
    this.dirty = true;
  }

  private drawLog(entries: EvidenceEntry[]): void {
    const maxChars = Math.floor(DOSSIER_TEXT_W / 6);
    const visibleRows = Math.floor((DOSSIER_ROWS * 8) / 9);
    const start = Math.max(0, Math.min(this.selectedIndex - visibleRows + 1, entries.length - visibleRows));
    const visible = entries.slice(start, start + visibleRows);
    if (!visible.length) {
      drawText(this.g, 'NO EVIDENCE LOGGED', DOSSIER_X + 9, DOSSIER_Y + 28, '#e8d8b0');
      return;
    }
    visible.forEach((entry, index) => {
      const entryIndex = start + index;
      const selected = entryIndex === this.selectedIndex;
      const label = entry.label.slice(0, maxChars - 3);
      const y = DOSSIER_Y + 26 + index * 9;
      if (selected) {
        this.g.fillStyle = '#3a2114';
        this.g.fillRect(DOSSIER_X + 6, y - 2, DOSSIER_W - 12, 9);
      }
      drawText(this.g, `${selected ? '>' : ' '} ${label}`, DOSSIER_X + 9, y, selected ? '#ffd040' : '#e8e0d0');
    });
  }

  private setOpen(open: boolean): void {
    this._isOpen = open;
    this.canvas.classList.toggle('open', open);
    this.dirty = true;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) return;
    if (event.code === 'KeyL') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) this.toggleLog();
      return;
    }
    if (!this.isOpen || event.key === 'Tab') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;

    const key = event.key.toLowerCase();
    if (event.key === 'Escape') {
      this.close();
    } else if (key === 'arrowleft' || key === 'a') {
      this.previousPage();
    } else if (key === 'arrowright' || key === 'd') {
      if (this.mode === 'log') this.openSelected();
      else this.nextPage();
    } else if (this.mode === 'log' && (key === 'arrowup' || key === 'w')) {
      this.moveSelection(-1);
    } else if (this.mode === 'log' && (key === 'arrowdown' || key === 's')) {
      this.moveSelection(1);
    } else if (this.mode === 'log' && event.key === 'Enter') {
      this.openSelected();
    } else if (this.mode === 'file' && /^[1-4]$/.test(event.key)) {
      this.pickCall(Number(event.key) - 1);
    }
  };

  private onMouseDown = (event: MouseEvent): void => {
    if (!this.enabled || !this.isOpen) return;
    event.preventDefault();
    // With the pointer locked the same click must keep playing: it closes the
    // file AND reaches the game canvas as a fire edge (so "click again to flag"
    // works). Swallow it only when the mouse is free, where it can't fire.
    if (!(document.pointerLockElement && event.button === 0)) event.stopImmediatePropagation();
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * BASE_W;
    const y = ((event.clientY - rect.top) / rect.height) * BASE_H;
    const hit = this.callHits.find((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h);
    if (hit) {
      this.pickCall(hit.index);
      return;
    }
    this.close();
  };

  private previousPage(): void {
    if (this.mode === 'log') return;
    if (this.pageIndex > 0) {
      this.pageIndex--;
    } else if (this.fileIndex > 0) {
      this.fileIndex--;
      this.selectedIndex = this.fileIndex;
      const previous = this.getEntries()[this.fileIndex];
      this.pageIndex = previous ? layoutForEntry(previous).pages.length - 1 : 0;
    }
    this.dirty = true;
  }

  private nextPage(): void {
    if (this.mode === 'log') return;
    const entries = this.getEntries();
    const current = entries[this.fileIndex];
    if (!current) return;
    const pages = layoutForEntry(current).pages;
    if (this.pageIndex + 1 < pages.length) {
      this.pageIndex++;
    } else if (this.fileIndex + 1 < entries.length) {
      this.fileIndex++;
      this.selectedIndex = this.fileIndex;
      this.pageIndex = 0;
    }
    this.dirty = true;
  }

  private moveSelection(delta: number): void {
    const entries = this.getEntries();
    if (!entries.length) return;
    this.selectedIndex = Math.max(0, Math.min(entries.length - 1, this.selectedIndex + delta));
    this.dirty = true;
  }

  private openSelected(): void {
    const entry = this.getEntries()[this.selectedIndex];
    if (!entry) return;
    this.fileIndex = this.selectedIndex;
    this.pageIndex = 0;
    this._mode = 'file';
    this.dirty = true;
  }
}
