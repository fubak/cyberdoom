// Capture color-coded USB grip diagnostics from four fixed camera views.
// Usage: node tools/usb-3d-grip-debug.mjs [output-dir] [base-url]
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const output = resolve(process.argv[2] ?? '/home/ubuntu/audit/usb-proto/3d');
const baseUrl = process.argv[3] ?? 'http://localhost:5173';
const viewport = { width: 1280, height: 800 };
const crop = { x: 0, y: 0, width: viewport.width, height: 672 };
const views = ['game', 'right', 'top', 'below'];
const gripViews = ['right', 'below'];
const errors = [];
const wrist = [0.035, -0.035, 0.045];
const palm = [-1, 0, 0];
const curls = (mcp, pip, dip, thumb) => ({
  index: { mcp, pip, dip, abd: -5 },
  middle: { mcp, pip, dip, abd: -4 },
  ring: { mcp, pip, dip, abd: -3 },
  pinky: { mcp: mcp - 7, pip: pip - 5, dip: dip - 6, abd: -2 },
  thumb: thumb.curl,
});
const allSweepVariants = [
  {
    slug: 'baseline', label: 'baseline',
    grip: { wrist, fingers: [-0.25, -0.45, -0.85], palm, curls: curls(85, 105, 70, { curl: { mcp: 30, pip: 10, abd: 45 } }), thumbOut: 0.45, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'left-firm', label: 'left / firm curls',
    grip: { wrist, fingers: [-0.55, -0.3, -0.78], palm, curls: curls(85, 105, 70, { curl: { mcp: 30, pip: 10, abd: 45 } }), thumbOut: 0.45, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'more-left-firm', label: 'more left / firm curls',
    grip: { wrist, fingers: [-0.7, -0.2, -0.69], palm, curls: curls(85, 105, 70, { curl: { mcp: 30, pip: 10, abd: 45 } }), thumbOut: 0.45, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'left-soft', label: 'left / softer curls',
    grip: { wrist, fingers: [-0.55, -0.3, -0.78], palm, curls: curls(75, 95, 55, { curl: { mcp: 30, pip: 10, abd: 45 } }), thumbOut: 0.45, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'more-left-soft', label: 'more left / softer curls',
    grip: { wrist, fingers: [-0.7, -0.2, -0.69], palm, curls: curls(75, 95, 55, { curl: { mcp: 30, pip: 10, abd: 45 } }), thumbOut: 0.45, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-open', label: 'thumb open',
    grip: { wrist, fingers: [-0.55, -0.3, -0.78], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 10, abd: 35 } }), thumbOut: 0.7, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-opposed', label: 'thumb opposed',
    grip: { wrist, fingers: [-0.55, -0.3, -0.78], palm, curls: curls(85, 105, 70, { curl: { mcp: 35, pip: 15, abd: 65 } }), thumbOut: 0.5, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'tail-down', label: 'tail down / toward camera',
    grip: { wrist, fingers: [-0.55, -0.3, -0.78], palm, curls: curls(85, 105, 70, { curl: { mcp: 30, pip: 10, abd: 45 } }), thumbOut: 0.45, tail: [0.3, -0.7, 0.65] },
  },
  {
    slug: 'tail-away', label: 'tail down / away from camera',
    grip: { wrist, fingers: [-0.55, -0.3, -0.78], palm, curls: curls(85, 105, 70, { curl: { mcp: 30, pip: 10, abd: 45 } }), thumbOut: 0.45, tail: [0.3, -0.5, -0.8] },
  },
  {
    slug: 'combined', label: 'combined',
    grip: { wrist: [0.045, -0.018, 0.082], fingers: [-0.62, -0.22, -0.75], palm, curls: curls(80, 100, 65, { curl: { mcp: 22, pip: 8, abd: 45 } }), thumbOut: 0.65, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'side-left-current', label: 'palm left / current fingers',
    grip: { wrist, fingers: [-0.25, -0.45, -0.85], palm: [-1, 0, 0], curls: curls(85, 105, 70, { curl: { mcp: 25, pip: 8, abd: 40 } }), thumbOut: 0.55, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'side-left', label: 'palm left / fingers left',
    grip: { wrist, fingers: [-0.55, -0.3, -0.78], palm: [-1, 0, 0], curls: curls(85, 105, 70, { curl: { mcp: 25, pip: 8, abd: 40 } }), thumbOut: 0.55, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'side-cross', label: 'palm left / crosswise fingers',
    grip: { wrist, fingers: [-0.7, -0.5, -0.5], palm: [-1, 0, 0], curls: curls(85, 105, 70, { curl: { mcp: 25, pip: 8, abd: 40 } }), thumbOut: 0.55, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'side-lowz', label: 'palm left / less lengthwise',
    grip: { wrist, fingers: [-0.75, -0.5, -0.2], palm: [-1, 0, 0], curls: curls(85, 105, 70, { curl: { mcp: 25, pip: 8, abd: 40 } }), thumbOut: 0.55, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'side-down', label: 'palm left / downward wrap',
    grip: { wrist, fingers: [-0.45, -0.75, -0.2], palm: [-1, 0, 0], curls: curls(85, 105, 70, { curl: { mcp: 25, pip: 8, abd: 40 } }), thumbOut: 0.55, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'side-wrap', label: 'palm left / left-down wrap',
    grip: { wrist, fingers: [-0.8, -0.55, -0.15], palm: [-1, 0, 0], curls: curls(85, 105, 70, { curl: { mcp: 25, pip: 8, abd: 40 } }), thumbOut: 0.55, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'wrap-target', label: 'cross-body fingers',
    grip: { wrist, fingers: [-0.95, -0.3, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: 45 } }), thumbOut: 0.55, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'wrap-forward', label: 'cross-body / slight forward',
    grip: { wrist, fingers: [-0.9, -0.35, -0.2], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: 45 } }), thumbOut: 0.55, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'wrap-open-thumb', label: 'cross-body / open thumb',
    grip: { wrist, fingers: [-0.95, -0.3, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 10, pip: 5, abd: 30 } }), thumbOut: 0.75, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'current-basis', label: 'less-down / left',
    grip: { wrist, fingers: [-0.44, -0.30, -0.55], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: 45 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'less-left-more-forward', label: 'less left / more forward',
    grip: { wrist, fingers: [-0.35, -0.30, -0.55], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: 45 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'more-forward', label: 'less down / more forward',
    grip: { wrist, fingers: [-0.48, -0.25, -0.70], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: 45 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-open-current', label: 'less-down basis / open thumb',
    grip: { wrist, fingers: [-0.44, -0.30, -0.55], palm, curls: curls(85, 105, 70, { curl: { mcp: 10, pip: 5, abd: 30 } }), thumbOut: 0.75, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-wrap-60', label: 'cross-body / thumb wrap 60',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: 60 } }), thumbOut: 0.5, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-wrap-90', label: 'cross-body / thumb wrap 90',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: 90 } }), thumbOut: 0.5, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-wrap-120', label: 'cross-body / thumb wrap 120',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: 120 } }), thumbOut: 0.5, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-wrap-150', label: 'cross-body / thumb wrap 150',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: 150 } }), thumbOut: 0.5, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-wrap-wide', label: 'cross-body / out 0 / wrap 90',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: 90 } }), thumbOut: 0, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-wrap-long', label: 'cross-body / long thumb / wrap 90',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 40, pip: 20, abd: 90 } }), thumbOut: 0.5, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-wrap-current-basis', label: 'side-grip basis / wrap 90',
    grip: { wrist, fingers: [-0.44, -0.30, -0.55], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: 90 } }), thumbOut: 0.5, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'wrist-out-20', label: 'cross-body / wrist 20 mm out',
    grip: { wrist: [0.055, -0.045, 0.045], fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: 0 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'wrist-out-40', label: 'cross-body / wrist 40 mm out',
    grip: { wrist: [0.075, -0.055, 0.04], fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: 0 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'wrist-out-60', label: 'cross-body / wrist 60 mm out',
    grip: { wrist: [0.095, -0.065, 0.04], fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: 0 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-static', label: 'cross-body / USB static thumb',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: 0 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-mcp-pip-flex', label: 'cross-body / flexed thumb',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 45, pip: 30, abd: 0 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-pip-flex', label: 'cross-body / distal thumb curl',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 60, abd: 0 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-abd-negative', label: 'cross-body / thumb abd -20',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: -20 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-out-low', label: 'cross-body / thumbOut 0',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: 0 } }), thumbOut: 0, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-out-mid', label: 'cross-body / thumbOut 0.5',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 20, pip: 8, abd: 0 } }), thumbOut: 0.5, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'less-down-a', label: 'less-down / more-left fingers',
    grip: { wrist, fingers: [-0.44, -0.15, -0.65], palm, curls: curls(85, 105, 70, { curl: { mcp: 45, pip: 30, abd: 0 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'less-down-b', label: 'less-down / forward fingers',
    grip: { wrist, fingers: [-0.44, -0.05, -0.75], palm, curls: curls(85, 105, 70, { curl: { mcp: 45, pip: 30, abd: 0 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'less-down-c', label: 'near-horizontal / forward',
    grip: { wrist, fingers: [-0.50, 0, -0.80], palm, curls: curls(85, 105, 70, { curl: { mcp: 45, pip: 30, abd: 0 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'less-down-d', label: 'near-horizontal / less-forward',
    grip: { wrist, fingers: [-0.50, 0, -0.65], palm, curls: curls(85, 105, 70, { curl: { mcp: 45, pip: 30, abd: 0 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-flex-deep', label: 'cross-body / deeply flexed thumb',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 70, pip: 60, abd: 0 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-flex-medium', label: 'cross-body / medium thumb flex',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 55, pip: 45, abd: 0 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-flex-max', label: 'cross-body / max thumb flex',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 60, pip: 80, abd: 0 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-flex-max-mid', label: 'cross-body / max flex / thumbOut .5',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 60, pip: 80, abd: 0 } }), thumbOut: 0.5, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-flex-max-wrap', label: 'cross-body / max flex / wrap 45',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 60, pip: 80, abd: 45 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-flex-max-wrap90', label: 'cross-body / max flex / wrap 90',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 60, pip: 80, abd: 90 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'thumb-flex-max-neg', label: 'cross-body / max flex / abd -20',
    grip: { wrist, fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 60, pip: 80, abd: -20 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'aligned-thumb-max-wrap', label: 'aligned wrist / max thumb wrap',
    grip: { wrist: [0.0643, -0.040, 0.0032], fingers: [-0.95, -0.30, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 60, pip: 80, abd: 45 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'less-down-max-thumb', label: 'side-grip basis / max thumb curl',
    grip: {
      wrist,
      fingers: [-0.44, -0.05, -0.75],
      palm,
      curls: {
        ...curls(85, 105, 70, { curl: { mcp: 60, pip: 80, abd: -20 } }),
        pinky: { mcp: 70, pip: 95, dip: 50, abd: -2 },
      },
      thumbOut: 1,
      tail: [0.3, -0.5, 0.8],
    },
  },
  {
    slug: 'finger-up-a', label: 'side-grip basis / fingers slightly up',
    grip: { wrist, fingers: [-0.44, 0.10, -0.75], palm, curls: curls(85, 105, 70, { curl: { mcp: 60, pip: 80, abd: 45 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'finger-up-b', label: 'side-grip basis / fingers up',
    grip: { wrist, fingers: [-0.44, 0.30, -0.75], palm, curls: curls(85, 105, 70, { curl: { mcp: 60, pip: 80, abd: 45 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'finger-up-c', label: 'side-grip basis / fingers more up',
    grip: { wrist, fingers: [-0.44, 0.50, -0.75], palm, curls: curls(85, 105, 70, { curl: { mcp: 60, pip: 80, abd: 45 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'finger-under', label: 'palm-left / fingers under',
    grip: { wrist, fingers: [-0.25, -0.95, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 60, pip: 80, abd: -20 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
  {
    slug: 'finger-diagonal-under', label: 'palm-left / diagonal under',
    grip: { wrist, fingers: [-0.40, -0.85, 0], palm, curls: curls(85, 105, 70, { curl: { mcp: 60, pip: 80, abd: -20 } }), thumbOut: 1, tail: [0.3, -0.5, 0.8] },
  },
];
const sweepVariants = [];
const orientations = [
  { slug: 'shallow', upLeft: 0.50, forward: 0.45 },
  { slug: 'base', upLeft: 0.55, forward: 0.60 },
  { slug: 'steep', upLeft: 0.63, forward: 0.70 },
];
const wristPositions = [
  [0.070, -0.050, 0.010],
  [0.070, -0.035, 0.050],
  [0.085, -0.050, 0.050],
  [0.085, -0.035, 0.010],
];
const thumbPoses = [
  { mcp: 40, pip: 30, abd: 35, out: 1 },
  { mcp: 50, pip: 50, abd: 45, out: 1 },
  { mcp: 60, pip: 70, abd: 60, out: 0.75 },
];
for (const orientation of orientations) {
  for (const [wristIndex, wristPosition] of wristPositions.entries()) {
    for (const [thumbIndex, thumb] of thumbPoses.entries()) {
      const curls = {
        index: { mcp: 85, pip: 105, dip: 70, abd: -5 },
        middle: { mcp: 85, pip: 105, dip: 70, abd: -4 },
        ring: { mcp: 85, pip: 105, dip: 70, abd: -3 },
        pinky: { mcp: 85, pip: 105, dip: 70, abd: -2 },
        thumb: { mcp: thumb.mcp, pip: thumb.pip, abd: thumb.abd },
      };
      sweepVariants.push({
        slug: `${orientation.slug}-${wristIndex}-${thumbIndex}`,
        orientation: orientation.slug,
        label: `${orientation.slug} wrist ${wristPosition.map((value) => value.toFixed(3)).join('/')} thumb ${thumb.mcp}/${thumb.pip}/${thumb.abd} out ${thumb.out}`,
        grip: {
          wrist: wristPosition,
          fingers: [-orientation.upLeft, -orientation.upLeft, -orientation.forward],
          palm: [-Math.SQRT1_2, Math.SQRT1_2, 0],
          curls,
          thumbOut: thumb.out,
          tail: [0.3, -0.5, 0.8],
        },
      });
    }
  }
}
for (const [index, thumb] of [
  { mcp: 40, pip: 30, abd: 35, y: -0.045 },
  { mcp: 40, pip: 30, abd: 35, y: -0.042 },
  { mcp: 40, pip: 30, abd: 35, y: -0.040 },
  { mcp: 40, pip: 30, abd: 35, y: -0.037 },
].entries()) {
  const curls = {
    index: { mcp: 85, pip: 105, dip: 70, abd: -5 },
    middle: { mcp: 85, pip: 105, dip: 70, abd: -4 },
    ring: { mcp: 85, pip: 105, dip: 70, abd: -3 },
    pinky: { mcp: 85, pip: 105, dip: 70, abd: -2 },
    thumb,
  };
  sweepVariants.push({
    slug: `steep-thumb-edge-${index}`,
    orientation: 'steep',
    label: `steep wrist 0.085/${thumb.y.toFixed(3)}/0.050 thumb ${thumb.mcp}/${thumb.pip}/${thumb.abd} out 1`,
    grip: {
      wrist: [0.085, thumb.y, 0.050],
      fingers: [-0.63, -0.63, -0.70],
      palm: [-Math.SQRT1_2, Math.SQRT1_2, 0],
      curls,
      thumbOut: 1,
      tail: [0.3, -0.5, 0.8],
    },
  });
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
await context.addInitScript(() => localStorage.setItem('cyberdoom.skin', 's1'));
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
await page.clock.install();
await page.goto(`${baseUrl}/?debug=1`, { waitUntil: 'load', timeout: 60000 });
await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
await page.evaluate(() => {
  window.__cd.startMission('m12', 'male');
  window.__cd.setTool(3);
});
await page.clock.runFor(1200);
await page.waitForFunction(
  () => window.__cd?.state().screen === 'play' && window.__cd.vm3d.state().active === 'usb',
  { timeout: 30000 },
);
await page.evaluate(() => {
  document.getElementById('hud')?.style.setProperty('visibility', 'hidden');
  window.__cd.vm3d.freeze(0);
});

async function captureSheet(prefix) {
  const imagePaths = [];
  for (const view of views) {
    await page.evaluate((name) => window.__cd.vm3d.debugUsbView(name), view);
    await page.clock.runFor(20);
    const path = resolve(output, `${prefix}-${view}.png`);
    await page.screenshot({ path, clip: crop });
    imagePaths.push(path);
  }
  const sheet = resolve(output, `${prefix}-views.png`);
  const result = spawnSync('montage', [
    ...imagePaths,
    '-tile', '2x2',
    '-geometry', '1280x672+2+2',
    '-background', '#222',
    sheet,
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'ImageMagick montage failed');
  return sheet;
}

const restSheet = await captureSheet('debug-rest');
await page.evaluate(() => {
  window.__cd.vm3d.freeze(null);
  window.__cd.fire();
});
await page.clock.runFor(33);
await page.evaluate(() => window.__cd.vm3d.freeze(0.033));
await page.clock.runFor(20);
const pressSheet = await captureSheet('debug-press-033ms');
await page.evaluate(() => window.__cd.vm3d.freeze(0));
await page.clock.runFor(20);
const sweepImages = [];
const sweepMetrics = [];
for (const variant of sweepVariants) {
  const metrics = await page.evaluate((grip) => window.__cd.vm3d.debugUsbGrip(grip), variant.grip);
  if (metrics) {
    sweepMetrics.push({ variant: variant.label, ...metrics });
    const deepest = metrics.deepestPenetration?.depthMm.toFixed(1) ?? 'none';
    const fingers = Object.values(metrics.fingertipSurfaceMm).map((mm) => mm.toFixed(1)).join('/');
    console.log(`[sweep] ${variant.label}: thumb ${metrics.thumbGapMm.toFixed(1)} mm, penetration ${deepest} mm, finger surfaces ${fingers} mm`);
  }
  for (const view of gripViews) {
    await page.evaluate((name) => window.__cd.vm3d.debugUsbView(name), view);
    await page.clock.runFor(20);
    const path = resolve(output, `debug-grip-sweep-${variant.slug}-${view}.png`);
    await page.screenshot({ path, clip: crop });
    sweepImages.push({ orientation: variant.orientation, label: `${variant.label} / ${view}`, path });
  }
}
const sweepSheets = [];
for (const orientation of orientations) {
  const sheet = resolve(output, `debug-grip-sweep-${orientation.slug}.png`);
  const montageArgs = ['-font', 'DejaVu-Sans', '-resize', '50%'];
  for (const image of sweepImages.filter(({ orientation: value }) => value === orientation.slug)) {
    montageArgs.push('-label', image.label, image.path);
  }
  montageArgs.push(
    '-tile', '4x',
    '-geometry', '640x336+2+2',
    '-background', '#222',
    sheet,
  );
  const montage = spawnSync('montage', montageArgs, { encoding: 'utf8' });
  if (montage.status !== 0) throw new Error(montage.stderr || 'ImageMagick sweep montage failed');
  sweepSheets.push(sheet);
}
await writeFile(resolve(output, 'debug-grip-sweep-metrics.json'), `${JSON.stringify(sweepMetrics, null, 2)}\n`);
await page.evaluate(() => window.__cd.vm3d.debugUsbGrip(null));
await page.evaluate(() => window.__cd.vm3d.debugUsbView(null));
await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
console.log('Wrote', restSheet, pressSheet, 'and', sweepSheets.join(', '));
