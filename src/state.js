import {
  SAVE_KEY, LEGACY_SAVE_KEYS, SAVE_VERSION, TOWN_SLOTS, LOCATION_TYPES, LOCATION_LABELS,
  LOCATION_COLORS, JOBS, HOBBIES, HOUSE_PURCHASES, HOME_ANCHORS, TILE
} from './config.js';
import { NAMES } from './data.js';
import {
  RNG, clamp, stageForAge, storageGet, storageSet, storageRemove, safeText, deepClone
} from './utils.js';

function createTraits(rng) {
  return {
    patience: rng.int(12, 96),
    impulsiveness: rng.int(6, 92),
    warmth: rng.int(18, 98),
    workEthic: rng.int(18, 98),
    strictness: rng.int(8, 92),
    responsibility: rng.int(15, 98),
    sociability: rng.int(12, 96),
    creativity: rng.int(10, 96),
    frugality: rng.int(8, 96),
    familyFocus: rng.int(12, 98)
  };
}

function selectHobbies(rng, traits, count = 2) {
  const pool = [...HOBBIES];
  const selected = [];
  while (pool.length && selected.length < count) {
    const hobby = rng.weighted(pool, item => 20 + (traits[item.trait] || 50));
    selected.push(hobby.id);
    pool.splice(pool.indexOf(hobby), 1);
  }
  return selected;
}

function chooseJob(rng, traits, parentIndex, parentCount) {
  let pool = JOBS;
  if (parentCount === 1) pool = JOBS.filter(job => job.id !== 'caregiver');
  if (parentCount === 2 && parentIndex === 1 && traits.familyFocus > 80 && rng.chance(0.32)) {
    return deepClone(JOBS.find(job => job.id === 'caregiver'));
  }
  return deepClone(rng.weighted(pool, job => {
    const educationFit = 100 - Math.abs(job.education - ((traits.workEthic + traits.responsibility) / 2));
    const scheduleFit = job.schedule === 'night' ? traits.impulsiveness * 0.4 : traits.responsibility * 0.35;
    return Math.max(8, educationFit + scheduleFit);
  }));
}

export function createParent(rng, index, familyName, parentCount) {
  const traits = createTraits(rng);
  const job = chooseJob(rng, traits, index, parentCount);
  return {
    id: `parent-${rng.int(100000, 999999)}-${index}`,
    name: `${rng.pick(NAMES.adult)} ${familyName}`,
    role: 'Parent',
    age: rng.int(23, 40),
    stage: 'adult',
    traits,
    revealedTraits: Object.keys(traits),
    hobbies: selectHobbies(rng, traits, rng.int(2, 3)),
    job,
    payBonus: 0,
    needs: {
      health: rng.int(72, 96), energy: rng.int(58, 90), satiety: rng.int(55, 90),
      hygiene: rng.int(55, 92), comfort: rng.int(55, 90), mood: rng.int(48, 88), stress: rng.int(8, 48)
    },
    struggle: rng.chance(0.12) ? rng.pick(['burnout', 'low mood', 'addiction risk']) : null,
    location: 'home',
    x: (8 + index * 3) * TILE + 16,
    y: 6 * TILE + 16,
    dir: 'down',
    moving: false,
    currentGoal: null,
    activity: { type: 'waiting', remaining: 1, startedStamp: 0 },
    route: null,
    scheduleOverride: null,
    shift: null,
    completedShiftKeys: [],
    lastDecisionStamp: -999,
    lastCareStamp: -999,
    lastPurchaseStamp: -999,
    relationships: [],
    socialPlans: [],
    alive: true
  };
}

