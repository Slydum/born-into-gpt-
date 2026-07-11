import { seededPhase } from './utils.js';

const ASSET_VERSION = '80';
const ATLAS_URL = new URL(`../assets/chibi/chibi-essential-atlas.png?v=${ASSET_VERSION}`, import.meta.url).href;

const MOVEMENT = {
  baby: {
    down: [
      { x: 197, y: 84, w: 79, h: 113 },
      { x: 331, y: 86, w: 77, h: 111 },
      { x: 465, y: 86, w: 75, h: 112 },
      { x: 587, y: 88, w: 75, h: 109 }
    ],
    left: [
      { x: 202, y: 255, w: 73, h: 109 },
      { x: 333, y: 257, w: 73, h: 107 },
      { x: 467, y: 257, w: 72, h: 107 },
      { x: 590, y: 258, w: 71, h: 106 }
    ],
    right: [
      { x: 196, y: 428, w: 74, h: 108 },
      { x: 327, y: 427, w: 75, h: 109 },
      { x: 460, y: 426, w: 74, h: 110 },
      { x: 585, y: 427, w: 72, h: 110 }
    ],
    up: [
      { x: 192, y: 596, w: 77, h: 109 },
      { x: 331, y: 597, w: 73, h: 108 },
      { x: 464, y: 597, w: 73, h: 108 },
      { x: 586, y: 598, w: 73, h: 107 }
    ]
  },
  grown: {
    down: [
      { x: 789, y: 62, w: 85, h: 139 },
      { x: 940, y: 63, w: 81, h: 138 },
      { x: 1066, y: 63, w: 83, h: 138 },
      { x: 1191, y: 64, w: 82, h: 137 }
    ],
    left: [
      { x: 792, y: 242, w: 81, h: 128 },
      { x: 936, y: 243, w: 80, h: 127 },
      { x: 1065, y: 243, w: 80, h: 128 },
      { x: 1191, y: 242, w: 81, h: 128 }
    ],
    right: [
      { x: 792, y: 421, w: 81, h: 132 },
      { x: 933, y: 421, w: 84, h: 130 },
      { x: 1065, y: 421, w: 81, h: 130 },
      { x: 1190, y: 421, w: 80, h: 130 }
    ],
    up: [
      { x: 795, y: 596, w: 77, h: 129 },
      { x: 940, y: 596, w: 77, h: 129 },
      { x: 1067, y: 596, w: 78, h: 129 },
      { x: 1192, y: 596, w: 78, h: 129 }
    ]
  }
};

const STAGE_STYLE = {
  baby: { family: 'baby', height: 31, groundOffset: 9 },
  toddler: { family: 'baby', height: 36, groundOffset: 10 },
  child: { family: 'grown', height: 39, groundOffset: 11 },
  teen: { family: 'grown', height: 45, groundOffset: 12 },
  adult: { family: 'grown', height: 49, groundOffset: 13 },
  elder: { family: 'grown', height: 47, groundOffset: 12 }
};

function directionOf(direction = 'down') {
  return ['up', 'left', 'right'].includes(direction) ? direction : 'down';
}

function frameOf(person, animationClock) {
  if (!person?.moving) return 0;
  const phase = seededPhase(person.id || person.name || 'resident');
  return 1 + (Math.floor(animationClock * 7 + phase * 9) % 3);
}

function padded(rect, padding = 4) {
  return {
    x: Math.max(0, rect.x - padding),
    y: Math.max(0, rect.y - padding),
    w: rect.w + padding * 2,
    h: rect.h + padding * 2
  };
}

export function preloadCharacterSprites() {
  const images = new Map();
  if (typeof Image === 'undefined') return images;
  const image = new Image();
  image.decoding = 'async';
  image.src = ATLAS_URL;
  image.addEventListener('error', () => console.error('Could not load chibi atlas:', ATLAS_URL), { once: true });
  images.set('chibi', image);
  return images;
}

export function drawCharacterSprite(ctx, images, person, animationClock, options = {}) {
  if (!ctx || !images || !person) return null;
  const image = images.get('chibi');
  if (!image?.complete || !image.naturalWidth) return null;

  const stage = STAGE_STYLE[person.stage] ? person.stage : 'adult';
  const style = STAGE_STYLE[stage];
  const pose = options.pose || 'standing';

  // The current essential sheet has natural movement and seated poses.
  // Sleeping keeps the existing horizontal renderer so beds are not duplicated.
  if (pose === 'sleeping') return null;

  let source;
  let targetHeight = style.height;
  let groundOffset = style.groundOffset;

  const direction = pose === 'sitting' ? 'down' : directionOf(person.dir);
  const frame = pose === 'sitting' ? 0 : frameOf(person, animationClock);
  source = padded(MOVEMENT[style.family][direction][frame], 4);
  if (pose === 'sitting') {
    targetHeight *= 0.78;
    groundOffset = Math.max(7, groundOffset - 2);
  }

  const drawWidth = source.w * (targetHeight / source.h);
  const x = Math.round(person.x);
  const groundY = Math.round(person.y + groundOffset + (pose === 'sitting' ? 3 : 0));
  const dx = Math.round(x - drawWidth / 2);
  const dy = Math.round(groundY - targetHeight);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = 'rgba(23,32,51,.14)';
  ctx.beginPath();
  ctx.ellipse(x, groundY - 1, Math.max(5, drawWidth * 0.25), Math.max(2, targetHeight * 0.045), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(image, source.x, source.y, source.w, source.h, dx, dy, drawWidth, targetHeight);

  if (options.highlight) {
    ctx.strokeStyle = '#f5cf73';
    ctx.lineWidth = 2;
    ctx.strokeRect(dx - 2, dy - 2, drawWidth + 4, targetHeight + 4);
  }
  ctx.restore();

  return {
    x,
    y: dy + targetHeight / 2,
    width: drawWidth + 6,
    height: targetHeight + 6
  };
}
