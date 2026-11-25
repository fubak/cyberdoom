import type { Gender } from '../core/types';
import { ANALYSTS, SKIN_TONES, currentSkin, setSkin, skinTriple } from '../tools/look';
import { Face, drawAvatar } from '../tools/portrait';
import { playTool, playVoice } from '../tools/sfx';
import { keyboardTool } from '../tools/keyboard';
import { drawBigText, drawChunky, drawText, measureBig, measureChunky, measureText, wrapText } from '../render/font';
import { drawSkull } from '../render/title';
import { drawToolViewmodel } from '../render/viewmodels';
import { BASE_H, BASE_W, RES, VIEW_H, VIEW_W } from '../render/res';
import { menuBackdropCanvas } from './menuBackdrop';

/**
 * ARSENAL: character select. Two analysts with distinct procedural portraits,
 * bios, voices and viewmodel hands. A shared skin-tone picker is independent
 * of gender. Keyboard: ←/→ choose, 1-5 skin tone, Enter deploy.
 *
 * LOOK: presented on a 1280x800 canvas with a 320x200 base layout.
 * Every clickable region is also a transparent <button data-menu-item> laid
 * over it (analyst-male, analyst-female, skin-1..5, deploy).
 */
const W = BASE_W;
const H = BASE_H;
const CARD_W = 146;
const CARD_H = 124;
const CARD_Y = 26;
const CARD_X: Record<Gender, number> = { male: 10, female: 164 };
const SKIN_Y = 156;
const SKIN_X = 118;
export const CHAR_HINT = 'ARROWS CHOOSE - 1-5 SKIN - ENTER GO - ESC BACK';
const BACK: [number, number, number, number] = [12, 174, 78, 15];
const DEPLOY: [number, number, number, number] = [188, 174, 88, 15];
const AMBER = ['#fff0a0', '#ffd040', '#ffa818', '#d07808', '#8a4804'];
/** Selection skull: right edge of the card, under the name and beside the callsign (clear of the hands). */
const SKULL_INSET_X = 15;
const SKULL_Y = 17;
/** Hand preview: the keyboard viewmodel (both hands in typing posture) is drawn into a 160x110 buffer; this crop holds it. */
const PREVIEW_SRC: [number, number, number, number] = [0, 0, 138, 60];
/** Where the full-view viewmodel is shifted so the keyboard lands in that crop. */
const PREVIEW_SHIFT: [number, number] = [-97, -137];

/** Flat horizontal bands top to bottom: a gradient that stays pixel art. */
export function bands(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colors: readonly string[]): void {
  const n = colors.length;
  for (let i = 0; i < n; i++) {
    const y0 = y + Math.round((h * i) / n);
    const y1 = y + Math.round((h * (i + 1)) / n);
    g.fillStyle = colors[i];
    g.fillRect(x, y0, w, y1 - y0);
  }
}

const HEADER_H = 22;
const HEADER_STEEL = ['#8a8478', '#7c766a', '#6e685e', '#625c52', '#565048'];
const PANEL_LIT = ['#1c2230', '#181d2a', '#141924', '#10141e', '#0c1018'];
const PANEL_DIM = ['#14171e', '#11141a', '#0f1116', '#0c0e13', '#0a0b10'];
/** Desk the keyboard sits on: dark at the back, catching light toward the viewer. */
const DESK = ['#06070b', '#080a10', '#0b0e16', '#10141e', '#161b28', '#1c2232'];

function paintBackdrop(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = VIEW_H;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(menuBackdropCanvas(), 0, 0);
  g.setTransform(RES, 0, 0, RES, 0, 0);
  const u = 1 / RES;
  // riveted steel header band, lit from above
  bands(g, 0, 0, W, HEADER_H, HEADER_STEEL);
  let s = 99;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.10)';
    g.fillRect(Math.floor(r() * VIEW_W) * u, Math.floor(r() * HEADER_H * RES) * u, u, u);
  }
  g.fillStyle = '#c8c0b0';
  g.fillRect(0, 0, W, u);
  g.fillStyle = '#2a2722';
  g.fillRect(0, HEADER_H - 1, W, 1);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, HEADER_H, W, 1);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(0, HEADER_H + 1, W, 1);
  for (let x = 6; x < W; x += 24) {
    for (const y of [3, HEADER_H - 5]) {
      g.fillStyle = '#3a362e';
      g.fillRect(x - u, y - u, 1 + 2 * u, 1 + 2 * u);
      g.fillStyle = '#d8d0c0';
      g.fillRect(x, y, 1, 1);
      g.fillStyle = '#f8f0e0';
      g.fillRect(x, y, 2 * u, 2 * u);
    }
  }
  return c;
}

