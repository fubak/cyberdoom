import { drawText, glyphRows, measureText } from './font';

/**
 * LOOK: Doom-style title + main menu, rendered entirely at 320x200 into a
 * pixelated canvas: extruded pixel-art CYBERDOOM logo, a "firewall" of
 * procedural fire, falling hex code, bitmap-font menu entries and a blinking
 * malware-skull cursor.
 */
const W = 320;
const H = 200;

const LOGO_RAMP = ['#fff4b0', '#ffe060', '#ffc030', '#ff9a18', '#f06a10', '#d8400c', '#b02008', '#801406'];

function paintLogo(g: CanvasRenderingContext2D, text: string, x0: number, y0: number, px: number): void {
  const adv = 6 * px;
  const pass = (fn: (cx: number, cy: number, ry: number, rx: number) => void) => {
    let cx = x0;
    for (const ch of text) {
      const rows = glyphRows(ch);
      rows?.forEach((bits, ry) => {
        for (let rx = 0; rx < 5; rx++) if (bits & (1 << (4 - rx))) fn(cx + rx * px, y0 + ry * px, ry, rx);
      });
      cx += adv;
    }
  };
  // extrusion (down-right), dark outline, then bevelled face blocks
  for (let d = 4; d >= 1; d--) pass((x, y) => ((g.fillStyle = d > 2 ? '#1a0604' : '#3a0c06'), g.fillRect(x + d, y + d, px, px)));
  pass((x, y) => ((g.fillStyle = '#000'), g.fillRect(x - 1, y - 1, px + 2, px + 2)));
  pass((x, y, ry) => {
    for (let k = 0; k < px; k++) {
      const t = (ry * px + k) / (7 * px);
      g.fillStyle = LOGO_RAMP[Math.min(LOGO_RAMP.length - 1, Math.floor(t * LOGO_RAMP.length))];
      g.fillRect(x, y + k, px, 1);
    }
    g.fillStyle = 'rgba(255,255,230,0.55)';
    g.fillRect(x, y, px, 1);
    g.fillRect(x, y, 1, px);
    g.fillStyle = 'rgba(40,0,0,0.45)';
    g.fillRect(x, y + px - 1, px, 1);
    g.fillRect(x + px - 1, y, 1, px);
  });
}

const SKULL = [
  '..XXXXXX..',
  '.XXXXXXXX.',
  'XXXXXXXXXX',
  'XX..XX..XX',
  'XX..XX..XX',
  'XXXXXXXXXX',
  '.XXX..XXX.',
  '..XXXXXX..',
  '..X.X.X.X.',
  '..XXXXXX..',
];

function drawSkull(g: CanvasRenderingContext2D, x: number, y: number, lit: boolean): void {
  SKULL.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const c = row[rx];
      if (c === 'X') {
        g.fillStyle = ry < 3 ? '#f4ecd8' : ry < 6 ? '#d8ccb0' : '#a8987a';
        g.fillRect(x + rx, y + ry, 1, 1);
      } else if ((ry === 3 || ry === 4) && rx > 1 && rx < 8 && rx !== 4 && rx !== 5) {
        g.fillStyle = lit ? '#ff2010' : '#3a0804';
        g.fillRect(x + rx, y + ry, 1, 1);
      }
    }
  });
  // circuit traces off the jaw: it's malware
  g.fillStyle = lit ? '#30ff60' : '#106020';
  g.fillRect(x - 3, y + 7, 3, 1);
  g.fillRect(x + 10, y + 7, 3, 1);
  g.fillRect(x - 3, y + 7, 1, 3);
  g.fillRect(x + 12, y + 4, 1, 4);
}

