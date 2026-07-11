import { clamp, seededPhase } from './utils.js';
import { drawCharacterSprite } from './characterSprites.js?v=80';

export const SKIN_TONES = ['#f6d0ac', '#e8b788', '#cf8f5f', '#a86542', '#6f3f2b'];
export const HAIR_COLORS = ['#241b18', '#3b2923', '#60402c', '#8a5737', '#c28a52', '#9f4b31', '#c8c2b9'];
export const TOP_COLORS = ['#7198ab', '#d98972', '#7f9a70', '#d5ae65', '#7d7399', '#8b6b56', '#567b8a', '#b9758b'];
export const BOTTOM_COLORS = ['#26384a', '#514a45', '#35516c', '#6d5a47', '#42464f', '#6b7580'];
export const HAIR_STYLES = ['short', 'messy', 'sidepart', 'curly', 'bob', 'long', 'ponytail', 'bun', 'braid'];
export const ACCESSORIES = ['none', 'none', 'none', 'glasses', 'cap', 'headband', 'watch', 'backpack'];

function nearbyIndex(rng, base, length) {
  if (base == null || rng.chance(0.28)) return rng.int(0, length - 1);
  return clamp(base + rng.int(-1, 1), 0, length - 1);
}

export function createAppearance(rng, stage = 'adult', familyHint = null, role = 'resident') {
  const presentation = rng.chance(0.5) ? 'masculine' : 'feminine';
  const skinIndex = nearbyIndex(rng, familyHint?.skinIndex, SKIN_TONES.length);
  let hairIndex = nearbyIndex(rng, familyHint?.hairIndex, HAIR_COLORS.length - (stage === 'elder' ? 0 : 1));
  if (stage === 'elder' && rng.chance(0.72)) hairIndex = HAIR_COLORS.length - 1;
  let hairStyle = rng.pick(HAIR_STYLES);
  if (stage === 'baby') hairStyle = rng.chance(0.7) ? 'none' : 'short';
  if (stage === 'toddler' && ['bun', 'braid'].includes(hairStyle)) hairStyle = 'bob';
  if (presentation === 'masculine' && ['long', 'ponytail', 'bun', 'braid'].includes(hairStyle) && rng.chance(0.7)) hairStyle = rng.pick(['short', 'messy', 'sidepart', 'curly']);
  const accessory = stage === 'baby' ? 'none' : role === 'Nanny' ? 'watch' : rng.pick(ACCESSORIES);
  return {
    presentation,
    skinIndex,
    skin: SKIN_TONES[skinIndex],
    hairIndex,
    hair: HAIR_COLORS[hairIndex],
    hairStyle,
    top: role === 'Nanny' ? '#8da3a1' : rng.pick(TOP_COLORS),
    bottom: rng.pick(BOTTOM_COLORS),
    accessory,
    eye: rng.pick(['round', 'soft', 'focused']),
    mouth: rng.pick(['neutral', 'smile', 'soft'])
  };
}

export function evolveAppearance(rng, person, nextStage) {
  const previous = person.appearance || {};
  const next = createAppearance(rng, nextStage, previous, person.role || 'Resident');
  next.skinIndex = previous.skinIndex ?? next.skinIndex;
  next.skin = previous.skin || next.skin;
  if (nextStage !== 'elder' && previous.hairIndex != null) { next.hairIndex = previous.hairIndex; next.hair = previous.hair || next.hair; }
  if (nextStage === 'toddler' && previous.hairStyle === 'none') next.hairStyle = rng.pick(['short','bob','curly']);
  return next;
}

export function portraitMarkup(person, extraClass = '') {
  const appearance = person.appearance || {};
  const stage = person.stage || 'adult';
  const style = [
    `--skin:${appearance.skin || SKIN_TONES[1]}`,
    `--hair:${appearance.hair || HAIR_COLORS[1]}`,
    `--top:${appearance.top || TOP_COLORS[0]}`,
    `--bottom:${appearance.bottom || BOTTOM_COLORS[0]}`
  ].join(';');
  return `<div class="generated-portrait ${extraClass}" data-stage="${stage}" data-hair="${appearance.hairStyle || 'short'}" data-accessory="${appearance.accessory || 'none'}" style="${style}">
    <span class="portrait-hair"></span><span class="portrait-head"><i></i><b></b></span><span class="portrait-body"></span><span class="portrait-accessory"></span>
  </div>`;
}