function frame(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lit: boolean, glow: boolean): void {
  const u = 1 / RES;
  if (lit) {
    // amber halo round the chosen card, stepped outward
    for (let i = 4; i >= 1; i--) {
      g.fillStyle = `rgba(255,176,24,${glow ? 0.1 : 0.06})`;
      g.fillRect(x - 2 - i, y - 2 - i, w + 4 + 2 * i, h + 4 + 2 * i);
    }
  } else {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(x, y + 2, w + 3, h + 3);
  }
  g.fillStyle = '#000';
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle = lit ? (glow ? '#ffd040' : '#c08010') : '#3a3e48';
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  bands(g, x, y, w, h, lit ? PANEL_LIT : PANEL_DIM);
  g.fillStyle = 'rgba(255,255,255,0.025)';
  for (let yy = y + 1; yy < y + h; yy += 2) g.fillRect(x, yy, w, 1);
  g.fillStyle = lit && glow ? '#fff0a0' : lit ? '#c8b070' : '#6a7080';
  g.fillRect(x + u, y + u, w - 2 * u, u);
  g.fillRect(x + u, y + u, u, h - 2 * u);
  g.fillStyle = '#05060a';
  g.fillRect(x + u, y + h - 2 * u, w - 2 * u, 2 * u);
  g.fillRect(x + w - 2 * u, y + u, 2 * u, h - 2 * u);
  for (const sx of [x + 2, x + w - 4]) {
    for (const sy of [y + 2, y + h - 4]) {
      g.fillStyle = '#101218';
      g.fillRect(sx - u, sy - u, 3 * u + 1 - u, 3 * u + 1 - u);
      g.fillStyle = '#9aa0b0';
      g.fillRect(sx, sy, 1, 1);
      g.fillStyle = '#e8ecf4';
      g.fillRect(sx, sy, 2 * u, 2 * u);
    }
  }
}

/** A recessed well: dark lip on top and left, catch-light on the bottom and right. */
function well(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = '#000';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#3a4050';
  g.fillRect(x, y + h - 1 / RES * 2, w, 2 / RES);
  g.fillRect(x + w - 2 / RES, y, 2 / RES, h);
}