export function mountTitle(host: HTMLElement, onStart: () => void, about: string[]): void {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  c.className = 'title-px';
  host.appendChild(c);
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;

  // classic spreading-fire automaton (bottom rows), 0..36 heat
  const FW = W;
  const FH = 44;
  const fire = new Uint8Array(FW * FH);
  const firePal: string[] = [];
  for (let i = 0; i <= 36; i++) {
    const t = (i / 36) * 0.8;
    const r = Math.min(255, Math.round(t * 3 * 255));
    const gg = Math.max(0, Math.min(255, Math.round((t * 3 - 1) * 255)));
    const b = Math.max(0, Math.min(255, Math.round((t * 3 - 2) * 255)));
    firePal.push(`rgb(${r},${Math.round(gg * 0.85)},${b})`);
  }
  for (let x = 0; x < FW; x++) fire[(FH - 1) * FW + x] = 36;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cols = Array.from({ length: 40 }, (_, i) => ({ x: i * 8 + 2, y: rnd() * H, v: 12 + rnd() * 30 }));

  let sel = 0;
  let showAbout = false;
  const items = [
    { label: 'New Game', action: onStart },
    { label: 'Read This!', action: () => (showAbout = true) },
  ];
  let t = 0;
  let last = performance.now();
  const menuY = 112;
  const rowH = 14;

  const choose = () => {
    if (showAbout) {
      showAbout = false;
      return;
    }
    items[sel].action();
  };
  const onKey = (e: KeyboardEvent) => {
    if (!c.isConnected) return;
    if (['ArrowUp', 'KeyW'].includes(e.code)) sel = (sel + items.length - 1) % items.length;
    else if (['ArrowDown', 'KeyS'].includes(e.code)) sel = (sel + 1) % items.length;
    else if (showAbout || ['Enter', 'Space', 'NumpadEnter'].includes(e.code)) choose();
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  const toLogical = (e: MouseEvent) => {
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const hit = (e: MouseEvent) => {
    const [, y] = toLogical(e);
    const i = Math.floor((y - menuY + 3) / rowH);
    return i >= 0 && i < items.length ? i : -1;
  };
  c.addEventListener('mousemove', (e) => {
    const i = hit(e);
    if (i >= 0 && !showAbout) sel = i;
  });
  c.addEventListener('click', (e) => {
    const i = hit(e);
    if (showAbout) showAbout = false;
    else if (i >= 0) {
      sel = i;
      choose();
    }
  });

  const frame = () => {
    if (!c.isConnected) {
      window.removeEventListener('keydown', onKey);
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    // background: deep red-brown vertical ramp
    for (let y = 0; y < H; y += 2) {
      const k = y / H;
      g.fillStyle = `rgb(${Math.round(18 + k * 30)},${Math.round(6 + k * 6)},${Math.round(8 + k * 2)})`;
      g.fillRect(0, y, W, 2);
    }
    // falling hex code
    for (const col of cols) {
      col.y += col.v * dt;
      if (col.y > H + 40) col.y = -rnd() * 60;
      for (let k = 0; k < 6; k++) {
        const ch = '0123456789ABCDEF'[Math.floor((col.x * 13 + k * 7 + Math.floor(t * 3)) % 16)];
        drawText(g, ch, col.x, Math.floor(col.y) - k * 8, k === 0 ? '#4aff7a' : `rgb(10,${Math.max(30, 110 - k * 16)},30)`, 'tiny', null);
      }
    }
    // fire
    for (let x = 0; x < FW; x++) {
      for (let y = 1; y < FH; y++) {
        const src = y * FW + x;
        const p = fire[src];
        const r = Math.floor(rnd() * 3);
        const dst = src - FW - r + 1;
        if (dst >= 0) fire[dst] = Math.max(0, p - (r & 1) - (rnd() < 0.45 ? 1 : 0));
      }
    }
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        const v = fire[y * FW + x];
        if (v < 2) continue;
        g.fillStyle = firePal[v];
        g.fillRect(x, H - FH + y, 1, 1);
      }
    }
    // logo
    const logo = 'CYBERDOOM';
    const px = 5;
    const lw = logo.length * 6 * px - px;
    paintLogo(g, logo, Math.round((W - lw) / 2), 18, px);
    const sub = 'SECURITY+ FIELD TRAINING';
    drawText(g, sub, Math.round((W - measureText(sub)) / 2), 64, '#ffd040', 'small', '#000');
    drawText(g, 'COMPTIA SY0-701', Math.round((W - measureText('COMPTIA SY0-701', 'tiny')) / 2), 75, '#c8a878', 'tiny', '#000');

    if (showAbout) {
      const bw = 292;
      const bh = 14 + about.length * 8;
      const bx = (W - bw) / 2;
      const by = 86;
      g.fillStyle = '#0c0808';
      g.fillRect(bx, by, bw, bh);
      g.fillStyle = '#8a7a60';
      g.fillRect(bx, by, bw, 1);
      g.fillRect(bx, by + bh - 1, bw, 1);
      about.forEach((line, i) => drawText(g, line, bx + 6, by + 6 + i * 8, i === 0 ? '#ffd040' : '#e8e0d0', 'tiny', '#000'));
    } else {
      items.forEach((it, i) => {
        const y = menuY + i * rowH;
        const label = it.label.toUpperCase();
        const x = 112;
        drawText(g, label, x + 1, y + 1, '#300800', 'small', null);
        drawText(g, label, x, y, i === sel ? '#ffe060' : '#d84020', 'small', '#000');
        if (i === sel) drawSkull(g, x - 18, y - 2, Math.floor(t * 4) % 2 === 0);
      });
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
