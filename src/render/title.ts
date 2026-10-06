import type * as THREE from 'three';
import { sortedTools } from '../tools';
import { skinTriple } from '../tools/look';
import { drawChunky, drawText, glyphRows, measureChunky, measureText } from './font';
import { spriteSets } from './sprites';
import { drawToolViewmodel } from './viewmodels';
import { BASE_H, BASE_W, RES, VIEW_H, VIEW_W } from './res';

/**
 * LOOK: Doom-style title + main menu, drawn in 320x200 base units on a 4×
 * pixelated canvas. A full-bleed illustrated title picture (TITLEPIC-style):
 * a server-room corridor in one-point perspective, the three malware families
 * (rendered from the game's own procedural sprites) advancing on the analyst's
 * keyboard, a "firewall" of procedural fire, the extruded CYBERDOOM logo, and a
 * bitmap-font menu with a blinking malware-skull cursor.
 *
 * Automation: every menu entry also has a transparent <button data-menu-item>
 * laid exactly over it (new-game, read-this). Keyboard: Up/Down + Enter.
 */
const W = BASE_W;
const H = BASE_H;
let titleStipple: CanvasPattern | null = null;

function getTitleStipple(g: CanvasRenderingContext2D): CanvasPattern | null {
  if (titleStipple) return titleStipple;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const image = c.getContext('2d')!.createImageData(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4;
    image.data[i + 3] = (x + y) % 2 === 0 ? 140 : 0;
  }
  c.getContext('2d')!.putImageData(image, 0, 0);
  titleStipple = g.createPattern(c, 'repeat');
  titleStipple?.setTransform(new DOMMatrix().scale(1 / RES, 1 / RES));
  return titleStipple;
}

const LOGO_RAMP = ['#fff4b0', '#ffe060', '#ffc030', '#ff9a18', '#f06a10', '#d8400c', '#b02008', '#801406'];

