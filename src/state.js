import {
  SAVE_KEY, LEGACY_SAVE_KEYS, SAVE_VERSION, TOWN_SLOTS, LOCATION_TYPES, LOCATION_LABELS,
  LOCATION_COLORS, JOBS, HOBBIES, HOUSE_PURCHASES, HOME_ANCHORS, TILE
} from './config.js';
import { NAMES } from './data.js';
import {
  RNG, clamp, stageForAge, storageGet, storageSet, storageRemove, safeText, deepClone
} from './utils.js';
import { createAppearance } from './art.js';

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
    appearance: createAppearance(rng, 'adult', null, 'Parent'),
    job,
    originalJob: deepClone(job),
    careerStatus: job.id === 'caregiver' ? 'stayHome' : 'working',
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
    appearance: createAppearance(rng, 'baby', null, 'Player'),
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

export function buildHome(rng, wealth, existingChildren = 0) {
  const hasSofa = wealth.tier >= 3;
  const hasRug = wealth.tier >= 3;
  const hasBookshelf = wealth.tier >= 3;
  const hasPlant = wealth.tier >= 4;
  const hasTelevision = wealth.tier >= 4;
  const childRoomActive = existingChildren > 0 || wealth.tier >= 4;
  const rooms = [
    room('parentBedroom', 'Parent bedroom', 1, 1, 7, 6),
    room('childBedroom', 'Shared child bedroom', 9, 1, 6, 6, childRoomActive),
    room('teenBedroom', 'Teen bedroom', 9, 1, 6, 6, false),
    room('kitchen', 'Kitchen', 16, 1, 5, 6),
    room('livingRoom', 'Living room', 1, 8, 8, 9),
    room('diningRoom', 'Dining area', 10, 8, 6, 9),
    room('bathroom', 'Bathroom', 17, 8, 4, 9)
  ];
  const items = [
    furniture('parentBed', 'parentBedroom', true),
    furniture('crib', 'parentBedroom', true),
    furniture('dresser', 'parentBedroom', true),
    furniture('fridge', 'kitchen', true, rng.int(65, 98)),
    furniture('stove', 'kitchen', true, rng.int(62, 98)),
    furniture('counter', 'kitchen', true),
    furniture('basicTable', 'diningRoom', true),
    furniture('toilet', 'bathroom', true),
    furniture('sink', 'bathroom', true),
    furniture('shower', 'bathroom', true)
  ];
  if (existingChildren > 0) items.push(furniture('childBed', 'childBedroom', true));
  if (existingChildren > 1) items.push(furniture('siblingBed', 'childBedroom', true));
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
    wishlist: [], deliveries: [], construction: null,
    purchaseHistory: [], lastEvaluationDay: -1
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
    appearance: createAppearance(rng, stage, null, 'Resident'),
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

function createExistingSibling(rng, familyName, index, familyHint, age = null) {
  const resolvedAge = age ?? rng.int(2, 16);
  const stage = stageForAge(resolvedAge);
  return {
    id: `sibling-${rng.int(100000, 999999)}-${index}`,
    name: `${rng.pick(NAMES.first)} ${familyName}`,
    role: 'Sibling',
    age: resolvedAge,
    stage,
    traits: [],
    traitSeeds: createTraits(rng),
    appearance: createAppearance(rng, stage, familyHint, 'Sibling'),
    development: { bonding: rng.int(35, 70), stimulation: rng.int(35, 70), stressExposure: rng.int(5, 35), curiosity: rng.int(25, 75), resilience: rng.int(25, 75), grades: rng.int(40, 80) },
    needs: { health: rng.int(80, 98), energy: rng.int(55, 90), satiety: rng.int(55, 90), hygiene: rng.int(55, 90), comfort: rng.int(50, 90), mood: rng.int(45, 90), stress: rng.int(5, 35) },
    location: 'home', x: (10.5 + (index % 2) * 2.2) * TILE, y: (3 + Math.floor(index / 2) * 2) * TILE,
    dir: 'down', moving: false, currentGoal: null, activity: { type: 'waiting', remaining: 1, startedStamp: 0 }, route: null,
    school: { attendedDay: -1, grades: rng.int(42, 78) }, relationships: [], alive: true
  };
}

function createNanny(rng, familyName, familyHint, tier) {
  const traits = createTraits(rng);
  traits.warmth = Math.max(48, traits.warmth);
  traits.responsibility = Math.max(58, traits.responsibility);
  return {
    id: `nanny-${rng.int(100000, 999999)}`,
    name: `${rng.pick(NAMES.adult)} ${rng.pick(NAMES.family)}`,
    role: 'Nanny', age: rng.int(24, 56), stage: 'adult',
    traits, revealedTraits: Object.keys(traits), hobbies: selectHobbies(rng, traits, 2),
    appearance: createAppearance(rng, 'adult', familyHint, 'Nanny'),
    job: { id: 'nanny', label: tier >= 5 ? 'Live-in nanny' : 'Day nanny', schedule: tier >= 5 ? 'livein' : 'weekday', workplace: 'home', pay: [0, 0] },
    salaryPerDay: tier >= 5 ? rng.int(260, 390) : rng.int(190, 300),
    liveIn: tier >= 5,
    needs: { health: rng.int(78, 96), energy: rng.int(58, 88), satiety: rng.int(58, 88), hygiene: rng.int(58, 90), comfort: rng.int(55, 86), mood: rng.int(52, 88), stress: rng.int(8, 38) },
    location: 'home', x: 6.5 * TILE, y: 12.5 * TILE, dir: 'down', moving: false,
    currentGoal: null, activity: { type: 'waiting', remaining: 1, startedStamp: 0 }, route: null,
    completedShiftKeys: [], lastDecisionStamp: -999, lastCareStamp: -999, relationships: [], alive: true
  };
}

function chooseInitialChildcare(rng, parents, wealth, familyName, familyHint) {
  const employed = parents.filter(parent => parent.job?.id !== 'caregiver');
  const combinedMidPay = employed.reduce((sum, parent) => sum + ((parent.job.pay?.[0] || 0) + (parent.job.pay?.[1] || 0)) / 2, 0);
  const canHire = wealth.tier >= 4 && parents.length === 2 && employed.length === parents.length && combinedMidPay >= 900;
  if (canHire) {
    const nanny = createNanny(rng, familyName, familyHint, wealth.tier);
    return { nanny, childcare: { type: 'nanny', label: nanny.job.label, caregiverId: nanny.id, reliable: true, reason: 'Both parents can keep their careers because the household can afford professional childcare.' } };
  }
  const stayHomeParent = [...parents].sort((a, b) => ((a.job.pay?.[1] || 0) - (b.job.pay?.[1] || 0)) || (b.traits.familyFocus - a.traits.familyFocus))[0];
  stayHomeParent.originalJob = deepClone(stayHomeParent.job);
  stayHomeParent.job = deepClone(JOBS.find(job => job.id === 'caregiver'));
  stayHomeParent.careerStatus = 'stayHome';
  stayHomeParent.careerPausedAt = 0;
  return { nanny: null, childcare: { type: 'stayHome', label: 'Stay-at-home parent', caregiverId: stayHomeParent.id, reliable: true, reason: `${stayHomeParent.name.split(' ')[0]} paused work because the family does not have full-time childcare.` } };
}

function describeBirthOrder(olderCount, twinCount, desiredChildren) {
  if (olderCount === 0 && twinCount === 0 && desiredChildren <= 1) return { key: 'only', label: 'Only child' };
  if (twinCount > 0 && olderCount === 0) return { key: 'twin-first', label: 'One of the firstborn twins' };
  if (twinCount > 0) return { key: 'twin-younger', label: `One of the younger twins, after ${olderCount} older sibling${olderCount === 1 ? '' : 's'}` };
  if (olderCount === 0) return { key: 'firstborn', label: 'Firstborn child' };
  if (olderCount === 1) return { key: 'second', label: desiredChildren > 2 ? 'Second-born child' : 'Youngest child' };
  if (desiredChildren > olderCount + 1) return { key: 'middle', label: `${olderCount + 1}${olderCount + 1 === 3 ? 'rd' : 'th'}-born child` };
  return { key: 'youngest', label: `Youngest of ${olderCount + 1} children` };
}

function createInitialState(playerName, seed) {
  const rng = new RNG(seed);
  const familyName = rng.pick(NAMES.family);
  const parentCount = rng.chance(0.20) ? 1 : 2;
  const parents = Array.from({ length: parentCount }, (_, index) => createParent(rng, index, familyName, parentCount));
  const wealth = wealthFromParents(rng, parents);
  const familyHint = parents[0]?.appearance || null;
  const olderCount = rng.weighted([0, 1, 2, 3], value => [50, 29, 15, 6][value]);
  const olderSiblings = Array.from({ length: olderCount }, (_, index) => createExistingSibling(rng, familyName, index, familyHint, Math.max(2, rng.int(2 + index * 2, 15))));
  const twinCount = rng.chance(0.08) ? 1 : 0;
  const twinSiblings = Array.from({ length: twinCount }, (_, index) => createExistingSibling(rng, familyName, olderCount + index, familyHint, 0));
  const siblings = [...olderSiblings, ...twinSiblings];
  const player = createPlayer(rng, playerName, familyName);
  player.appearance = createAppearance(rng, 'baby', familyHint, 'Player');
  const town = generateTown(rng);
  generateResidents(rng, town, rng.int(30, 38));
  const home = buildHome(rng, wealth, olderSiblings.length);
  const averageFamilyFocus = parents.reduce((sum, parent) => sum + parent.traits.familyFocus, 0) / parents.length;
  const currentChildren = siblings.length + 1;
  const desiredChildren = parentCount === 2
    ? clamp(Math.max(currentChildren, 1 + Math.round((averageFamilyFocus - 22) / 27)), currentChildren, 5)
    : currentChildren;
  const birthOrder = describeBirthOrder(olderCount, twinCount, desiredChildren);
  const childcareDecision = chooseInitialChildcare(rng, parents, wealth, familyName, familyHint);
  const childrenIds = [player.id, ...siblings.map(item => item.id)];
  const parentSummary = parents.map(parent => `${parent.name.split(' ')[0]} is ${parent.job.label.toLowerCase()}`).join(' and ');
  const siblingSummary = siblings.length ? siblings.map(item => `${item.name.split(' ')[0]} (${item.age < 1 ? 'newborn twin' : `${Math.floor(item.age)} years old`})`).join(', ') : 'no siblings yet';
  const intro = {
    birthTitle: `You are ${player.name}`,
    birthBody: `You were born on Monday, Week 1, into the ${familyName} family. You begin life as the ${birthOrder.label.toLowerCase()}.`,
    familyTitle: `Meet the ${familyName} family`,
    familyBody: `Your household has ${parents.length === 1 ? 'one parent' : 'two parents'}: ${parentSummary}. At birth you have ${siblingSummary}. Childcare arrangement: ${childcareDecision.childcare.label}.`,
    homeTitle: `Your first home`,
    homeBody: `The family lives in a ${wealth.label.toLowerCase()} home in ${town.name}. It begins with ${wealth.money.toLocaleString('en-PH')} pesos, ${wealth.food} food portions, and ${home.rooms.filter(roomItem => roomItem.active).map(roomItem => roomItem.label.toLowerCase()).join(', ')}.`
  };
  return {
    version: SAVE_VERSION, seed: String(seed), rngState: rng.state, createdAt: Date.now(),
    time: { totalDays: 0, day: 1, minute: 7 * 60, ageClock: 0, lastSummaryMinute: 7 * 60 },
    speedIndex: 0, scene: 'home', player, parents, siblings, nanny: childcareDecision.nanny,
    family: {
      relationship: parentCount === 2 ? { affection: rng.int(42, 88), trust: rng.int(40, 90), tension: rng.int(5, 42) } : null,
      desiredChildren, pregnancy: null, planningCooldownUntil: 5, lastPlanningCheck: -1,
      birthOrder, childcare: childcareDecision.childcare, intro,
      history: [`${player.name} was born as the ${birthOrder.label.toLowerCase()}.`, childcareDecision.childcare.reason]
    },
    household: {
      tier: wealth.tier, label: wealth.label, money: wealth.money, food: wealth.food, reports: 0, home,
      finances: { weekIncome: 0, weekExpenses: 0, lifetimeIncome: 0, lifetimeExpenses: 0, lastRentWeek: -1, lastUtilitiesWeek: -1, nextBillsDay: 6, lastNannyPayDay: -1, lastCareSupportDay: -1, careSupportPerDay: parentCount === 1 && childcareDecision.childcare.type === 'stayHome' ? 160 : 0, ledger: [] }
    },
    town,
    familyTree: [
      ...parents.map(parent => ({ id: parent.id, name: parent.name, generation: 0, parentIds: [], children: childrenIds, alive: true })),
      ...siblings.map(sibling => ({ id: sibling.id, name: sibling.name, generation: 1, parentIds: parents.map(parent => parent.id), children: [], alive: true })),
      { id: player.id, name: player.name, generation: 1, parentIds: parents.map(parent => parent.id), children: [], alive: true }
    ],
    notifications: { history: [], fastSummary: {}, lastRoutineRealTime: 0 },
    events: { lastEventDay: -2, cooldowns: {} },
    flags: { tutorialShown: false, introShown: false, directControlUsed: false, stageMessages: [] },
    log: [
      { stamp: 0, day: 1, text: `${player.name} was born into the ${familyName} family as the ${birthOrder.label.toLowerCase()}.`, type: 'important' },
      { stamp: 0, day: 1, text: childcareDecision.childcare.reason, type: 'important' }
    ]
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
  }
  return true;
}

export function createSibling(state, rng) {
  const familyName = state.player.name.split(' ').at(-1);
  const sibling = createExistingSibling(rng, familyName, state.siblings.length, state.player.appearance, 0);
  sibling.activity = { type: 'sleeping', remaining: 4, startedStamp: 0 };
  sibling.x = 6.3 * TILE; sibling.y = 3.8 * TILE;
  state.siblings.push(sibling);
  state.family.history ||= [];
  state.family.history.unshift(`${sibling.name} was born, changing the sibling order in the household.`);
  const older = state.siblings.filter(item => item.age > state.player.age + 0.1).length;
  const younger = state.siblings.filter(item => item.age < state.player.age - 0.1).length;
  state.family.birthOrder = older === 0 ? { key: 'firstborn', label: younger ? 'Firstborn child' : 'Oldest child' } : younger ? { key: 'middle', label: 'Middle child' } : { key: 'youngest', label: `Youngest of ${state.siblings.length + 1} children` };
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
  state.nanny ??= null;
  state.family ??= { relationship: null, desiredChildren: 1, pregnancy: null, planningCooldownUntil: 5, lastPlanningCheck: -1 };
  state.family.desiredChildren ??= 2;
  state.family.birthOrder ??= { key: 'firstborn', label: 'Firstborn child' };
  state.family.childcare ??= { type: 'stayHome', label: 'Stay-at-home parent', caregiverId: state.parents?.[0]?.id, reliable: true, reason: 'A parent provides childcare.' };
  state.family.history ??= [];
  state.family.intro ??= { birthTitle: `You are ${state.player?.name || 'a new life'}`, birthBody: 'You were born into this family.', familyTitle: 'Your family', familyBody: 'Your household has its own history.', homeTitle: 'Your first home', homeBody: `The family lives in a ${state.household?.label || 'modest'} home.` };
  state.family.planningCooldownUntil ??= state.time?.totalDays + 5;
  state.household.finances ??= { weekIncome: 0, weekExpenses: 0, lifetimeIncome: 0, lifetimeExpenses: 0, lastRentWeek: -1, lastUtilitiesWeek: -1, nextBillsDay: 6, ledger: [] };
  state.household.finances.ledger ??= [];
  state.household.finances.lastNannyPayDay ??= -1;
  state.household.finances.lastCareSupportDay ??= -1;
  state.household.finances.careSupportPerDay ??= 0;
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
  for (const person of [state.player, ...state.parents, ...state.siblings, state.nanny].filter(Boolean)) {
    person.currentGoal ??= null;
    person.activity ??= { type: 'waiting', remaining: 1, startedStamp: 0 };
    person.route ??= null;
    person.dir ??= 'down';
    person.moving ??= false;
    person.needs.stress ??= 10;
    person.appearance ??= createAppearance(new RNG(`${state.seed}-${person.id}`), person.stage || 'adult', state.player?.appearance, person.role || 'Resident');
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
    parent.originalJob ??= deepClone(parent.job);
    parent.careerStatus ??= parent.job?.id === 'caregiver' ? 'stayHome' : 'working';
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