function createPlayer(rng, playerName, familyName) {
  return {
    id: `player-${rng.int(100000, 999999)}`,
    name: `${safeText(playerName, rng.pick(NAMES.first))} ${familyName}`,
    role: 'Player',
    age: 0,
    stage: 'baby',
    generation: 1,
    traits: [],
    traitSeeds: createTraits(rng),
    development: {
      bonding: 50, stimulation: 35, stressExposure: 8, curiosity: 10,
      resilience: 35, grades: 50, independence: 10, socialConfidence: 35
    },
    needs: { health: 94, energy: 80, satiety: 78, hygiene: 82, comfort: 76, mood: 78, stress: 8 },
    location: 'home',
    x: 7.2 * TILE,
    y: 3.8 * TILE,
    dir: 'down',
    moving: false,
    controlMode: 'auto',
    autoEnabled: true,
    stoppedByPlayer: false,
    guidedGoal: null,
    currentGoal: null,
    activity: { type: 'waiting', remaining: 1, startedStamp: 0 },
    route: null,
    carriedBy: null,
    crying: false,
    cryPower: 0,
    school: { attendedDay: -1, grades: 50, truancy: 0, incidents: 0 },
    career: { job: null, payBonus: 0, completedShiftKeys: [] },
    relationships: [],
    children: [],
    partner: null,
    alive: true,
    causeOfDeath: null
  };
}

function wealthFromParents(rng, parents) {
  const workScore = parents.reduce((sum, parent) => sum + parent.traits.workEthic + parent.traits.responsibility, 0) / (parents.length * 2);
  const employed = parents.filter(parent => parent.job?.pay?.[1] > 0).length;
  const score = workScore + rng.int(-24, 24) + employed * 7 - (parents.length === 1 ? 10 : 0);
  if (score < 34) return { tier: 1, label: 'Severe hardship', money: rng.int(90, 230), food: rng.int(3, 6) };
  if (score < 50) return { tier: 2, label: 'Low income', money: rng.int(230, 520), food: rng.int(5, 9) };
  if (score < 67) return { tier: 3, label: 'Working class', money: rng.int(520, 980), food: rng.int(7, 13) };
  if (score < 82) return { tier: 4, label: 'Middle class', money: rng.int(1000, 1900), food: rng.int(10, 17) };
  return { tier: 5, label: 'Wealthy', money: rng.int(2200, 4200), food: rng.int(13, 22) };
}

function room(id, label, x, y, w, h, active = true) {
  return { id, label, x, y, w, h, active };
}

function furniture(id, roomId, essential = false, condition = 100) {
  return { id, room: roomId, essential, condition, delivered: true };
}

export function buildHome(rng, wealth) {
  const hasSofa = wealth.tier >= 4;
  const hasRug = wealth.tier >= 3;
  const hasBookshelf = wealth.tier >= 3;
  const hasPlant = wealth.tier >= 5;
  const hasTelevision = wealth.tier >= 4;
  const rooms = [
    room('parentBedroom', 'Parent bedroom', 1, 1, 11, 7),
    room('kitchen', 'Kitchen', 13, 1, 8, 7),
    room('livingRoom', 'Living room', wealth.tier >= 5 ? 11 : 1, 9, wealth.tier >= 5 ? 4 : 13, 8),
    room('diningRoom', 'Dining area', 15, 9, 6, 8),
    room('childBedroom', 'Shared child bedroom', 1, 9, 9, 8, wealth.tier >= 5),
    room('teenBedroom', 'Teen bedroom', 1, 9, 9, 8, false)
  ];
  const items = [
    furniture('parentBed', 'parentBedroom', true),
    furniture('crib', 'parentBedroom', true),
    furniture('dresser', 'parentBedroom', true),
    furniture('fridge', 'kitchen', true, rng.int(65, 98)),
    furniture('stove', 'kitchen', true, rng.int(62, 98)),
    furniture('counter', 'kitchen', true),
    furniture('basicTable', 'diningRoom', true)
  ];
  if (hasSofa) items.push(furniture('sofa', 'livingRoom'));
  if (hasRug) items.push(furniture('rug', 'livingRoom'));
  if (hasBookshelf) items.push(furniture('bookshelf', 'livingRoom'));
  if (hasPlant) items.push(furniture('plant', 'livingRoom'));
  if (hasTelevision) items.push(furniture('television', 'livingRoom'));
  return {
    tier: wealth.tier,
    label: wealth.label,
    condition: rng.int(58, 94),
    cleanliness: rng.int(48, 90),
    decorLevel: Math.max(0, wealth.tier - 2),
    wallPaint: wealth.tier >= 4,
    rooms,
    furniture: items,
    wishlist: [],
    deliveries: [],
    construction: null,
    purchaseHistory: [],
    lastEvaluationDay: -1
  };
}