function drawFallbackCharacter(ctx, person, animationClock, options = {}) {
  const appearance = person.appearance || {};
  const stage = person.stage || 'adult';
  const scaleMap = { baby: 0.55, toddler: 0.72, child: 0.84, teen: 0.94, adult: 1, elder: 0.94 };
  const scale = scaleMap[stage] || 1;
  const phase = person.moving ? Math.sin(animationClock * 11 + seededPhase(person.id)) : 0;
  const x = Math.round(person.x);
  const y = Math.round(person.y + (person.moving ? Math.abs(phase) * 1.5 : 0));
  const skin = appearance.skin || SKIN_TONES[1];
  const hair = appearance.hair || HAIR_COLORS[1];
  const top = appearance.top || TOP_COLORS[0];
  const bottom = appearance.bottom || BOTTOM_COLORS[0];
  const bodyW = 18 * scale;
  const headR = 9 * scale;
  const bodyH = 17 * scale;
  const dir = person.dir || 'down';
  const pose = options.pose || 'standing';

  ctx.save();
  if (pose === 'sleeping') {
    ctx.fillStyle = 'rgba(23,32,51,.16)';
    ctx.beginPath(); ctx.ellipse(x, y + 7 * scale, 17 * scale, 5 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = top; ctx.fillRect(x - 8 * scale, y - 3 * scale, 23 * scale, 13 * scale);
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(x - 12 * scale, y + 2 * scale, headR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(x - 14 * scale, y, headR, Math.PI * 0.8, Math.PI * 1.8); ctx.fill();
    ctx.fillStyle = '#172033'; ctx.font = `${Math.max(8, 10 * scale)}px ui-monospace, monospace`; ctx.fillText('z', x + 12 * scale, y - 8 * scale); ctx.fillText('Z', x + 18 * scale, y - 15 * scale);
    if (options.highlight) { ctx.strokeStyle = '#f5cf73'; ctx.lineWidth = 2; ctx.strokeRect(x - 25 * scale, y - 18 * scale, 50 * scale, 34 * scale); }
    ctx.restore();
    return { x, y, width: 52 * scale, height: 36 * scale };
  }
  if (stage === 'elder') ctx.translate(0, 1.5 * scale);
  ctx.fillStyle = 'rgba(23,32,51,.18)';
  ctx.beginPath();
  ctx.ellipse(x, y + 14 * scale, 12 * scale, 4.3 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  const legSwing = person.moving ? phase * 3.2 * scale : 0;
  ctx.fillStyle = bottom;
  ctx.fillRect(x - 7 * scale, y + 5 * scale + legSwing, 5 * scale, 10 * scale);
  ctx.fillRect(x + 2 * scale, y + 5 * scale - legSwing, 5 * scale, 10 * scale);

  const sitOffset = pose === 'sitting' ? 5 * scale : 0;
  ctx.fillStyle = top;
  ctx.fillRect(x - bodyW / 2, y - 6 * scale + sitOffset, bodyW, bodyH - sitOffset);
  ctx.fillStyle = skin;
  ctx.fillRect(x - bodyW / 2 - 4 * scale, y - 4 * scale + sitOffset, 4 * scale, 11 * scale);
  ctx.fillRect(x + bodyW / 2, y - 4 * scale + sitOffset, 4 * scale, 11 * scale);

  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x, y - 13 * scale, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hair;
  if (appearance.hairStyle !== 'none') {
    ctx.beginPath();
    ctx.arc(x, y - 15 * scale, headR + 1.5 * scale, Math.PI, Math.PI * 2);
    ctx.fill();
    if (['bob', 'long', 'ponytail', 'braid'].includes(appearance.hairStyle)) {
      ctx.fillRect(x - headR - 1, y - 15 * scale, 4 * scale, 13 * scale);
      ctx.fillRect(x + headR - 3 * scale, y - 15 * scale, 4 * scale, 13 * scale);
    }
    if (appearance.hairStyle === 'ponytail') ctx.fillRect(x + headR - 1, y - 17 * scale, 5 * scale, 12 * scale);
    if (appearance.hairStyle === 'bun') {
      ctx.beginPath(); ctx.arc(x, y - 24 * scale, 4 * scale, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (dir !== 'up') {
    ctx.fillStyle = '#172033';
    const eyeOffset = dir === 'left' ? -2.2 : dir === 'right' ? 2.2 : 0;
    ctx.fillRect(x - 4 * scale + eyeOffset * scale, y - 14 * scale, 2 * scale, 2 * scale);
    ctx.fillRect(x + 2 * scale + eyeOffset * scale, y - 14 * scale, 2 * scale, 2 * scale);
  }
  if (appearance.accessory === 'backpack') {
    ctx.fillStyle = '#586374';
    ctx.fillRect(x - bodyW / 2 - 3 * scale, y - 4 * scale, 4 * scale, 12 * scale);
  }
  if (appearance.accessory === 'cap') {
    ctx.fillStyle = '#435c76';
    ctx.fillRect(x - 8 * scale, y - 23 * scale, 16 * scale, 4 * scale);
  }
  if (options.highlight) {
    ctx.strokeStyle = '#f5cf73';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 15 * scale, y - 27 * scale, 30 * scale, 45 * scale);
  }
  ctx.restore();
  return { x, y, width: 36 * scale, height: 48 * scale };
}


export function drawTopDownCharacter(ctx, person, animationClock, options = {}, spriteImages = null) {
  const spriteBox = drawCharacterSprite(ctx, spriteImages, person, animationClock, options);
  if (spriteBox) return spriteBox;
  return drawFallbackCharacter(ctx, person, animationClock, options);
}
