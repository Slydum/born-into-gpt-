import { seededPhase } from './utils.js';

const ASSET_ROOT = new URL('../assets/character/', import.meta.url);
const ASSET_VERSION = '76';
const assetUrl = (name) => new URL(name, ASSET_ROOT).href;

export const CHARACTER_SPRITE_SHEETS = {
  toddler: {
    path: assetUrl('toddler-sheet.png'),
    box: {
      masculine: { x: [30, 180, 330, 480], y: { down: 110, left: 390, right: 675, up: 975 }, w: 120, h: { down: 200, left: 200, right: 200, up: 180 } },
      feminine: { x: [640, 790, 940, 1090], y: { down: 110, left: 390, right: 675, up: 975 }, w: 120, h: { down: 200, left: 200, right: 200, up: 180 } }
    },
    targetHeight: 44,
    groundOffset: 14
  },
  child: {
    path: assetUrl('child-sheet.png'),
    box: {
      masculine: { x: [105, 255, 405, 555], y: { down: 145, left: 420, right: 695, up: 970 }, w: 100, h: { down: 190, left: 190, right: 190, up: 185 } },
      feminine: { x: [690, 840, 990, 1140], y: { down: 145, left: 420, right: 695, up: 970 }, w: 100, h: { down: 190, left: 190, right: 190, up: 185 } }
    },
    targetHeight: 49,
    groundOffset: 14
  },
  teen: {
    path: assetUrl('teen-sheet.png'),
    box: {
      masculine: { x: [100, 250, 400, 550], y: { down: 120, left: 420, right: 695, up: 970 }, w: 110, h: { down: 240, left: 240, right: 240, up: 235 } },
      feminine: { x: [690, 840, 990, 1140], y: { down: 120, left: 420, right: 695, up: 970 }, w: 110, h: { down: 240, left: 240, right: 240, up: 235 } }
    },
    targetHeight: 55,
    groundOffset: 15
  },
  adult: {
    path: assetUrl('adult-sheet.png'),
    box: {
      masculine: { x: [100, 250, 400, 550], y: { down: 130, left: 425, right: 700, up: 975 }, w: 110, h: { down: 250, left: 250, right: 250, up: 240 } },
      feminine: { x: [690, 840, 990, 1140], y: { down: 130, left: 425, right: 700, up: 975 }, w: 110, h: { down: 250, left: 250, right: 250, up: 240 } }
    },
    targetHeight: 60,
    groundOffset: 15
  }
};

function spriteStage(stage = 'adult') {
  if (stage === 'baby') return 'toddler';
  if (stage === 'elder') return 'adult';
  return CHARACTER_SPRITE_SHEETS[stage] ? stage : 'adult';
}

function stageScale(stage = 'adult') {
  if (stage === 'baby') return 0.68;
  if (stage === 'elder') return 0.92;
  return 1;
}

function normalizePresentation(person) {
  return person?.appearance?.presentation === 'feminine' ? 'feminine' : 'masculine';
}

function normalizeDirection(direction = 'down') {
  return ['up', 'left', 'right'].includes(direction) ? direction : 'down';
}

function getFrameIndex(person, animationClock, pose) {
  if (pose !== 'standing' || !person?.moving) return 0;
  const phase = seededPhase(person.id || person.name || 'resident');
  return 1 + (Math.floor(animationClock * 7 + phase * 10) % 3);
}

export function preloadCharacterSprites() {
  const images = new Map();
  if (typeof Image === 'undefined') return images;
  for (const [stage, sheet] of Object.entries(CHARACTER_SPRITE_SHEETS)) {
    const image = new Image();
    image.decoding = 'async';
    image.src = `${sheet.path}?v=${ASSET_VERSION}`;
    image.onerror = () => console.error(`Character sprite failed to load: ${image.src}`);
    images.set(stage, image);
  }
  return images;
}

export function drawCharacterSprite(ctx, images, person, animationClock, options = {}) {
  if (!images || !person) return null;

  const originalStage = person.stage || 'adult';
  const stage = spriteStage(originalStage);
  const sheet = CHARACTER_SPRITE_SHEETS[stage];
  const image = images.get(stage);
  if (!sheet || !image?.complete || !image.naturalWidth) return null;

  const pose = options.pose || 'standing';
  const presentation = normalizePresentation(person);
  const direction = pose === 'sleeping' ? 'left' : normalizeDirection(person.dir);
  const frame = getFrameIndex(person, animationClock, pose);
  const crop = sheet.box[presentation];
  const sx = crop.x[frame];
  const sy = crop.y[direction];
  const sw = crop.w;
  const sh = crop.h[direction];

  let scale = stageScale(originalStage);
  if (pose === 'sitting') scale *= 0.82;
  if (pose === 'sleeping') scale *= 0.88;

  const drawHeight = sheet.targetHeight * scale;
  const drawWidth = sw * (drawHeight / sh);
  const x = Math.round(person.x);
  const y = Math.round(person.y);

  ctx.save();
  ctx.imageSmoothingEnabled = true;

  if (pose === 'sleeping') {
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(image, sx, sy, sw, sh, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    if (options.highlight) {
      ctx.strokeStyle = '#f5cf73';
      ctx.lineWidth = 2;
      ctx.strokeRect(-drawWidth / 2 - 3, -drawHeight / 2 - 3, drawWidth + 6, drawHeight + 6);
    }
    ctx.restore();
    return { x, y, width: drawHeight + 6, height: drawWidth + 6 };
  }

  const groundOffset = sheet.groundOffset * scale;
  const groundY = Math.round(y + groundOffset + (pose === 'sitting' ? 4 : 0));
  const dx = Math.round(x - drawWidth / 2);
  const dy = Math.round(groundY - drawHeight);

  ctx.fillStyle = 'rgba(23,32,51,.18)';
  ctx.beginPath();
  ctx.ellipse(x, groundY - 1, Math.max(6, drawWidth * 0.26), Math.max(2, drawHeight * 0.06), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, drawWidth, drawHeight);

  if (options.highlight) {
    ctx.strokeStyle = '#f5cf73';
    ctx.lineWidth = 2;
    ctx.strokeRect(dx - 3, dy - 3, drawWidth + 6, drawHeight + 6);
  }
  ctx.restore();

  return { x, y: dy + drawHeight / 2, width: drawWidth + 6, height: drawHeight + 6 };
}