export function generateTown(rng) {
  const slots = rng.shuffle(TOWN_SLOTS);
  const labels = {
    home: 'Family Home',
    school: rng.pick(NAMES.schools),
    workplace: rng.pick(NAMES.workplaces),
    grocery: rng.pick(NAMES.stores),
    park: 'Willow Park',
    hospital: 'Community Hospital',
    social: 'Family Services',
    furniture: rng.pick(NAMES.furniture),
    community: rng.pick(NAMES.community)
  };
  const locations = LOCATION_TYPES.map((type, index) => {
    const slot = slots[index];
    return {
      ...slot,
      type,
      name: labels[type] || LOCATION_LABELS[type],
      color: LOCATION_COLORS[type],
      doorX: slot.x + Math.floor(slot.w / 2),
      doorY: slot.y + slot.h,
      residents: []
    };
  });
  return { name: rng.pick(NAMES.towns), locations, households: [], residents: [] };
}

function createResident(rng, household, memberIndex) {
  const ageBands = household.ageBands;
  const age = ageBands[memberIndex] ?? rng.int(1, 78);
  const stage = stageForAge(age);
  const traits = createTraits(rng);
  const isAdult = ['adult', 'elder'].includes(stage);
  const job = isAdult && stage !== 'elder' ? chooseJob(rng, traits, memberIndex, household.size) : null;
  return {
    id: `resident-${rng.int(100000, 999999)}-${memberIndex}`,
    householdId: household.id,
    name: `${stage === 'adult' || stage === 'elder' ? rng.pick(NAMES.adult) : rng.pick(NAMES.first)} ${household.familyName}`,
    age,
    stage,
    traits,
    hobbies: selectHobbies(rng, traits, rng.int(1, 3)),
    job,
    school: ['child', 'teen'].includes(stage),
    homeSlot: household.homeSlot,
    location: 'home',
    x: rng.int(3, 19) * TILE + 16,
    y: rng.int(3, 15) * TILE + 16,
    dir: rng.pick(['down', 'up', 'left', 'right']),
    activity: 'home',
    phase: rng.float(0, Math.PI * 2),
    socialCircle: [],
    alive: true
  };
}

export function generateResidents(rng, town, count = 30) {
  const households = [];
  const residents = [];
  let remaining = count;
  const householdCount = 9;
  for (let index = 0; index < householdCount; index += 1) {
    const size = index === householdCount - 1 ? remaining : Math.min(remaining, rng.int(2, 5));
    remaining -= size;
    const familyName = rng.pick(NAMES.family);
    const household = {
      id: `town-household-${index}-${rng.int(100, 999)}`,
      familyName,
      size,
      homeSlot: index,
      ageBands: []
    };
    if (size >= 1) household.ageBands.push(rng.int(24, 70));
    if (size >= 2) household.ageBands.push(rng.chance(0.72) ? rng.int(24, 70) : rng.int(2, 18));
    while (household.ageBands.length < size) household.ageBands.push(rng.int(1, 19));
    households.push(household);
    for (let member = 0; member < size; member += 1) residents.push(createResident(rng, household, member));
    if (remaining <= 0) break;
  }
  while (residents.length < count) {
    const household = rng.pick(households);
    residents.push(createResident(rng, household, household.size++));
  }
  for (const resident of residents) {
    const candidates = rng.shuffle(residents.filter(other => other.id !== resident.id && Math.abs(other.age - resident.age) < 12));
    resident.socialCircle = candidates.slice(0, rng.int(1, 4)).map(other => other.id);
  }
  town.households = households;
  town.residents = residents;
  return residents;
}

