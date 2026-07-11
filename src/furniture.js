const ASSET_ROOT = 'assets/furniture';

/**
 * V7.1 furniture art catalog.
 * Each entry points to one of the user's provided sprites after extraction to PNG.
 * `fit` controls how the art is drawn inside the logical collision footprint.
 */
export const FURNITURE_SPRITES = {
  bed_single_oak: { path: `${ASSET_ROOT}/bed_single_oak.png`, fit: 'contain' },
  bed_single_green: { path: `${ASSET_ROOT}/bed_single_green.png`, fit: 'contain' },
  bed_double_rose: { path: `${ASSET_ROOT}/bed_double_rose.png`, fit: 'contain' },
  bed_double_blue: { path: `${ASSET_ROOT}/bed_double_blue.png`, fit: 'contain' },
  crib_wood: { path: `${ASSET_ROOT}/crib_wood.png`, fit: 'contain' },
  bunk_wood: { path: `${ASSET_ROOT}/bunk_wood.png`, fit: 'contain' },
  nightstand_wood: { path: `${ASSET_ROOT}/nightstand_wood.png`, fit: 'contain' },
  dresser_wood: { path: `${ASSET_ROOT}/dresser_wood.png`, fit: 'contain' },
  wardrobe_wood: { path: `${ASSET_ROOT}/wardrobe_wood.png`, fit: 'contain' },
  desk_wood: { path: `${ASSET_ROOT}/desk_wood.png`, fit: 'contain' },
  rug_blue_small: { path: `${ASSET_ROOT}/rug_blue_small.png`, fit: 'stretch' },
  rug_round_jute: { path: `${ASSET_ROOT}/rug_round_jute.png`, fit: 'stretch' },
  lamp_floor_tripod: { path: `${ASSET_ROOT}/lamp_floor_tripod.png`, fit: 'contain' },
  plant_monstera: { path: `${ASSET_ROOT}/plant_monstera.png`, fit: 'contain' },
  plant_rubber: { path: `${ASSET_ROOT}/plant_rubber.png`, fit: 'contain' },
  sofa_cream_3: { path: `${ASSET_ROOT}/sofa_cream_3.png`, fit: 'contain' },
  sofa_green_3: { path: `${ASSET_ROOT}/sofa_green_3.png`, fit: 'contain' },
  sofa_blue_3: { path: `${ASSET_ROOT}/sofa_blue_3.png`, fit: 'contain' },
  sofa_cream_2: { path: `${ASSET_ROOT}/sofa_cream_2.png`, fit: 'contain' },
  armchair_cream: { path: `${ASSET_ROOT}/armchair_cream.png`, fit: 'contain' },
  armchair_green: { path: `${ASSET_ROOT}/armchair_green.png`, fit: 'contain' },
  sectional_cream: { path: `${ASSET_ROOT}/sectional_cream.png`, fit: 'contain' },
  coffee_table_rect: { path: `${ASSET_ROOT}/coffee_table_rect.png`, fit: 'contain' },
  coffee_table_oval: { path: `${ASSET_ROOT}/coffee_table_oval.png`, fit: 'contain' },
  tv_console_wood: { path: `${ASSET_ROOT}/tv_console_wood.png`, fit: 'contain' },
  bookshelf_low: { path: `${ASSET_ROOT}/bookshelf_low.png`, fit: 'contain' },
  rug_cream_large: { path: `${ASSET_ROOT}/rug_cream_large.png`, fit: 'stretch' },
  rug_blue_large: { path: `${ASSET_ROOT}/rug_blue_large.png`, fit: 'stretch' },
  lamp_arc: { path: `${ASSET_ROOT}/lamp_arc.png`, fit: 'contain' },
  wall_art_landscape: { path: `${ASSET_ROOT}/wall_art_landscape.png`, fit: 'contain' }
};

export const BED_FURNITURE_IDS = new Set([
  'parentBed', 'toddlerBed', 'childBed', 'siblingBed', 'teenBed', 'upperBedA',
  'upperBedB', 'nannyBed', 'apartmentBed', 'roommateBed', 'guestBed', 'bunkBed'
]);

