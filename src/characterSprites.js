import { seededPhase } from './utils.js';

const ASSET_ROOT = 'assets/characters';

const COMMON_X_LEFT = [100, 250, 400, 550];
const COMMON_X_RIGHT = [690, 840, 990, 1140];
const COMMON_ROWS = {
  down: 145,
  left: 420,
  right: 695,
  up: 970
};

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
      masculine: { x: [105, 255, 405, 555], y: { ...COMMON_ROWS }, w: 100, h: { down: 190, left: 190, right: 190, up: 185 } },
      feminine: { x: [690, 840, 990, 1140], y: { ...COMMON_ROWS }, w: 100, h: { down: 190, left: 190, right: 190, up: 185 } }
    },
    targetHeight: 49,
    groundOffset: 14
  },
  teen: {
    path: `${ASSET_ROOT}/teen-sheet.png`,
    box: {
      masculine: { x: [...COMMON_X_LEFT], y: { down: 120, left: 420, right: 695, up: 970 }, w: 110, h: { down: 240, left: 240, right: 240, up: 235 } },
      feminine: { x: [...COMMON_X_RIGHT], y: { down: 120, left: 420, right: 695, up: 970 }, w: 110, h: { down: 240, left: 240, right: 240, up: 235 } }
    },
    targetHeight: 55,
    groundOffset: 15
  },
  adult: {
    path: `${ASSET_ROOT}/adult-sheet.png`,
    box: {
      masculine: { x: [...COMMON_X_LEFT], y: { down: 130, left: 425, right: 700, up: 975 }, w: 110, h: { down: 250, left: 250, right: 250, up: 240 } },
      feminine: { x: [...COMMON_X_RIGHT], y: { down: 130, left: 425, right: 700, up: 975 }, w: 110, h: { down: 250, left: 250, right: 250, up: 240 } }
    },
    targetHeight: 60,
    groundOffset: 15
  }
};

function normalizeStage(stage = 'adult') {
  if (stage === 'baby') return 'toddler';
  if (stage === 'elder') return 'adult';
  return CHARACTER_SPRITE_SHEETS[stage] ? stage : 'adult';
}

function normalizePresentation(person) {
  const presentation = person?.appearance?.presentation || 'masculine';
  return presentation === 'feminine' ? 'feminine' : 'masculine';
}

function normalizeDirection(dir = 'down') {
  if (dir === 'up') return 'up';
  if (dir === 'left') return 'left';
  if (dir === 'right') return 'right';
  return 'down';
}

function frameIndex(person, animationClock) {
  if (!person?.moving) return 0;
  const seed = seededPhase(person.id || person.name || 'resident');
  return 1 + (Math.floor(animationClock * 7 + seed * 10) % 3);
}

export function preloadCharacterSprites() {
  const images = new Map();
  if (typeof Image === 'undefined') return images;
  for (const [stage, info] of Object.entries(CHARACTER_SPRITE_SHEETS)) {
    const image = new Image();
    image.decoding = 'async';
    image.src = info.path;
    images.set(stage, image);
  }
  return images;
}

export function drawCharacterSprite(ctx, spriteImages, person, animationClock, options = {}) {
  if (!spriteImages || options.pose === 'sleeping' || options.pose === 'sitting') return null;
  const stage = normalizeStage(person?.stage);
  const sheet = CHARACTER_SPRITE_SHEETS[stage];
  const image = spriteImages.get(stage);
  if (!sheet || !image?.complete || !image.naturalWidth) return null;

  const presentation = normalizePresentation(person);
  const direction = normalizeDirection(person?.dir);
  const frame = frameIndex(person, animationClock);
  const box = sheet.box[presentation];
  const sx = box.x[frame];
  const sy = box.y[direction];
  const sw = box.w;
  const sh = box.h[direction];
  const drawH = sheet.targetHeight;
  const drawW = Math.round(sw * (drawH / sh));
  const x = Math.round(person.x);
  const y = Math.round(person.y);
  const groundY = y + sheet.groundOffset;
  const dx = Math.round(x - drawW / 2);
  const dy = Math.round(groundY - drawH);

  ctx.save();
  ctx.fillStyle = 'rgba(23,32,51,.18)';
  ctx.beginPath();
  ctx.ellipse(x, groundY - 1, Math.max(8, drawW * 0.26), Math.max(3, drawH * 0.06), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, drawW, drawH);
  if (options.highlight) {
    ctx.strokeStyle = '#f5cf73';
    ctx.lineWidth = 2;
    ctx.strokeRect(dx - 3, dy - 3, drawW + 6, drawH + 6);
  }
  ctx.restore();

  return { x, y: dy + drawH / 2, width: drawW + 4, height: drawH + 4 };
}