function createInitialState(playerName, seed) {
  const rng = new RNG(seed);
  const familyName = rng.pick(NAMES.family);
  const parentCount = rng.chance(0.22) ? 1 : 2;
  const parents = Array.from({ length: parentCount }, (_, index) => createParent(rng, index, familyName, parentCount));
  const wealth = wealthFromParents(rng, parents);
  const player = createPlayer(rng, playerName, familyName);
  const town = generateTown(rng);
  generateResidents(rng, town, rng.int(27, 34));
  const home = buildHome(rng, wealth);
  const averageFamilyFocus = parents.reduce((sum, parent) => sum + parent.traits.familyFocus, 0) / parents.length;
  const desiredChildren = parentCount === 2
    ? clamp(1 + Math.round((averageFamilyFocus - 25) / 30), 1, 4)
    : 1;
  return {
    version: SAVE_VERSION,
    seed: String(seed),
    rngState: rng.state,
    createdAt: Date.now(),
    time: { totalDays: 0, day: 1, minute: 7 * 60, ageClock: 0, lastSummaryMinute: 7 * 60 },
    speedIndex: 0,
    scene: 'home',
    player,
    parents,
    siblings: [],
    family: {
      relationship: parentCount === 2 ? { affection: rng.int(42, 88), trust: rng.int(40, 90), tension: rng.int(5, 42) } : null,
      desiredChildren,
      pregnancy: null,
      planningCooldownUntil: 5,
      lastPlanningCheck: -1
    },
    household: {
      tier: wealth.tier,
      label: wealth.label,
      money: wealth.money,
      food: wealth.food,
      reports: 0,
      home,
      finances: {
        weekIncome: 0,
        weekExpenses: 0,
        lifetimeIncome: 0,
        lifetimeExpenses: 0,
        lastRentWeek: -1,
        lastUtilitiesWeek: -1,
        nextBillsDay: 6,
        ledger: []
      }
    },
    town,
    familyTree: [
      ...parents.map(parent => ({ id: parent.id, name: parent.name, generation: 0, parentIds: [], children: [player.id], alive: true })),
      { id: player.id, name: player.name, generation: 1, parentIds: parents.map(parent => parent.id), children: [], alive: true }
    ],
    notifications: { history: [], fastSummary: {}, lastRoutineRealTime: 0 },
    events: { lastEventDay: -2, cooldowns: {} },
    flags: { tutorialShown: false, directControlUsed: false, stageMessages: [] },
    log: [{ stamp: 0, day: 1, text: `${player.name} was born into the ${familyName} family.`, type: 'important' }]
  };
}

export function createNewGame(playerName, seed) {
  const normalizedSeed = safeText(seed, `${Date.now()}-${Math.floor(Math.random() * 999999)}`);
  return createInitialState(playerName, normalizedSeed);
}

export function hasFurniture(state, id) {
  return state.household.home.furniture.some(item => item.id === id && item.delivered !== false);
}

export function addFurniture(state, id, roomId = null) {
  if (hasFurniture(state, id)) return false;
  const purchase = HOUSE_PURCHASES.find(item => item.id === id);
  const resolvedRoom = roomId || purchase?.room || 'livingRoom';
  state.household.home.furniture.push({ id, room: resolvedRoom, essential: Boolean(purchase?.priority >= 80), condition: 100, delivered: true });
  return true;
}

export function getActiveRooms(state) {
  return state.household.home.rooms.filter(roomItem => roomItem.active);
}

export function roomExists(state, id) {
  return state.household.home.rooms.some(roomItem => roomItem.id === id && roomItem.active);
}

export function activateRoom(state, id) {
  const target = state.household.home.rooms.find(roomItem => roomItem.id === id);
  if (!target) return false;
  target.active = true;
  if (id === 'childBedroom' || id === 'teenBedroom') {
    if (id === 'teenBedroom') {
      const childRoom = state.household.home.rooms.find(roomItem => roomItem.id === 'childBedroom');
      if (childRoom) childRoom.active = false;
    }
    const living = state.household.home.rooms.find(roomItem => roomItem.id === 'livingRoom');
    if (living) {
      living.x = 11;
      living.w = 4;
    }
  }
  return true;
}

export function createSibling(state, rng) {
  const familyName = state.player.name.split(' ').at(-1);
  const sibling = {
    id: `sibling-${rng.int(100000, 999999)}`,
    name: `${rng.pick(NAMES.first)} ${familyName}`,
    role: 'Sibling',
    age: 0,
    stage: 'baby',
    traits: [],
    traitSeeds: createTraits(rng),
    development: { bonding: 50, stimulation: 35, stressExposure: 7, curiosity: 8, resilience: 35, grades: 50 },
    needs: { health: rng.int(86, 98), energy: 82, satiety: 80, hygiene: 82, comfort: 76, mood: 80, stress: 5 },
    location: 'home', x: 7.3 * TILE, y: 4.2 * TILE, dir: 'down', moving: false,
    currentGoal: null, activity: { type: 'sleeping', remaining: 4, startedStamp: 0 }, route: null,
    school: { attendedDay: -1, grades: 50 }, relationships: [], alive: true
  };
  state.siblings.push(sibling);
  state.familyTree.push({ id: sibling.id, name: sibling.name, generation: 1, parentIds: state.parents.map(parent => parent.id), children: [], alive: true });
  for (const parent of state.parents) {
    const node = state.familyTree.find(item => item.id === parent.id);
    if (node && !node.children.includes(sibling.id)) node.children.push(sibling.id);
  }
  return sibling;
}