export const FURNITURE_META = {
  parentBed: { category: 'bed', footprint: [3.2, 3.2], roomTypes: ['parentBedroom', 'adultBedroom'], sleepSlots: ['left', 'right'] },
  toddlerBed: { category: 'bed', footprint: [2.0, 2.6], roomTypes: ['childBedroom', 'parentBedroom'], sleepSlots: ['center'] },
  childBed: { category: 'bed', footprint: [2.0, 3.0], roomTypes: ['childBedroom', 'teenBedroom'], sleepSlots: ['center'] },
  siblingBed: { category: 'bed', footprint: [2.0, 3.0], roomTypes: ['childBedroom'], sleepSlots: ['center'] },
  bunkBed: { category: 'bed', footprint: [2.6, 3.2], roomTypes: ['childBedroom'], sleepSlots: ['top', 'bottom'] },
  teenBed: { category: 'bed', footprint: [2.0, 3.0], roomTypes: ['teenBedroom'], sleepSlots: ['center'] },
  upperBedA: { category: 'bed', footprint: [2.0, 3.0], roomTypes: ['upperBedroomA'], sleepSlots: ['center'] },
  upperBedB: { category: 'bed', footprint: [2.0, 3.0], roomTypes: ['upperBedroomB'], sleepSlots: ['center'] },
  nannyBed: { category: 'bed', footprint: [2.0, 3.0], roomTypes: ['upperBedroomB', 'teenBedroom'], sleepSlots: ['center'] },
  apartmentBed: { category: 'bed', footprint: [2.3, 3.0], roomTypes: ['adultBedroom'], sleepSlots: ['center'] },
  roommateBed: { category: 'bed', footprint: [2.0, 3.0], roomTypes: ['roommateBedroom'], sleepSlots: ['center'] },
  guestBed: { category: 'bed', footprint: [2.0, 3.0], roomTypes: ['guestBedroom'], sleepSlots: ['center'] },
  crib: { category: 'crib', footprint: [2.0, 2.2], roomTypes: ['parentBedroom', 'nursery'], sleepSlots: ['center'] },
  dresser: { category: 'storage', footprint: [2.0, 1.3], roomTypes: ['parentBedroom', 'childBedroom', 'teenBedroom', 'adultBedroom'] },
  wardrobe: { category: 'storage', footprint: [2.0, 1.4], roomTypes: ['parentBedroom', 'childBedroom', 'teenBedroom', 'adultBedroom'] },
  studyDesk: { category: 'desk', footprint: [2.4, 1.8], roomTypes: ['childBedroom', 'teenBedroom', 'adultBedroom', 'upperHobbyRoom'] },
  sofa: { category: 'seating', footprint: [4.0, 2.0], roomTypes: ['livingRoom'] },
  armchair: { category: 'seating', footprint: [1.8, 1.8], roomTypes: ['livingRoom', 'adultBedroom'] },
  coffeeTable: { category: 'table', footprint: [2.5, 1.5], roomTypes: ['livingRoom'] },
  television: { category: 'media', footprint: [3.4, 1.4], roomTypes: ['livingRoom'] },
  bookshelf: { category: 'storage', footprint: [2.5, 1.4], roomTypes: ['livingRoom', 'childBedroom', 'teenBedroom', 'upperHobbyRoom'] },
  rug: { category: 'decor', footprint: [4.5, 3.0], roomTypes: ['livingRoom', 'parentBedroom', 'childBedroom'], solid: false },
  plant: { category: 'decor', footprint: [1.1, 1.1], roomTypes: ['livingRoom', 'parentBedroom', 'adultBedroom'], solid: false },
  floorLamp: { category: 'decor', footprint: [1.0, 1.5], roomTypes: ['livingRoom', 'parentBedroom', 'adultBedroom'], solid: false },
  wallArt: { category: 'decor', footprint: [2.0, 1.3], roomTypes: ['livingRoom', 'parentBedroom', 'adultBedroom'], solid: false },
  laundryBasket: { category: 'utility', footprint: [1.2, 1.2], roomTypes: ['bathroom', 'parentBedroom', 'childBedroom', 'adultBedroom'] }
};

