import type { EvidenceEntry } from '../core/types';
import { drawText, measureText } from '../render/font';
import { VIEW_H, VIEW_W } from '../render/renderer';

export const DOSSIER_TEXT_W = 276;
export const DOSSIER_ROWS = 12;

export type DossierMode = 'file' | 'log';

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

  constructor(private getEntries: () => EvidenceEntry[]) {
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
    g.clearRect(0, 0, VIEW_W, VIEW_H);
    g.fillStyle = '#100806';
    g.fillRect(12, 12, 296, 176);
    g.fillStyle = '#806050';
    g.fillRect(12, 12, 296, 2);
    g.fillRect(12, 12, 2, 176);
    g.fillStyle = '#2a100c';
    g.fillRect(12, 186, 296, 2);
    g.fillRect(306, 12, 2, 176);
    g.fillStyle = '#5a1b14';
    g.fillRect(16, 16, 288, 16);
    g.fillStyle = '#c04428';
    g.fillRect(16, 16, 288, 2);
    drawText(
      g,
      this.mode === 'log' ? 'CASE FILE LOG' : `CASE FILE ${entries.length ? this.fileIndex + 1 : 0}/${entries.length}`,
      21,
      21,
      '#fff0c0',
    );

    if (this.mode === 'log') {
      this.drawLog(entries);
    } else {
      this.drawFile(entries);
    }
    const hint = this.mode === 'log' ? 'W/S SELECT  ENTER OPEN  ESC BACK' : 'A/D PAGE  L LOG  ESC CLOSE';
    drawText(g, hint, 21, 177, '#8a7868', 'small', null);
  }

  private drawFile(entries: EvidenceEntry[]): void {
    const g = this.g;
    const entry = entries[this.fileIndex];
    if (!entry) {
      drawText(g, 'NO EVIDENCE LOGGED', 21, 44, '#e8d8b0');
      return;
    }
    const layout = layoutCaseFile(entry);
    const pageCount = layout.pages.length;
    drawText(g, `PAGE ${this.pageIndex + 1}/${pageCount}`, 231, 21, '#ffc080');
    let y = 40;
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
  }

  private drawLog(entries: EvidenceEntry[]): void {
    const maxChars = Math.floor(DOSSIER_TEXT_W / 6);
    const visibleRows = Math.floor((DOSSIER_ROWS * 8) / 9);
    const start = Math.max(0, Math.min(this.selectedIndex - visibleRows + 1, entries.length - visibleRows));
    const visible = entries.slice(start, start + visibleRows);
    if (!visible.length) {
      drawText(this.g, 'NO EVIDENCE LOGGED', 21, 44, '#e8d8b0');
      return;
    }
    visible.forEach((entry, index) => {
      const entryIndex = start + index;
      const selected = entryIndex === this.selectedIndex;
      const label = entry.label.slice(0, maxChars - 3);
      const y = 43 + index * 9;
      if (selected) {
        this.g.fillStyle = '#3a2114';
        this.g.fillRect(18, y - 2, 284, 9);
      }
      drawText(this.g, `${selected ? '>' : ' '} ${label}`, 21, y, selected ? '#ffd040' : '#e8e0d0');
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
      if (this.mode === 'log') this.toggleLog();
      else this.close();
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
    }
  };

  private onMouseDown = (event: MouseEvent): void => {
    if (!this.enabled || !this.isOpen) return;
    event.preventDefault();
    event.stopImmediatePropagation();
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
      this.pageIndex = previous ? layoutCaseFile(previous).pages.length - 1 : 0;
    }
    this.dirty = true;
  }

  private nextPage(): void {
    if (this.mode === 'log') return;
    const entries = this.getEntries();
    const current = entries[this.fileIndex];
    if (!current) return;
    const pages = layoutCaseFile(current).pages;
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