export function ensureStateShape(state) {
  if (!state || typeof state !== 'object') return null;
  state.version = SAVE_VERSION;
  state.speedIndex ??= 0;
  state.scene ??= 'home';
  state.siblings ??= [];
  state.family ??= { relationship: null, desiredChildren: 1, pregnancy: null, planningCooldownUntil: 5, lastPlanningCheck: -1 };
  state.family.desiredChildren ??= 2;
  state.family.planningCooldownUntil ??= state.time?.totalDays + 5;
  state.household.finances ??= { weekIncome: 0, weekExpenses: 0, lifetimeIncome: 0, lifetimeExpenses: 0, lastRentWeek: -1, lastUtilitiesWeek: -1, nextBillsDay: 6, ledger: [] };
  state.household.finances.ledger ??= [];
  state.household.home ??= buildHome(new RNG(state.seed, state.rngState), { tier: state.household.tier || 2, label: state.household.label || 'Low income' });
  state.household.home.wishlist ??= [];
  state.household.home.deliveries ??= [];
  state.household.home.purchaseHistory ??= [];
  state.notifications ??= { history: [], fastSummary: {}, lastRoutineRealTime: 0 };
  state.notifications.history ??= [];
  state.notifications.fastSummary ??= {};
  state.events ??= { lastEventDay: -2, cooldowns: {} };
  state.flags ??= { tutorialShown: false, directControlUsed: false, stageMessages: [] };
  state.log ??= [];
  state.town.residents ??= [];
  state.town.households ??= [];
  for (const person of [state.player, ...state.parents, ...state.siblings]) {
    person.currentGoal ??= null;
    person.activity ??= { type: 'waiting', remaining: 1, startedStamp: 0 };
    person.route ??= null;
    person.dir ??= 'down';
    person.moving ??= false;
    person.needs.stress ??= 10;
  }
  state.player.controlMode ??= 'auto';
  state.player.autoEnabled ??= true;
  state.player.stoppedByPlayer ??= false;
  state.player.guidedGoal ??= null;
  for (const parent of state.parents) {
    parent.completedShiftKeys ??= [];
    parent.hobbies ??= ['reading'];
    parent.traits.familyFocus ??= 50;
    parent.traits.creativity ??= 50;
    parent.traits.frugality ??= 50;
    parent.payBonus ??= 0;
  }
  return state;
}

export function saveGame(state) {
  state.version = SAVE_VERSION;
  return storageSet(SAVE_KEY, JSON.stringify(state));
}

export function loadGame() {
  const raw = storageGet(SAVE_KEY);
  if (!raw) return null;
  try {
    return ensureStateShape(JSON.parse(raw));
  } catch (error) {
    console.error('Failed to load save', error);
    storageRemove(SAVE_KEY);
    return null;
  }
}

export function hasSave() {
  return Boolean(storageGet(SAVE_KEY));
}

export function hasLegacySave() {
  return LEGACY_SAVE_KEYS.some(key => Boolean(storageGet(key)));
}

export function deleteSave() {
  storageRemove(SAVE_KEY);
}

export function clearLegacySaves() {
  LEGACY_SAVE_KEYS.forEach(storageRemove);
}

export function getFurnitureAnchor(item) {
  const roomAnchors = HOME_ANCHORS[item.room] || HOME_ANCHORS.livingRoom;
  if (item.id === 'parentBed') return HOME_ANCHORS.parentBedroom.bed;
  if (item.id === 'basicTable') return HOME_ANCHORS.diningRoom.diningSet;
  return roomAnchors[item.id] || HOME_ANCHORS.livingRoom[item.id] || { x: 10, y: 10, w: 1, h: 1, facing: 'down' };
}