function stableHash(value = '') {
  let hash = 2166136261;
  for (let i = 0; i < String(value).length; i += 1) {
    hash ^= String(value).charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function pickStable(values, key) {
  return values[stableHash(key) % values.length];
}

export function ensureHomeStyle(home, state = null) {
  if (home.styleProfile) return home.styleProfile;
  const tier = state?.household?.tier || 2;
  const vibes = tier >= 5 ? ['elegant', 'modern', 'cozy'] : tier >= 3 ? ['cozy', 'practical', 'traditional'] : ['practical', 'mixed', 'simple'];
  home.styleProfile = {
    vibe: pickStable(vibes, `${home.layoutId || home.id || 'home'}-${tier}`),
    palette: pickStable(['blue', 'green', 'cream', 'rose'], `${home.layoutId || home.id || 'home'}-palette`),
    clutter: tier <= 2 ? 0.52 : tier >= 5 ? 0.18 : 0.34
  };
  return home.styleProfile;
}

export function resolveFurnitureSprite(item, state) {
  if (!item) return null;
  if (item.spriteKey && FURNITURE_SPRITES[item.spriteKey]) return item.spriteKey;
  const home = state?.household?.home || {};
  const style = ensureHomeStyle(home, state);
  const seed = `${home.layoutId || home.id || 'home'}-${item.instanceId || item.id}-${style.palette}`;

  let key = null;
  if (item.id === 'parentBed') key = style.palette === 'rose' ? 'bed_double_rose' : 'bed_double_blue';
  else if (['childBed', 'siblingBed', 'teenBed', 'upperBedA', 'upperBedB', 'nannyBed', 'apartmentBed', 'roommateBed', 'guestBed'].includes(item.id)) {
    key = style.palette === 'green' ? 'bed_single_green' : 'bed_single_oak';
  } else if (item.id === 'toddlerBed') key = 'bed_single_green';
  else if (item.id === 'bunkBed') key = 'bunk_wood';
  else if (item.id === 'crib') key = 'crib_wood';
  else if (item.id === 'dresser') key = 'dresser_wood';
  else if (item.id === 'wardrobe') key = 'wardrobe_wood';
  else if (item.id === 'studyDesk') key = 'desk_wood';
  else if (item.id === 'sofa') {
    const sofas = style.vibe === 'elegant' ? ['sofa_blue_3', 'sofa_cream_3'] : style.palette === 'green' ? ['sofa_green_3', 'sofa_cream_3'] : ['sofa_cream_3', 'sofa_blue_3'];
    key = pickStable(sofas, seed);
  } else if (item.id === 'armchair') key = style.palette === 'green' ? 'armchair_green' : 'armchair_cream';
  else if (item.id === 'coffeeTable') key = style.vibe === 'modern' ? 'coffee_table_oval' : 'coffee_table_rect';
  else if (item.id === 'television') key = 'tv_console_wood';
  else if (item.id === 'bookshelf') key = 'bookshelf_low';
  else if (item.id === 'rug') key = style.palette === 'blue' ? 'rug_blue_large' : style.vibe === 'traditional' ? 'rug_round_jute' : 'rug_cream_large';
  else if (item.id === 'floorLamp') key = style.vibe === 'modern' ? 'lamp_arc' : 'lamp_floor_tripod';
  else if (item.id === 'plant') key = pickStable(['plant_monstera', 'plant_rubber'], seed);
  else if (item.id === 'wallArt') key = 'wall_art_landscape';

  if (key) item.spriteKey = key;
  return key;
}

export function ensureFurnitureVisuals(state) {
  const home = state?.household?.home;
  if (!home) return;
  ensureHomeStyle(home, state);
  for (const item of home.furniture || []) resolveFurnitureSprite(item, state);
}

export function preloadFurnitureSprites() {
  const images = new Map();
  if (typeof Image === 'undefined') return images;
  for (const [key, info] of Object.entries(FURNITURE_SPRITES)) {
    const image = new Image();
    image.decoding = 'async';
    image.src = info.path;
    images.set(key, image);
  }
  return images;
}

export function drawFurnitureSprite(ctx, image, info, rect) {
  if (!image || !image.complete || !image.naturalWidth) return false;
  const { x, y, w, h } = rect;
  if (info?.fit === 'stretch') {
    ctx.drawImage(image, x, y, w, h);
    return true;
  }
  const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
  const dw = image.naturalWidth * scale;
  const dh = image.naturalHeight * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + h - dh;
  ctx.drawImage(image, dx, dy, dw, dh);
  return true;
}

export function furnitureMeta(id) {
  return FURNITURE_META[id] || (BED_IDS.has(id) ? FURNITURE_META.childBed : null);
}