export function characterSelect(onPick: (g: Gender) => void, onBack: () => void, initial: Gender = 'male'): HTMLElement {
  const s = document.createElement('div');
  s.className = 'screen title';
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = VIEW_H;
  c.className = 'title-px';
  s.appendChild(c);
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.setTransform(RES, 0, 0, RES, 0, 0);
  const back = paintBackdrop();
  const hands: Record<Gender, HTMLCanvasElement> = { male: document.createElement('canvas'), female: document.createElement('canvas') };
  for (const h of Object.values(hands)) {
    h.width = 160 * RES;
    h.height = 110 * RES;
    const hg = h.getContext('2d')!;
    hg.imageSmoothingEnabled = false;
    hg.setTransform(RES, 0, 0, RES, 0, 0);
  }

  let sel: Gender = initial;
  const faces: Record<Gender, Face> = { male: new Face(), female: new Face() };
  let t = 0;

  const render = () => {
    const pulse = Math.floor(t * 4) % 2 === 0;
    g.drawImage(back, 0, 0, W, H);
    const title = 'SELECT YOUR ANALYST';
    drawBigText(g, title, Math.round((W - measureBig(title, true)) / 2), 4, AMBER, '#200800', true);
    for (const gd of ['male', 'female'] as Gender[]) {
      const a = ANALYSTS[gd];
      const x = CARD_X[gd];
      const y = CARD_Y - (gd === sel ? 2 : 0);
      frame(g, x, y, CARD_W, CARD_H, gd === sel, pulse);
      // lit avatar, 2x, in a recessed well; it follows the skin tone picker
      well(g, x + 4, y + 4, 52, 52);
      drawAvatar(g, x + 6, y + 6, gd, faces[gd].state(100), 2);
      const name = a.name.toUpperCase();
      if (measureChunky(name) <= CARD_W - 64) drawChunky(g, name, x + 62, y + 7, gd === sel ? ['#ffffff', '#f0ece4', '#c8c0b0'] : '#9aa0b0');
      else drawText(g, name, x + 62, y + 7, '#f0ece4', 'small');
      drawText(g, `CALLSIGN ${a.callsign}`.toUpperCase(), x + 62, y + 19, '#ffb000', 'tiny');
      drawText(g, 'SOC ANALYST', x + 62, y + 27, '#8a90a0', 'tiny');
      wrapText(a.bio.toUpperCase(), 20, 3).forEach((line, i) => drawText(g, line, x + 62, y + 37 + i * 7, '#b8bcc8', 'tiny'));
      // viewmodel hands (shows the chosen skin tone)
      const hg = hands[gd].getContext('2d')!;
      hg.clearRect(0, 0, 160, 110);
      hg.save();
      hg.setTransform(RES, 0, 0, RES, 0, 0);
      hg.imageSmoothingEnabled = false;
      hg.translate(PREVIEW_SHIFT[0], PREVIEW_SHIFT[1]);
      drawToolViewmodel(hg, keyboardTool, W, H, 0, gd, 0, t, {
        sinceUse: 9, sinceConfirm: 9, confirmGood: true, time: t, ammo: 8, skin: skinTriple(),
      });
      hg.restore();
      well(g, x + 4, y + 60, CARD_W - 8, CARD_H - 64);
      bands(g, x + 4, y + 60, CARD_W - 8 - 2 / RES, CARD_H - 64 - 2 / RES, DESK);
      // 1:1 crop (no squash): the hands read at the same scale as in play
      const [sx, sy, sw, sh] = PREVIEW_SRC;
      g.drawImage(hands[gd], sx * RES, sy * RES, sw * RES, sh * RES, x + 4, y + 60, CARD_W - 8, CARD_H - 64);
      if (gd === sel) drawSkull(g, x + CARD_W - SKULL_INSET_X, y + SKULL_Y, pulse);
      else {
        // the card not chosen steps back
        g.fillStyle = 'rgba(4,5,10,0.38)';
        g.fillRect(x, y, CARD_W, CARD_H);
      }
    }
    // skin tones
    drawChunky(g, 'SKIN TONE', SKIN_X - 6 - measureChunky('SKIN TONE'), SKIN_Y + 2, '#c8c0b0');
    SKIN_TONES.forEach((tone, i) => {
      const x = SKIN_X + i * 18;
      const on = tone.id === currentSkin().id;
      const u = 1 / RES;
      g.fillStyle = '#000';
      g.fillRect(x - 2, SKIN_Y - 2, 16, 14);
      g.fillStyle = on ? '#ffffff' : '#3a3e48';
      g.fillRect(x - 1, SKIN_Y - 1, 14, 12);
      g.fillStyle = tone.base;
      g.fillRect(x, SKIN_Y, 12, 10);
      g.fillStyle = tone.highlight;
      g.fillRect(x, SKIN_Y, 12, 2);
      g.fillStyle = tone.shadow;
      g.fillRect(x, SKIN_Y + 8, 12, 2);
      g.fillStyle = '#fff0c8';
      g.fillRect(x + u, SKIN_Y + u, 12 - 2 * u, u);
      g.fillStyle = '#5a3020';
      g.fillRect(x + u, SKIN_Y + 10 - 2 * u, 12 - 2 * u, u);
      drawText(g, `${i + 1}`, x + 5, SKIN_Y + 3, on ? '#ffffff' : '#d8dce4', 'tiny', '#000');
    });
    // back + deploy
    const paintPlate = (x: number, y: number, w: number, h: number, label: string, hot: boolean) => {
      g.fillStyle = '#000';
      g.fillRect(x - 1, y - 1, w + 2, h + 2);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(x + 1, y + h + 1, w + 1, 1);
      g.fillRect(x + w + 1, y + 1, 1, h + 1);
      bands(g, x, y, w, h, hot ? ['#e03418', '#d02a14', '#c02010', '#a81a0c', '#901408'] : ['#4a3022', '#42291d', '#3a2418', '#301d13', '#26160e']);
      g.fillStyle = hot ? '#ff6a40' : '#8a7060';
      g.fillRect(x + 1 / RES, y + 1 / RES, w - 2 / RES, 1 / RES);
      g.fillStyle = hot ? '#500804' : '#1a100c';
      g.fillRect(x + 1 / RES, y + h - 2 / RES, w - 2 / RES, 1 / RES);
      const ramp = hot ? ['#ffffff', '#fff0a0', '#ffd040'] : ['#f0ece4', '#c8c0b0', '#8a90a0'];
      drawChunky(g, label, x + Math.round((w - measureChunky(label)) / 2), y + 4, ramp);
    };
    const [bx, by, bw, bh] = BACK;
    paintPlate(bx, by, bw, bh, 'BACK', false);
    const [dx, dy, dw, dh] = DEPLOY;
    paintPlate(dx, dy, dw, dh, 'DEPLOY', true);
    const hint = CHAR_HINT;
    drawText(g, hint, Math.round((W - measureText(hint, 'tiny')) / 2), H - 7, '#8a90a0', 'tiny');
  };

  const choose = (gd: Gender) => {
    if (gd !== sel) {
      sel = gd;
      playTool('menu-move');
      playVoice(gd, 'ready');
      faces[gd].grin();
      faces[gd].talk();
    }
  };
  const pickSkin = (id: string) => {
    setSkin(id);
    playTool('menu-move');
  };
  const deploy = () => {
    cleanup();
    playTool('menu-pick');
    onPick(sel);
  };
  const leave = () => {
    cleanup();
    playTool('menu-move');
    onBack();
  };

  // transparent buttons over every clickable region: mouse + automation hooks
  const hook = (id: string, label: string, x: number, y: number, w: number, h: number, onClick: () => void, onDouble?: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu-hit';
    b.dataset.menuItem = id;
    b.textContent = label;
    b.setAttribute('aria-label', label);
    Object.assign(b.style, {
      position: 'absolute',
      left: `${(x / W) * 100}%`,
      top: `${(y / H) * 100}%`,
      width: `${(w / W) * 100}%`,
      height: `${(h / H) * 100}%`,
      border: '0',
      padding: '0',
      margin: '0',
      background: 'transparent',
      color: 'transparent',
      cursor: 'pointer',
      zIndex: '2',
    });
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    if (onDouble) b.addEventListener('dblclick', onDouble);
    s.appendChild(b);
  };
  for (const gd of ['male', 'female'] as Gender[]) {
    // click selects; double-click (or DEPLOY / Enter) deploys
    hook(`analyst-${gd}`, ANALYSTS[gd].name, CARD_X[gd] - 2, CARD_Y - 4, CARD_W + 4, CARD_H + 6, () => choose(gd), deploy);
  }
  SKIN_TONES.forEach((tone, i) => hook(`skin-${i + 1}`, `Skin tone ${i + 1}`, SKIN_X + i * 18 - 2, SKIN_Y - 2, 16, 14, () => pickSkin(tone.id)));
  hook('back', 'Back', ...BACK, leave);
  hook('deploy', 'Deploy', ...DEPLOY, deploy);

  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') choose('male');
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') choose('female');
    else if (e.code === 'Enter') {
      e.preventDefault();
      deploy();
    }
    else if (e.code === 'Escape' || e.code === 'Backspace') {
      e.preventDefault();
      leave();
    } else if (/^Digit[1-5]$/.test(e.code)) {
      const tone = SKIN_TONES[Number(e.code[5]) - 1];
      if (tone) pickSkin(tone.id);
    }
  };
  let raf = 0;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    t += dt;
    faces.male.tick(dt);
    faces.female.tick(dt);
    render();
    raf = requestAnimationFrame(loop);
  };
  const cleanup = () => {
    window.removeEventListener('keydown', onKey);
    cancelAnimationFrame(raf);
  };
  window.addEventListener('keydown', onKey);
  raf = requestAnimationFrame(loop);
  // stop the loop if main swaps the screen out
  new MutationObserver((_, obs) => {
    if (!s.isConnected && s.dataset.mounted) {
      cleanup();
      obs.disconnect();
    }
    if (s.isConnected) s.dataset.mounted = '1';
  }).observe(document.body, { childList: true, subtree: true });
  render();
  return s;
}
