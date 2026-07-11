import { seededPhase } from './utils.js';

const ASSET_ROOT = 'assets/character';

export const CHARACTER_SPRITE_SHEETS = {
  toddler: {
    path: `${ASSET_ROOT}/toddler-sheet.png`,
    box: {
      masculine: { x: [30, 180, 330, 480], y: { down: 110, left: 390, right: 675, up: 975 }, w: 120, h: { down: 200, left: 200, right: 200, up: 180 } },
      feminine: { x: [640, 790, 940, 1090], y: { down: 110, left: 390, right: 675, up: 975 }, w: 120, h: { down: 200, left: 200, right: 200, up: 180 } }
    },
    targetHeight: 44,
    groundOffset: 14
  },
  child: {
    path: `${ASSET_ROOT}/child-sheet.png`,
    box: {
      masculine: { x: [105, 255, 405, 555], y: { down: 145, left: 420, right: 695, up: 970 }, w: 100, h: { down: 190, left: 190, right: 190, up: 185 } },
      feminine: { x: [690, 840, 990, 1140], y: { down: 145, left: 420, right: 695, up: 970 }, w: 100, h: { down: 190, left: 190, right: 190, up: 185 } }
    },
    targetHeight: 49,
    groundOffset: 14
  },
  teen: {
    path: `${ASSET_ROOT}/teen-sheet.png`,
    box: {
      masculine: { x: [100, 250, 400, 550], y: { down: 120, left: 420, right: 695, up: 970 }, w: 110, h: { down: 240, left: 240, right: 240, up: 235 } },
      feminine: { x: [690, 840, 990, 1140], y: { down: 120, left: 420, right: 695, up: 970 }, w: 110, h: { down: 240, left: 240, right: 240, up: 235 } }
    },
    targetHeight: 55,
    groundOffset: 15
  },
  adult: {
    path: `${ASSET_ROOT}/adult-sheet.png`,
    box: {
      masculine: { x: [100, 250, 400, 550], y: { down: 130, left: 425, right: 700, up: 975 }, w: 110, h: { down: 250, left: 250, right: 250, up: 240 } },
      feminine: { x: [690, 840, 990, 1140], y: { down: 130, left: 425, right: 700, up: 975 }, w: 110, h: { down: 250, left: 250, right: 250, up: 240 } }
    },
    targetHeight: 60,
    groundOffset: 15
  }
};

function normalizePresentation(person) {
  return person?.appearance?.presentation === 'feminine' ? 'feminine' : 'masculine';
}

function normalizeDirection(direction = 'down') {
  return ['up', 'left', 'right'].includes(direction) ? direction : 'down';
}

function getFrameIndex(person, animationClock) {
  if (!person?.moving) return 0;
  const phase = seededPhase(person.id || person.name || 'resident');
  return 1 + (Math.floor(animationClock * 7 + phase * 10) % 3);
}

export function preloadCharacterSprites() {
  const images = new Map();
  if (typeof Image === 'undefined') return images;
  for (const [stage, sheet] of Object.entries(CHARACTER_SPRITE_SHEETS)) {
    const image = new Image();
    image.decoding = 'async';
    image.src = sheet.path;
    images.set(stage, image);
  }
  return images;
}

export function drawCharacterSprite(ctx, images, person, animationClock, options = {}) {
  // The uploaded set covers these four stages. Baby, elder, sleeping, and sitting
  // continue using the existing renderer until matching poses are available.
  if (!images || !CHARACTER_SPRITE_SHEETS[person?.stage] || ['sleeping', 'sitting'].includes(options.pose)) return null;

  const stage = person.stage;
  const sheet = CHARACTER_SPRITE_SHEETS[stage];
  const image = images.get(stage);
  if (!image?.complete || !image.naturalWidth) return null;

  const presentation = normalizePresentation(person);
  const direction = normalizeDirection(person.dir);
  const frame = getFrameIndex(person, animationClock);
  const crop = sheet.box[presentation];
  const sx = crop.x[frame];
  const sy = crop.y[direction];
  const sw = crop.w;
  const sh = crop.h[direction];
  const drawHeight = sheet.targetHeight;
  const drawWidth = Math.round(sw * (drawHeight / sh));
  const x = Math.round(person.x);
  const groundY = Math.round(person.y + sheet.groundOffset);
  const dx = Math.round(x - drawWidth / 2);
  const dy = Math.round(groundY - drawHeight);

  ctx.save();
  ctx.fillStyle = 'rgba(23,32,51,.18)';
  ctx.beginPath();
  ctx.ellipse(x, groundY - 1, Math.max(8, drawWidth * 0.26), Math.max(3, drawHeight * 0.06), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, drawWidth, drawHeight);
  if (options.highlight) {
    ctx.strokeStyle = '#f5cf73';
    ctx.lineWidth = 2;
    ctx.strokeRect(dx - 3, dy - 3, drawWidth + 6, drawHeight + 6);
  }
  ctx.restore();

  return {
    x,
    y: dy + drawHeight / 2,
    width: drawWidth + 4,
    height: drawHeight + 4
  };
}
