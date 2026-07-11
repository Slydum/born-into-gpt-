import {
  SAVE_KEY, LEGACY_SAVE_KEYS, SAVE_VERSION, TOWN_SLOTS, LOCATION_TYPES, LOCATION_LABELS,
  LOCATION_COLORS, JOBS, HOBBIES, HOUSE_PURCHASES, HOME_ANCHORS, TILE
} from './config.js';
import { NAMES } from './data.js';
import {
  RNG, clamp, stageForAge, storageGet, storageSet, storageRemove, safeText, deepClone
} from './utils.js';
import { createAppearance } from './art.js';
import { initializeV7State, assignHomeSpaces } from './v7.js';

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
    age: rng.int(24, 46),
    stage: 'adult',
    sexAtBirth: null,
    officialResidenceId: 'familyHome',
    currentResidenceId: 'familyHome',
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
    sexAtBirth: null,
    officialResidenceId: 'familyHome',
    currentResidenceId: 'familyHome',
    generation: 1,
    traits: [],
    traitSeeds: createTraits(rng),
    hobbies: [],
    skills: { social: 0, cooking: 0, exercise: 0, painting: 0, music: 0, gardening: 0, sewing: 0, gaming: 0 },
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

function room(id, label, x, y, w, h, active = true, door = null) {
  return { id, label, x, y, w, h, active, door: door || { x: x + w / 2, y: y + h - 0.05, edge: 'bottom' } };
}

function furniture(id, roomId, essential = false, condition = 100, ownerId = null) {
  return { id, instanceId: `${id}-${roomId}-${Math.floor(Math.random()*1e7)}`, room: roomId, floor: 0, ownerId, essential, condition, delivered: true };
}

const HOME_LAYOUTS = [
  {
    id: 'courtyard', label: 'Courtyard plan', entrance: { x: 11.5, y: 16.5 },
    rooms: [
      room('parentBedroom','Parent bedroom',1,1,7,6,true,{x:4.5,y:6.95,edge:'bottom'}),
      room('childBedroom','Shared child bedroom',9,1,6,6,true,{x:12,y:6.95,edge:'bottom'}),
      room('teenBedroom','Teen bedroom',1,8,4,4,false,{x:5,y:10,edge:'right'}),
      room('kitchen','Kitchen',16,1,5,6,true,{x:18.5,y:6.95,edge:'bottom'}),
      room('livingRoom','Living room',1,8,8,9,true,{x:5,y:8.05,edge:'top'}),
      room('diningRoom','Dining area',10,8,6,9,true,{x:13,y:8.05,edge:'top'}),
      room('bathroom','Bathroom',17,8,4,9,true,{x:19,y:8.05,edge:'top'})
    ],
    expansion: { roomId:'teenBedroom', shrink:{ roomId:'livingRoom', x:5.2, y:8, w:3.8, h:9 } }
  },
  {
    id: 'front-room', label: 'Front-room plan', entrance: { x: 11.5, y: 16.5 },
    rooms: [
      room('livingRoom','Living room',1,1,8,7,true,{x:5,y:7.95,edge:'bottom'}),
      room('diningRoom','Dining area',10,1,5,7,true,{x:12.5,y:7.95,edge:'bottom'}),
      room('kitchen','Kitchen',16,1,5,7,true,{x:18.5,y:7.95,edge:'bottom'}),
      room('parentBedroom','Parent bedroom',1,9,7,8,true,{x:8.05,y:13,edge:'right'}),
      room('childBedroom','Shared child bedroom',9,9,7,8,true,{x:9.05,y:13,edge:'left'}),
      room('teenBedroom','Teen bedroom',9,9,3.4,8,false,{x:12.45,y:13,edge:'right'}),
      room('bathroom','Bathroom',17,9,4,8,true,{x:17.05,y:13,edge:'left'})
    ],
    expansion: { roomId:'teenBedroom', shrink:{ roomId:'childBedroom', x:12.6, y:9, w:3.4, h:8 } }
  },
  {
    id: 'side-hall', label: 'Side-hall plan', entrance: { x: 11.5, y: 16.5 },
    rooms: [
      room('parentBedroom','Parent bedroom',1,1,6,7,true,{x:7.05,y:4.5,edge:'right'}),
      room('childBedroom','Shared child bedroom',1,9,6,8,true,{x:7.05,y:13,edge:'right'}),
      room('teenBedroom','Teen bedroom',1,9,6,3.7,false,{x:7.05,y:11,edge:'right'}),
      room('livingRoom','Living room',8,1,8,9,true,{x:12,y:9.95,edge:'bottom'}),
      room('diningRoom','Dining area',8,11,8,6,true,{x:12,y:11.05,edge:'top'}),
      room('kitchen','Kitchen',17,1,4,8,true,{x:17.05,y:5,edge:'left'}),
      room('bathroom','Bathroom',17,10,4,7,true,{x:17.05,y:13.5,edge:'left'})
    ],
    expansion: { roomId:'teenBedroom', shrink:{ roomId:'childBedroom', x:1, y:12.9, w:6, h:4.1 } }
  },
  {
    id: 'split-level', label: 'Split-level plan', entrance: { x: 11.5, y: 16.5 },
    rooms: [
      room('kitchen','Kitchen',1,1,6,6,true,{x:4,y:6.95,edge:'bottom'}),
      room('diningRoom','Dining area',8,1,6,6,true,{x:11,y:6.95,edge:'bottom'}),
      room('livingRoom','Living room',15,1,6,10,true,{x:15.05,y:6,edge:'left'}),
      room('parentBedroom','Parent bedroom',1,8,7,9,true,{x:8.05,y:12.5,edge:'right'}),
      room('childBedroom','Shared child bedroom',9,8,5,9,true,{x:9.05,y:12.5,edge:'left'}),
      room('teenBedroom','Teen bedroom',15,7,6,4,false,{x:15.05,y:9,edge:'left'}),
      room('bathroom','Bathroom',15,12,6,5,true,{x:15.05,y:14.5,edge:'left'})
    ],
    expansion: { roomId:'teenBedroom', shrink:{ roomId:'livingRoom', x:15, y:1, w:6, h:5.8 } }
  }
];