export function paintLogo(g: CanvasRenderingContext2D, text: string, x0: number, y0: number, px: number): void {
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

export function drawSkull(g: CanvasRenderingContext2D, x: number, y: number, lit: boolean): void {
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

/** Sprite texture (DataTexture, Y-flipped, glow alpha 128) → opaque-pixel canvas. */
export function spriteCanvas(setId: string, frame: string): HTMLCanvasElement | null {
  const t: THREE.Texture | undefined = spriteSets.get(setId)?.frames[frame];
  const im = t?.image as { data?: Uint8Array; width: number; height: number } | undefined;
  if (!im?.data) return null;
  const c = document.createElement('canvas');
  c.width = im.width;
  c.height = im.height;
  const id = new ImageData(im.width, im.height);
  for (let y = 0; y < im.height; y++) {
    for (let x = 0; x < im.width; x++) {
      const s = ((im.height - 1 - y) * im.width + x) * 4;
      const d = (y * im.width + x) * 4;
      id.data[d] = im.data[s];
      id.data[d + 1] = im.data[s + 1];
      id.data[d + 2] = im.data[s + 2];
      id.data[d + 3] = im.data[s + 3] ? 255 : 0;
    }
  }
  c.getContext('2d')!.putImageData(id, 0, 0);
  return c;
}

/** Blit a sprite at integer scale with its feet at (cx, footY), plus a floor shadow. */
function blitSprite(g: CanvasRenderingContext2D, c: HTMLCanvasElement | null, cx: number, footY: number, s: number): void {
  if (!c) return;
  // trim transparent bottom rows so feet touch the floor
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let bottom = c.height - 1;
  outer: for (; bottom > 0; bottom--) for (let x = 0; x < c.width; x++) if (d[(bottom * c.width + x) * 4 + 3]) break outer;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath();
  g.ellipse(cx, footY, (c.width / RES) * s * 0.32, 3 * s, 0, 0, Math.PI * 2);
  g.fill();
  g.drawImage(c, Math.round(cx - (c.width / RES * s) / 2), Math.round(footY - ((bottom + 1) / RES) * s), (c.width / RES) * s, (c.height / RES) * s);
}

/** Static TITLEPIC: server-room corridor in one-point perspective + the three threats. */
function paintTitlePic(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = VIEW_H;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  let seed = 4242;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const vx = 160;
  const vy = 96;
  const slope = 0.62;
  const LED = ['#2cff5a', '#ffb010', '#2ca8ff', '#ff3020', '#2cff5a'];
  const img = g.createImageData(VIEW_W, VIEW_H);
  const put = (x: number, y: number, r: number, gg: number, b: number) => {
    const i = (y * VIEW_W + x) * 4;
    img.data[i] = r;
    img.data[i + 1] = gg;
    img.data[i + 2] = b;
    img.data[i + 3] = 255;
  };
  for (let y = 0; y < VIEW_H; y++) {
    for (let x = 0; x < VIEW_W; x++) {
      const bx = x / RES;
      const by = y / RES;
      const dx = bx - vx;
      const dy = by - vy;
      const d = Math.abs(dx);
      const n = (rnd() - 0.5) * 9;
      if (d < 9 && Math.abs(dy) < 9 * slope + 1) {
        // far end: the exit glows red through the smoke
        const k = 1 - Math.hypot(dx, dy * 1.6) / 14;
        put(x, y, 90 + k * 150 + n, 14 + k * 40, 8 + n * 0.3);
      } else if (Math.abs(dy) > d * slope) {
        // floor / ceiling planes
        const z = 60 / Math.max(1, Math.abs(dy));
        const u = dx * z * 0.08;
        const L = Math.min(1, 0.18 + Math.abs(dy) / 110);
        if (dy > 0) {
          const tile = (Math.floor(u) + Math.floor(z * 1.2)) & 1;
          const seam = Math.abs(u - Math.round(u)) < 0.05 * z || Math.abs(z * 1.2 - Math.round(z * 1.2)) < 0.06;
          const b = seam ? 18 : tile ? 66 : 54;
          put(x, y, (b + 10 + n) * L, (b + n) * L, (b - 8 + n) * L);
        } else {
          const lamp = Math.abs(u) < 0.9 && (z * 0.9) % 1 < 0.22;
          if (lamp) put(x, y, 255 * L + 40, 236 * L + 30, 190 * L);
          else {
            const b = ((Math.floor(u * 1.5) + Math.floor(z * 1.6)) & 1) ? 44 : 36;
            put(x, y, (b + n) * L, (b + n) * L, (b + 10 + n) * L);
          }
        }
      } else {
        // server-rack walls; unit seams where 1/depth crosses an integer
        const z = 40 / d;
        const L = Math.min(1, 0.16 + d / 150);
        const unit = Math.floor(z * 4);
        const fu = z * 4 - unit;
        const fv = dy / (d * slope); // -1..1 up the wall
        const rail = fu < 0.12;
        const strip = Math.abs(fv - 0.42) < 0.035;
        let r = 30;
        let gg = 33;
        let b = 42;
        if (rail) [r, gg, b] = [70, 76, 90];
        const row = Math.floor((fv + 1) * 9);
        const rf = (fv + 1) * 9 - row;
        if (!rail && rf < 0.12) [r, gg, b] = [12, 13, 16];
        if (strip) put(x, y, 40, 220 * L + 30, 255 * L);
        else {
          const ledHash = ((unit * 73856093) ^ (row * 19349663)) >>> 0;
          if (!rail && fu > 0.55 && fu < 0.55 + 6 / Math.max(6, 40 / z) && rf > 0.4 && rf < 0.75 && ledHash % 3 === 0) {
            const hex = LED[ledHash % LED.length];
            put(x, y, parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
          } else put(x, y, (r + n) * L, (gg + n) * L, (b + n) * L);
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  g.setTransform(RES, 0, 0, RES, 0, 0);
  // red haze toward the far end
  const haze = g.createRadialGradient(vx, vy, 1, vx, vy, 30);
  haze.addColorStop(0, 'rgba(200,30,10,0.35)');
  haze.addColorStop(1, 'rgba(60,0,0,0)');
  g.fillStyle = haze;
  g.fillRect(0, 0, W, H);
  // the threats, back to front
  blitSprite(g, spriteCanvas('ransomware', 'attack1_0') ?? spriteCanvas('ransomware', 'walk0'), 160, 128, 1);
  blitSprite(g, spriteCanvas('trojan', 'walk1_1') ?? spriteCanvas('trojan', 'walk0'), 250, 188, 2);
  blitSprite(g, spriteCanvas('worm', 'attack1_7') ?? spriteCanvas('worm', 'walk0'), 70, 178, 2);
  // vignette
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const e = Math.min(x, W - 1 - x, y, H - 1 - y);
      if (e < 6 && (x + y) % (e + 2) === 0) {
        g.fillStyle = '#000';
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  return c;
}

export function mountTitle(host: HTMLElement, onStart: () => void, about: string[]): void {
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = VIEW_H;
  c.className = 'title-px';
  host.appendChild(c);
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.setTransform(RES, 0, 0, RES, 0, 0);
  const pic = paintTitlePic();
  const keyboard = sortedTools().find((t) => t.slot === 1);

  // classic spreading-fire automaton along the bottom edge, 0..36 heat
  const FW = W * 2;
  const FH = 60;
  const fire = new Uint8Array(FW * FH);
  const firePal: [number, number, number][] = [];
  for (let i = 0; i <= 36; i++) {
    const t = (i / 36) * 0.8;
    const r = Math.min(255, Math.round(t * 3 * 255));
    const gg = Math.max(0, Math.min(255, Math.round((t * 3 - 1) * 255)));
    const b = Math.max(0, Math.min(255, Math.round((t * 3 - 2) * 255)));
    firePal.push([r, Math.round(gg * 0.85), b]);
  }
  for (let x = 0; x < FW; x++) fire[(FH - 1) * FW + x] = 30;
  const fireCanvas = document.createElement('canvas');
  fireCanvas.width = FW;
  fireCanvas.height = FH;
  const fireCtx = fireCanvas.getContext('2d')!;
  const fireImage = fireCtx.createImageData(FW, FH);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  let sel = 0;
  let showAbout = false;
  const items = [
    { id: 'new-game', label: 'New Game', action: onStart },
    { id: 'read-this', label: 'Read This!', action: () => (showAbout = true) },
  ];
  let t = 0;
  let last = performance.now();
  const menuX = 30;
  const menuY = 156;
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
    // Read This promises any key (including arrows) returns to the menu.
    if (showAbout) {
      showAbout = false;
      e.preventDefault();
      return;
    }
    if (['ArrowUp', 'KeyW'].includes(e.code)) sel = (sel + items.length - 1) % items.length;
    else if (['ArrowDown', 'KeyS'].includes(e.code)) sel = (sel + 1) % items.length;
    else if (['Enter', 'Space', 'NumpadEnter'].includes(e.code)) choose();
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  c.addEventListener('click', () => {
    if (showAbout) showAbout = false;
  });
  // transparent hit buttons laid over each entry: mouse + automation hooks
  items.forEach((it, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu-hit';
    b.dataset.menuItem = it.id;
    b.textContent = it.label;
    b.setAttribute('aria-label', it.label);
    Object.assign(b.style, {
      position: 'absolute',
      left: `${((menuX - 22) / W) * 100}%`,
      top: `${((menuY - 3 + i * rowH) / H) * 100}%`,
      width: `${(96 / W) * 100}%`,
      height: `${(rowH / H) * 100}%`,
      border: '0',
      padding: '0',
      margin: '0',
      background: 'transparent',
      color: 'transparent',
      cursor: 'pointer',
      zIndex: '2',
    });
    b.addEventListener('mouseenter', () => {
      if (!showAbout) sel = i;
    });
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (showAbout) {
        showAbout = false;
        return;
      }
      sel = i;
      choose();
    });
    host.appendChild(b);
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
    g.drawImage(pic, 0, 0, W, H);
    // fire
    for (let x = 0; x < FW; x++) {
      for (let y = 1; y < FH; y++) {
        const src = y * FW + x;
        const p = fire[src];
        const r = Math.floor(rnd() * 3);
        const dst = src - FW - r + 1;
        if (dst >= 0) fire[dst] = Math.max(0, p - (r & 1) - (rnd() < 0.5 ? 1 : 0));
      }
    }
    for (let i = 0; i < fire.length; i++) {
      const v = fire[i];
      const p = i * 4;
      if (v < 6) fireImage.data[p + 3] = 0;
      else {
        const col = firePal[v];
        fireImage.data[p] = col[0];
        fireImage.data[p + 1] = col[1];
        fireImage.data[p + 2] = col[2];
        fireImage.data[p + 3] = 255;
      }
    }
    fireCtx.putImageData(fireImage, 0, 0);
    g.drawImage(fireCanvas, 0, H - FH / 2, W, FH / 2);
    // the analyst's keyboard, held like Doom's pistol on the title art
    if (keyboard) {
      g.save();
      g.translate(34, 4);
      drawToolViewmodel(g, keyboard, W, H, t * 2, 'male', 0, t, {
        sinceUse: 9, sinceConfirm: 9, confirmGood: true, time: t, ammo: 0, skin: skinTriple(),
      });
      g.restore();
    }
    // logo on a smoked band
    g.fillStyle = getTitleStipple(g) ?? '#000';
    g.fillRect(0, 6, W, 64);
    const logo = 'CYBERDOOM';
    const px = 5;
    const lw = logo.length * 6 * px - px;
    paintLogo(g, logo, Math.round((W - lw) / 2), 12, px);
    const sub = 'SECURITY+ FIELD TRAINING';
    drawChunky(g, sub, Math.round((W - measureChunky(sub)) / 2), 52, ['#fff0a0', '#ffd040', '#d08a10']);
    drawText(g, 'COMPTIA SY0-701', W - 6 - measureText('COMPTIA SY0-701', 'tiny'), H - 8, '#c8a878', 'tiny', '#000');

    if (showAbout) {
      const bw = 300;
      const bh = 14 + about.length * 8;
      const bx = (W - bw) / 2;
      const by = 72;
      g.fillStyle = '#0c0808';
      g.fillRect(bx, by, bw, bh);
      g.fillStyle = '#8a7a60';
      g.fillRect(bx, by, bw, 1);
      g.fillRect(bx, by + bh - 1, bw, 1);
      about.forEach((line, i) => drawText(g, line, bx + 6, by + 6 + i * 8, i === 0 ? '#ffd040' : '#e8e0d0', 'tiny', '#000'));
    } else {
      // menu plate, bottom-left (clear of the keyboard and the threats' faces)
      g.fillStyle = getTitleStipple(g) ?? '#000';
      g.fillRect(4, menuY - 8, 114, items.length * rowH + 10);
      items.forEach((it, i) => {
        const y = menuY + i * rowH;
        const label = it.label.toUpperCase();
        drawChunky(g, label, menuX + 1, y + 1, '#300800', null);
        drawChunky(g, label, menuX, y, i === sel ? ['#fff4b0', '#ffe060', '#ffb030'] : ['#ff8a50', '#d84020', '#a02010']);
        if (i === sel) drawSkull(g, menuX - 18, y - 2, Math.floor(t * 4) % 2 === 0);
      });
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