export function buildHome(rng, wealth, existingChildren = 0) {
  const template = deepClone(rng.pick(HOME_LAYOUTS));
  template.layoutId = template.id;
  template.rooms.forEach(roomItem => { roomItem.floor = 0; });
  const hasSofa = wealth.tier >= 2;
  const hasRug = wealth.tier >= 3;
  const hasBookshelf = wealth.tier >= 3;
  const hasPlant = wealth.tier >= 4;
  const hasTelevision = wealth.tier >= 4;
  const childRoom = template.rooms.find(item => item.id === 'childBedroom');
  if (childRoom) childRoom.active = existingChildren > 0 || wealth.tier >= 3;
  const items = [
    furniture('parentBed','parentBedroom',true), furniture('crib','parentBedroom',true), furniture('dresser','parentBedroom',true), furniture('wardrobe','parentBedroom',true),
    furniture('fridge','kitchen',true,rng.int(65,98)), furniture('stove','kitchen',true,rng.int(62,98)), furniture('counter','kitchen',true),
    furniture('basicTable','diningRoom',true), furniture('toilet','bathroom',true), furniture('sink','bathroom',true), furniture('shower','bathroom',true),
    furniture('laundryBasket','bathroom',true), furniture('dishRack','kitchen',true)
  ];
  if (existingChildren > 0) items.push(furniture('childBed','childBedroom',true));
  if (existingChildren > 1) items.push(furniture('siblingBed','childBedroom',true));
  if (hasSofa) { items.push(furniture('sofa','livingRoom')); items.push(furniture('coffeeTable','livingRoom')); }
  if (hasRug) items.push(furniture('rug','livingRoom'));
  if (hasBookshelf) items.push(furniture('bookshelf','livingRoom'));
  if (hasPlant) { items.push(furniture('plant','livingRoom')); items.push(furniture('wallArt','livingRoom')); }
  if (hasTelevision) { items.push(furniture('television','livingRoom')); items.push(furniture('armchair','livingRoom')); }
  if (wealth.tier >= 3) items.push(furniture('floorLamp','livingRoom'));
  if (wealth.tier >= 4) items.push(furniture('washingMachine','bathroom'));
  return {
    layoutId: template.id, layoutLabel: template.label, entrance: template.entrance, expansionPlan: template.expansion, currentFloor: 0, floors: [{id:0,label:'Ground Floor',active:true},{id:1,label:'Second Floor',active:false}],
    tier: wealth.tier, label: wealth.label, condition: rng.int(58,94), cleanliness: rng.int(48,90), decorLevel: Math.max(0,wealth.tier-2),
    wallPaint: wealth.tier >= 4, rooms: template.rooms, furniture: items, wishlist: [], deliveries: [], construction: null,
    purchaseHistory: [], lastEvaluationDay: -1,
    kitchen: { ingredients: { rice: rng.int(3,8), vegetables: rng.int(2,6), protein: rng.int(1,5), bread: rng.int(2,5), fruit: rng.int(1,4) }, preparedMeal: null, leftovers: 0, lastCookedDay: -1 },
    chores: { dirtyDishes: 0, laundryLoads: rng.int(0,2), trash: rng.int(0,2), floorMess: rng.int(5,25), bathroomMess: rng.int(5,20), lastLaundryDay: -1 },
    meal: { phase: 'idle', type: null, recipe: null, ingredientUse: {}, cookId: null, startedStamp: -1, readyStamp: -1, attendees: [], seats: {}, conversations: 0 },
    hobbies: { equipment: items.filter(item => ['bookshelf','television'].includes(item.id)).map(item => item.id), artworks: [], crafts: [], lastSaleDay: -1 },
    speech: [], roomAssignments: {}, bedAssignments: {}, seatAssignments: {}, pendingRequests: [], constructionHistory: [], hobbyOwnership: {}, stairs: {ground:{x:10.7,y:8.5},upper:{x:10.7,y:8.5},active:false}
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
  const resolvedAge = age ?? rng.int(2, 28);
  const stage = stageForAge(resolvedAge);
  const traitSeeds = createTraits(rng);
  const adultPath = stage === 'adult' ? rng.pick(['college','work','trade']) : null;
  const movedOut = stage === 'adult' ? rng.chance(0.78) : false;
  return {
    id: `sibling-${rng.int(100000, 999999)}-${index}`,
    name: `${rng.pick(NAMES.first)} ${familyName}`,
    role: 'Sibling', age: resolvedAge, stage, sexAtBirth:null, traits: [], traitSeeds,
    hobbies: selectHobbies(rng, traitSeeds, 2),
    skills: { social: 0, cooking: 0, exercise: 0, painting: 0, music: 0, gardening: 0, sewing: 0, gaming: 0 },
    appearance: createAppearance(rng, stage, familyHint, 'Sibling'),
    development: { bonding: rng.int(35,70), stimulation: rng.int(35,70), stressExposure: rng.int(5,35), curiosity: rng.int(25,75), resilience: rng.int(25,75), grades: rng.int(40,80) },
    needs: { health:rng.int(80,98), energy:rng.int(55,90), satiety:rng.int(55,90), hygiene:rng.int(55,90), comfort:rng.int(50,90), mood:rng.int(45,90), stress:rng.int(5,35) },
    location:movedOut?'away':'home', x:(10.5+(index%2)*2.2)*TILE, y:(3+Math.floor(index/2)*2)*TILE,
    dir:'down', moving:false, currentGoal:null, activity:{type:'waiting',remaining:1,startedStamp:0}, route:null,
    school:{attendedDay:-1,grades:rng.int(42,88)}, relationships:[], alive:true,
    movedOut, adultPath, residence:movedOut ? ({college:'University dormitory',work:'Shared apartment',trade:'Boarding house'}[adultPath]) : 'Family home',
    officialResidenceId:movedOut?`adultHome-sibling-${index}`:'familyHome', currentResidenceId:movedOut?null:'familyHome',
    partner:null, children:[], phone:{hasPhone:stage==='adult',contacts:[],unread:0}, memories:[]
  };
}

function createNanny(rng, familyName, familyHint, tier) {
  const traits = createTraits(rng);
  traits.warmth = Math.max(48, traits.warmth);
  traits.responsibility = Math.max(58, traits.responsibility);
  return {
    id: `nanny-${rng.int(100000, 999999)}`,
    name: `${rng.pick(NAMES.adult)} ${rng.pick(NAMES.family)}`,
    role: 'Nanny', age: rng.int(24, 56), stage: 'adult', sexAtBirth:null, officialResidenceId:'familyHome', currentResidenceId:'familyHome',
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

function roomPoint(home, roomId, offsetX = 0, offsetY = 0) {
  const target = home.rooms.find(roomItem => roomItem.id === roomId && roomItem.active)
    || home.rooms.find(roomItem => roomItem.id === 'livingRoom')
    || home.rooms[0];
  return {
    x: (target.x + target.w * .5 + offsetX) * TILE,
    y: (target.y + target.h * .5 + offsetY) * TILE
  };
}

function placeInitialHousehold(home, player, parents, siblings, nanny) {
  const parentPoint = roomPoint(home, 'parentBedroom', -.5, 0);
  parents.forEach((parent, index) => {
    parent.location = 'home';
    parent.x = parentPoint.x + index * 30;
    parent.y = parentPoint.y + index * 8;
  });
  const babyPoint = roomPoint(home, 'parentBedroom', .7, -.2);
  player.location = 'home'; player.x = babyPoint.x; player.y = babyPoint.y;
  const childRoomActive = home.rooms.some(roomItem => roomItem.id === 'childBedroom' && roomItem.active);
  siblings.forEach((sibling, index) => {
    const point = roomPoint(home, childRoomActive ? 'childBedroom' : 'parentBedroom', (index % 2) * .8 - .4, Math.floor(index / 2) * .7 - .3);
    sibling.location = 'home'; sibling.x = point.x; sibling.y = point.y;
  });
  if (nanny) {
    const point = roomPoint(home, 'livingRoom', 0, .8);
    nanny.location = 'home'; nanny.x = point.x; nanny.y = point.y;
  }
}

function createInitialState(playerName, seed) {
  const rng = new RNG(seed);
  const familyName = rng.pick(NAMES.family);
  const parentCount = rng.chance(0.20) ? 1 : 2;
  const parents = Array.from({ length: parentCount }, (_, index) => createParent(rng, index, familyName, parentCount));
  const wealth = wealthFromParents(rng, parents);
  const familyHint = parents[0]?.appearance || null;
  const olderCount = rng.weighted([0, 1, 2, 3, 4, 5], value => [34, 27, 18, 11, 7, 3][value]);
  const maxOlderAge = Math.max(1, Math.min(34, Math.floor(Math.min(...parents.map(parent => parent.age)) - 16)));
  const ages = [];
  for (let index = 0; index < olderCount; index += 1) {
    const minAge = Math.min(maxOlderAge, 1 + index * 2);
    ages.push(rng.int(minAge, Math.max(minAge, maxOlderAge)));
  }
  ages.sort((a,b) => b-a);
  const allOlderSiblings = ages.map((age, index) => createExistingSibling(rng, familyName, index, familyHint, age));
  const twinCount = rng.chance(0.08) ? 1 : 0;
  const twinSiblings = Array.from({ length: twinCount }, (_, index) => createExistingSibling(rng, familyName, olderCount + index, familyHint, 0));
  const extendedFamily = allOlderSiblings.filter(item => item.movedOut);
  const olderSiblings = allOlderSiblings.filter(item => !item.movedOut);
  const siblings = [...olderSiblings, ...twinSiblings];
  const player = createPlayer(rng, playerName, familyName);
  player.appearance = createAppearance(rng, 'baby', familyHint, 'Player');
  player.hobbies = selectHobbies(rng, player.traitSeeds, 2);
  const town = generateTown(rng);
  generateResidents(rng, town, rng.int(30, 38));
  const home = buildHome(rng, wealth, siblings.filter(item => !item.movedOut).length);
  const averageFamilyFocus = parents.reduce((sum, parent) => sum + parent.traits.familyFocus, 0) / parents.length;
  const currentChildren = allOlderSiblings.length + twinSiblings.length + 1;
  const desiredChildren = parentCount === 2
    ? clamp(Math.max(currentChildren, 1 + Math.round((averageFamilyFocus - 22) / 27)), currentChildren, 5)
    : currentChildren;
  const birthOrder = describeBirthOrder(olderCount, twinCount, desiredChildren);
  const childcareDecision = chooseInitialChildcare(rng, parents, wealth, familyName, familyHint);
  placeInitialHousehold(home, player, parents, siblings, childcareDecision.nanny);
  const childrenIds = [player.id, ...siblings.map(item => item.id), ...extendedFamily.map(item => item.id)];
  const parentSummary = parents.map(parent => `${parent.name.split(' ')[0]} is ${parent.job.label.toLowerCase()}`).join(' and ');
  const allSiblingsAtBirth = [...allOlderSiblings, ...twinSiblings];
  const siblingSummary = allSiblingsAtBirth.length ? allSiblingsAtBirth.map(item => `${item.name.split(' ')[0]} (${item.age < 1 ? 'newborn twin' : `${Math.floor(item.age)} years old`}${item.movedOut ? `, living in a ${item.residence.toLowerCase()}` : ', living at home'})`).join(', ') : 'no siblings yet';
  const intro = {
    birthTitle: `You are ${player.name}`,
    birthBody: `You were born on Monday, Week 1, into the ${familyName} family. You begin life as the ${birthOrder.label.toLowerCase()}.`,
    familyTitle: `Meet the ${familyName} family`,
    familyBody: `Your household has ${parents.length === 1 ? 'one parent' : 'two parents'}: ${parentSummary}. At birth you have ${siblingSummary}. Childcare arrangement: ${childcareDecision.childcare.label}.`,
    homeTitle: `Your first home`,
    homeBody: `The family lives in a ${wealth.label.toLowerCase()} home in ${town.name}. It begins with ${wealth.money.toLocaleString('en-PH')} pesos, ${wealth.food} food portions, and ${home.rooms.filter(roomItem => roomItem.active).map(roomItem => roomItem.label.toLowerCase()).join(', ')}.`
  };
  const state = {
    version: SAVE_VERSION, seed: String(seed), rngState: rng.state, createdAt: Date.now(),
    time: { totalDays: 0, day: 1, minute: 7 * 60, ageClock: 0, lastSummaryMinute: 7 * 60 },
    speedIndex: 0, scene: 'home', player, parents, siblings, extendedFamily, nanny: childcareDecision.nanny,
    family: {
      relationship: parentCount === 2 ? { affection: rng.int(42, 88), trust: rng.int(40, 90), tension: rng.int(5, 42) } : null,
      desiredChildren, pregnancy: null, planningCooldownUntil: 5, lastPlanningCheck: -1,
      birthOrder, childcare: childcareDecision.childcare, intro,
      history: [`${player.name} was born as the ${birthOrder.label.toLowerCase()}.`, childcareDecision.childcare.reason]
    },
    household: {
      id:'familyHome', residenceId:'familyHome', tier: wealth.tier, label: wealth.label, money: wealth.money, food: wealth.food, reports: 0, home,
      finances: { weekIncome: 0, weekExpenses: 0, lifetimeIncome: 0, lifetimeExpenses: 0, lastRentWeek: -1, lastUtilitiesWeek: -1, nextBillsDay: 6, lastNannyPayDay: -1, lastCareSupportDay: -1, careSupportPerDay: parentCount === 1 && childcareDecision.childcare.type === 'stayHome' ? 160 : 0, ledger: [] }
    },
    households: {}, activeResidenceId:'familyHome',
    town,
    familyTree: [
      ...parents.map(parent => ({ id: parent.id, name: parent.name, generation: 0, parentIds: [], children: childrenIds, alive: true })),
      ...siblings.map(sibling => ({ id: sibling.id, name: sibling.name, generation: 1, parentIds: parents.map(parent => parent.id), children: sibling.children || [], alive: true })),
      ...extendedFamily.map(sibling => ({ id: sibling.id, name: sibling.name, generation: 1, parentIds: parents.map(parent => parent.id), children: sibling.children || [], alive: true })),
      { id: player.id, name: player.name, generation: 1, parentIds: parents.map(parent => parent.id), children: [], alive: true }
    ],
    social: { lastInteractionStamp: -999, acquaintances: {}, speech: [], classRoster: [], contacts: [], threads: {}, invitations: [], clubs: [], schoolOpportunities: {} },
    phone: { unlocked:false, selectedContactId:null },
    notifications: { history: [], fastSummary: {}, lastRoutineRealTime: 0 },
    events: { lastEventDay: -2, cooldowns: {}, active: [], history: [], lastMajorDay: -10 },
    settings: { lifeDifficulty:'realistic', seriousIllness:'rare', unexpectedDeath:'rare', teenPregnancy:'rare', cheating:'rare', substanceEvents:'mild', adultIntimacy:'fade', teenRomance:'age-appropriate' },
    adulthood: { transitions: {}, playerChoice: null },
    flags: { tutorialShown: false, introShown: false, directControlUsed: false, stageMessages: [] },
    log: [
      { stamp: 0, day: 1, text: `${player.name} was born into the ${familyName} family as the ${birthOrder.label.toLowerCase()}.`, type: 'important' },
      { stamp: 0, day: 1, text: childcareDecision.childcare.reason, type: 'important' }
    ]
  };
  state.households.familyHome = state.household;
  for (const parent of state.parents) {
    parent.ageAtPlayerBirth = parent.age;
    parent.sexAtBirth = parent.appearance?.presentation === 'feminine' ? 'female' : 'male';
  }
  for (const person of [state.player, ...state.siblings, ...state.extendedFamily, state.nanny].filter(Boolean)) {
    person.sexAtBirth = person.appearance?.presentation === 'feminine' ? 'female' : 'male';
  }
  initializeV7State(state, rng);
  return state;
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
  let resolvedRoom = roomId || purchase?.room || 'livingRoom';
  if (resolvedRoom === 'ownerBedroom') resolvedRoom = state.player.assignedRoomId || 'childBedroom';
  if (resolvedRoom === 'yard') resolvedRoom = 'livingRoom';
  const room = state.household.home.rooms.find(item => item.id === resolvedRoom);
  state.household.home.furniture.push({ id, instanceId: `${id}-${resolvedRoom}-${Date.now()}`, room: resolvedRoom, floor: room?.floor || 0, ownerId: null, essential: Boolean(purchase?.priority >= 80), condition: 100, delivered: true });
  return true;
}

export function getActiveRooms(state) {
  return state.household.home.rooms.filter(roomItem => roomItem.active && (roomItem.floor ?? 0) === (state.household.home.currentFloor ?? 0));
}

export function roomExists(state, id) {
  return state.household.home.rooms.some(roomItem => roomItem.id === id && roomItem.active);
}

export function activateRoom(state, id) {
  const target = state.household.home.rooms.find(roomItem => roomItem.id === id);
  if (!target) return false;
  target.active = true;
  return true;
}

export function createSibling(state, rng) {
  const familyName = state.player.name.split(' ').at(-1);
  const sibling = createExistingSibling(rng, familyName, state.siblings.length, state.player.appearance, 0);
  sibling.activity = { type: 'sleeping', remaining: 4, startedStamp: 0 };
  const nurseryPoint = roomPoint(state.household.home, 'parentBedroom', .65, -.15);
  sibling.x = nurseryPoint.x; sibling.y = nurseryPoint.y;
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
  state.extendedFamily ??= [];
  state.nanny ??= null;
  state.family ??= { relationship: null, desiredChildren: 1, pregnancy: null, planningCooldownUntil: 5, lastPlanningCheck: -1 };
  state.family.desiredChildren ??= 2;
  state.family.birthOrder ??= { key: 'firstborn', label: 'Firstborn child' };
  state.family.childcare ??= { type: 'stayHome', label: 'Stay-at-home parent', caregiverId: state.parents?.[0]?.id, reliable: true, reason: 'A parent provides childcare.' };
  state.family.history ??= [];
  state.family.intro ??= { birthTitle: `You are ${state.player?.name || 'a new life'}`, birthBody: 'You were born into this family.', familyTitle: 'Your family', familyBody: 'Your household has its own history.', homeTitle: 'Your first home', homeBody: `The family lives in a ${state.household?.label || 'modest'} home.` };
  state.family.planningCooldownUntil ??= state.time?.totalDays + 5;
  state.household.id ||= state.household.residenceId || 'familyHome';
  state.household.residenceId ||= state.household.id;
  state.households ||= {};
  if (!state.households.familyHome && state.household.residenceId === 'familyHome') state.households.familyHome = state.household;
  state.activeResidenceId ||= state.household.residenceId || 'familyHome';
  state.household.finances ??= { weekIncome: 0, weekExpenses: 0, lifetimeIncome: 0, lifetimeExpenses: 0, lastRentWeek: -1, lastUtilitiesWeek: -1, nextBillsDay: 6, ledger: [] };
  state.household.finances.ledger ??= [];
  state.household.finances.lastNannyPayDay ??= -1;
  state.household.finances.lastCareSupportDay ??= -1;
  state.household.finances.careSupportPerDay ??= 0;
  state.household.home ??= buildHome(new RNG(state.seed, state.rngState), { tier: state.household.tier || 2, label: state.household.label || 'Low income' });
  state.household.home.wishlist ??= [];
  state.household.home.deliveries ??= [];
  state.household.home.purchaseHistory ??= [];
  state.social ??= { lastInteractionStamp: -999, acquaintances: {}, speech: [] };
  state.social.acquaintances ??= {};
  state.social.speech ??= [];
  state.household.home.kitchen ??= { ingredients: { rice: 4, vegetables: 3, protein: 2, bread: 3, fruit: 2 }, preparedMeal: null, leftovers: 0, lastCookedDay: -1 };
  state.household.home.chores ??= { dirtyDishes: 0, laundryLoads: 0, trash: 0, floorMess: 10, bathroomMess: 10, lastLaundryDay: -1 };
  state.household.home.meal ??= { phase: 'idle', type: null, recipe: null, ingredientUse: {}, cookId: null, startedStamp: -1, readyStamp: -1, attendees: [], seats: {}, conversations: 0 };
  state.household.home.meal.ingredientUse ??= {};
  state.household.home.hobbies ??= { equipment: [], artworks: [], crafts: [], lastSaleDay: -1 };
  state.household.home.speech ??= [];
  state.notifications ??= { history: [], fastSummary: {}, lastRoutineRealTime: 0 };
  state.notifications.history ??= [];
  state.notifications.fastSummary ??= {};
  state.events ??= { lastEventDay: -2, cooldowns: {} };
  state.flags ??= { tutorialShown: false, directControlUsed: false, stageMessages: [] };
  state.log ??= [];
  state.town.residents ??= [];
  state.town.households ??= [];
  for (const person of [state.player, ...state.parents, ...state.siblings, ...state.extendedFamily, state.nanny].filter(Boolean)) {
    person.currentGoal ??= null;
    person.activity ??= { type: 'waiting', remaining: 1, startedStamp: 0 };
    person.route ??= null;
    person.dir ??= 'down';
    person.moving ??= false;
    person.needs.stress ??= 10;
    person.appearance ??= createAppearance(new RNG(`${state.seed}-${person.id}`), person.stage || 'adult', state.player?.appearance, person.role || 'Resident');
    person.hobbies ??= ['reading'];
    person.skills ??= { social: 0, cooking: 0, exercise: 0, painting: 0, music: 0, gardening: 0, sewing: 0, gaming: 0 };
    person.relationships ??= [];
    person.sexAtBirth ||= person.appearance?.presentation === 'feminine' ? 'female' : 'male';
    person.status ||= person.alive === false ? 'deceased' : 'alive';
    person.officialResidenceId ||= person.movedOut ? (person.residenceId || `adultHome-${person.id}`) : 'familyHome';
    person.currentResidenceId ??= person.location === 'home' ? person.officialResidenceId : null;
    person.phone ||= {hasPhone:['teen','adult','elder'].includes(person.stage),contacts:[],unread:0};
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
  initializeV7State(state, new RNG(state.seed, state.rngState));
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

export function getFurnitureAnchor(stateOrItem, maybeItem = null) {
  const state = maybeItem ? stateOrItem : null;
  const item = maybeItem || stateOrItem;
  if (!state) {
    const roomAnchors = HOME_ANCHORS[item.room] || HOME_ANCHORS.livingRoom;
    if (item.id === 'parentBed') return HOME_ANCHORS.parentBedroom.bed;
    if (item.id === 'basicTable') return HOME_ANCHORS.diningRoom.diningSet;
    return roomAnchors[item.id] || HOME_ANCHORS.livingRoom[item.id] || { x: 10, y: 10, w: 1, h: 1, facing: 'down' };
  }
  const roomItem = state.household.home.rooms.find(roomEntry => roomEntry.id === item.room) || state.household.home.rooms.find(roomEntry => roomEntry.id === 'livingRoom') || state.household.home.rooms[0];
  const specs = {
    parentBed:{rx:.08,ry:.08,rw:.54,rh:.48}, crib:{rx:.68,ry:.10,rw:.25,rh:.34}, toddlerBed:{rx:.08,ry:.08,rw:.36,rh:.50},
    childBed:{rx:.08,ry:.08,rw:.36,rh:.50}, siblingBed:{rx:.55,ry:.08,rw:.36,rh:.50}, bunkBed:{rx:.08,ry:.08,rw:.42,rh:.54},
    teenBed:{rx:.08,ry:.08,rw:.36,rh:.50}, upperBedA:{rx:.08,ry:.08,rw:.36,rh:.50}, upperBedB:{rx:.08,ry:.08,rw:.36,rh:.50}, nannyBed:{rx:.08,ry:.08,rw:.36,rh:.50},
    apartmentBed:{rx:.08,ry:.08,rw:.36,rh:.50}, roommateBed:{rx:.08,ry:.08,rw:.36,rh:.50}, guestBed:{rx:.08,ry:.08,rw:.36,rh:.50},
    studyDesk:{rx:.55,ry:.58,rw:.40,rh:.27}, dresser:{rx:.65,ry:.08,rw:.27,rh:.25}, wardrobe:{rx:.65,ry:.08,rw:.27,rh:.28},
    fridge:{rx:.72,ry:.12,rw:.20,rh:.25}, stove:{rx:.72,ry:.56,rw:.20,rh:.20}, counter:{rx:.08,ry:.12,rw:.48,rh:.14}, dishRack:{rx:.10,ry:.42,rw:.28,rh:.12}, dishwasher:{rx:.42,ry:.52,rw:.23,rh:.22},
    basicTable:{rx:.23,ry:.28,rw:.55,rh:.30}, diningSet:{rx:.18,ry:.24,rw:.64,rh:.34},
    sofa:{rx:.08,ry:.57,rw:.58,rh:.27}, armchair:{rx:.70,ry:.58,rw:.22,rh:.24}, coffeeTable:{rx:.26,ry:.35,rw:.36,rh:.20}, television:{rx:.15,ry:.08,rw:.50,rh:.22}, rug:{rx:.13,ry:.28,rw:.62,rh:.35}, bookshelf:{rx:.68,ry:.12,rw:.26,rh:.26}, plant:{rx:.78,ry:.69,rw:.14,rh:.16}, floorLamp:{rx:.80,ry:.43,rw:.12,rh:.25}, wallArt:{rx:.38,ry:.05,rw:.28,rh:.18},
    exerciseMat:{rx:.54,ry:.55,rw:.32,rh:.20}, dumbbells:{rx:.78,ry:.52,rw:.14,rh:.10}, easel:{rx:.58,ry:.14,rw:.24,rh:.32}, keyboard:{rx:.55,ry:.66,rw:.34,rh:.14}, sewingKit:{rx:.60,ry:.48,rw:.24,rh:.16}, gardenKit:{rx:.80,ry:.70,rw:.14,rh:.14}, gameConsole:{rx:.48,ry:.12,rw:.20,rh:.12},
    toilet:{rx:.08,ry:.14,rw:.20,rh:.22}, sink:{rx:.66,ry:.14,rw:.24,rh:.18}, shower:{rx:.48,ry:.56,rw:.42,rh:.34}, laundryBasket:{rx:.08,ry:.68,rw:.18,rh:.20}, washingMachine:{rx:.28,ry:.62,rw:.22,rh:.26}
  };
  const spec = item.placement || specs[item.id] || {rx:.35,ry:.35,rw:.25,rh:.20};
  const pad = .18;
  return {
    x: roomItem.x + pad + spec.rx * Math.max(1, roomItem.w - pad * 2),
    y: roomItem.y + pad + spec.ry * Math.max(1, roomItem.h - pad * 2),
    w: Math.max(.55, spec.rw * roomItem.w), h: Math.max(.45, spec.rh * roomItem.h), facing:'down'
  };
}
