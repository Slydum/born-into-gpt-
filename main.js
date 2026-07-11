const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const TILE = 32;
const COLS = 22;
const ROWS = 18;
const SAVE_KEY = 'born-into-save-v1';
const SPEEDS = [1, 3, 8];

const dom = Object.fromEntries([
  'pauseBtn','speedBtn','saveBtn','menuBtn','continueBtn','newGameBtn','howBtn','newGameForm','mainMenuButtons',
  'nameInput','seedInput','randomSeedBtn','backBtn','howPanel','howBackBtn','menuOverlay','modalOverlay',
  'modalEyebrow','modalTitle','modalBody','modalChoices','playerName','ageLabel','stageBadge','dayLabel','timeLabel',
  'placeLabel','moneyLabel','needsList','familyList','familyMood','objectiveTag','objectiveText','eventLog','clearLogBtn',
  'portrait','playerCardBtn','homeSummary','homeTierLabel','sidePanel','actionBtn','cryBtn','interactionPrompt','toastLayer','ageBtn','eventBtn','childBtn','deathBtn'
].map(id => [id, document.querySelector(`#${id}`)]));

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const titleCase = s => s.replace(/\b\w/g, c => c.toUpperCase());
const stageForAge = age => age < 2 ? 'baby' : age < 5 ? 'toddler' : age < 13 ? 'child' : age < 18 ? 'teen' : age < 65 ? 'adult' : 'elder';
const formatTime = minute => `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(Math.floor(minute % 60)).padStart(2, '0')}`;
const formatAge = age => age < 1 ? `${Math.max(0, Math.floor(age * 12))} months` : `${Math.floor(age)} years`;
const peso = amount => `₱${Math.max(0, Math.round(amount)).toLocaleString('en-PH')}`;
const storageGet = key => { try { return localStorage.getItem(key); } catch { return null; } };
const storageRemove = key => { try { localStorage.removeItem(key); } catch {} };

class RNG {
  constructor(seed, state = null) {
    this.seed = String(seed || 'born-into');
    this.state = state ?? RNG.hash(this.seed);
  }
  static hash(text) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  next() {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.state = this.state >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
  chance(p) { return this.next() < p; }
  pick(list) { return list[Math.floor(this.next() * list.length)]; }
  shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

let state = null;
let rng = null;
let lastTime = performance.now();
let paused = false;
let speedIndex = 0;
let modalOpen = false;
let autoSaveTimer = 0;
let uiTimer = 0;
let eventTimer = 0;
let nearbyObject = null;
let keys = new Set();
let touchDirs = new Set();
let animationClock = 0;

const names = {
  first: ['Maya','Lia','Nico','Sam','Alex','Bea','Noah','Mika','Iris','Theo','June','Rafi','Tala','Ari','Elio','Cora','Dani','Luna','Kai','Sage'],
  parent: ['Marisol','Elena','Paolo','Ramon','Teresa','Daniel','Ana','Luis','Carmen','Marco','Rina','Joel','Nadia','Victor','Grace','Emil'],
  family: ['Reyes','Santos','Dela Cruz','Garcia','Mendoza','Torres','Flores','Ramos','Navarro','Castillo'],
  towns: ['San Amihan','Mabini Grove','Luntian','Santa Tala','Bayani Hills','Malaya','Hiraya','Mapleford'],
  schools: ['Hiraya Elementary','Mabini Community School','Starlight Academy','Luntian Integrated School'],
  stores: ['Daily Basket','Suki Market','Town Pantry','Fresh Corner'],
  workplaces: ['Northline Office','Town Works','Civic Center','Mabini Textiles']
};

const CARE_ACTIONS = new Set(['feeding child','comforting child','changing child','playing with child']);
const CHILDCARE_STAGE_WEIGHT = { baby: 1, toddler: 0.8, child: 0.32, teen: 0.08, adult: 0, elder: 0 };
const CHILDCARE_COOLDOWN = 12;

function isWeekday() {
  return (state.time.totalDays % 7) < 5;
}

function isWorkWindow(hour) {
  return hour >= 8 && hour < 17;
}

function activeCaregiverExists(parent) {
  return state.parents.some(other => other !== parent && CARE_ACTIONS.has(other.action) && other.actionTimer > 1.2);
}

function timeStampDayFraction() {
  return state.time.totalDays + state.time.minute / 1440;
}

function childCareUrgency() {
  const p = state.player;
  return {
    satiety: Math.max(0, 48 - p.needs.satiety),
    comfort: Math.max(0, 42 - p.needs.comfort) + (p.crying ? 18 : 0),
    hygiene: Math.max(0, 45 - p.needs.hygiene),
    mood: Math.max(0, 40 - p.needs.mood)
  };
}

function createParent(index, familyName) {
  const warm = rng.int(25, 95);
  const workEthic = rng.int(25, 95);
  const responsibility = clamp(Math.round((warm + workEthic + rng.int(10, 95)) / 3));
  const parent = {
    id: `parent-${Date.now()}-${index}-${rng.int(100,999)}`,
    name: `${rng.pick(names.parent)} ${familyName}`,
    role: index === 0 ? 'Parent' : 'Parent',
    age: rng.int(22, 39),
    traits: {
      patience: rng.int(15, 95), impulsiveness: rng.int(5, 90), warmth: warm,
      workEthic, strictness: rng.int(10, 90), responsibility, sociability: rng.int(20, 90)
    },
    needs: { energy: rng.int(55, 90), satiety: rng.int(55, 90), stress: rng.int(10, 50), mood: rng.int(45, 85) },
    struggle: rng.chance(.13) ? rng.pick(['addiction risk','burnout','low mood']) : null,
    job: rng.pick(['shop clerk','office assistant','driver','teacher aide','care worker','warehouse staff']),
    location: 'home', x: (8 + index * 3) * TILE + 16, y: 8 * TILE + 16,
    action: 'settling in', actionTimer: 1, decisionTimer: rng.next() * 2,
    target: null, travelTimer: 0, travelingTo: null, carriedPlayer: false,
    lastChildCareAt: -999, lastWorkDay: -1, lastErrandDay: -1
  };
  return parent;
}

function generateTown() {
  const slots = [
    {x:1,y:1,w:5,h:4},{x:8,y:1,w:5,h:4},{x:16,y:1,w:5,h:4},
    {x:1,y:12,w:5,h:4},{x:8,y:12,w:5,h:4},{x:16,y:12,w:5,h:4},
    {x:16,y:6,w:5,h:4}
  ];
  const types = rng.shuffle(['home','grocery','school','hospital','social','workplace','park']);
  const labels = {
    home: 'Family Home', grocery: rng.pick(names.stores), school: rng.pick(names.schools), hospital: 'Community Hospital',
    social: 'Family Services', workplace: rng.pick(names.workplaces), park: 'Willow Park'
  };
  const colors = ['#c97d60','#d9a857','#7296a6','#a97ca2','#7aa176','#d28768','#789b72'];
  const locations = types.map((type, i) => ({...slots[i], type, name: labels[type], color: colors[i], doorX: slots[i].x + Math.floor(slots[i].w/2), doorY: slots[i].y + slots[i].h}));
  return { name: rng.pick(names.towns), locations };
}

function wealthFromParents(parents) {
  const base = parents.reduce((sum,p) => sum + p.traits.workEthic + p.traits.responsibility, 0) / (parents.length * 2);
  const score = base + rng.int(-25, 25) + (parents.length === 2 ? 8 : -8);
  if (score < 35) return {tier: 1, label: 'Severe hardship', money: rng.int(25,90), food: rng.int(1,4)};
  if (score < 50) return {tier: 2, label: 'Low income', money: rng.int(90,200), food: rng.int(3,7)};
  if (score < 67) return {tier: 3, label: 'Working class', money: rng.int(200,450), food: rng.int(6,10)};
  if (score < 82) return {tier: 4, label: 'Middle class', money: rng.int(450,850), food: rng.int(8,14)};
  return {tier: 5, label: 'Wealthy', money: rng.int(900,1800), food: rng.int(12,18)};
}

function createNewState(playerName, seed) {
  rng = new RNG(seed);
  const familyName = rng.pick(names.family);
  const parentCount = rng.chance(.27) ? 1 : 2;
  const parents = Array.from({length: parentCount}, (_,i) => createParent(i, familyName));
  const wealth = wealthFromParents(parents);
  const playerFirst = playerName.trim() || rng.pick(names.first);
  const player = {
    id: `player-${Date.now()}`,
    name: `${playerFirst} ${familyName}`,
    age: 0,
    stage: 'baby',
    generation: 1,
    location: 'home',
    x: 5 * TILE + 16, y: 4 * TILE + 16,
    dir: 'down', moving: false, carriedBy: null,
    needs: { health: 92, energy: 78, satiety: 75, hygiene: 80, comfort: 72, mood: 75 },
    development: { bonding: 50, stimulation: 35, stressExposure: 10, curiosity: 0, resilience: 35, grades: 50 },
    traits: [], hiddenTraits: [],
    crying: false, cryPower: 0,
    neglectTimer: 0, socialStatus: 'none', socialTimer: 0,
    school: { attendedToday: false, truancy: 0, incidents: 0 },
    relationships: [], children: [], partner: null,
    status: [], alive: true, causeOfDeath: null
  };
  return {
    version: 1,
    seed: String(seed), rngState: rng.state,
    world: generateTown(),
    household: {...wealth, reports: 0, cleanliness: rng.int(40,90), condition: rng.int(55,92), foster: false, upgrades: {childBed:false, decorLevel:Math.max(0, wealth.tier-2), rug:wealth.tier>=3, sofa:wealth.tier>=4, plant:wealth.tier>=5, studyDesk:false, wallPaint:wealth.tier>=4}},
    time: {day: 1, minute: 7*60, totalDays: 0},
    player, parents,
    parentRelationship: parentCount === 2 ? {affection:rng.int(35,85), trust:rng.int(35,85), tension:rng.int(5,45)} : null,
    familyTree: [{id:player.id,name:player.name,generation:1,parentIds:parents.map(p=>p.id),children:[],alive:true}],
    scene: 'home',
    log: [{day:1,text:`${player.name} was born into the ${familyName} family.`}],
    memoryFlags: {},
    lastEventDay: 0,
    startedAt: Date.now()
  };
}

function createChild(reason = 'A new child joined the family.') {
  if (!state) return;
  const familyName = state.player.name.split(' ').slice(-1)[0];
  const child = {
    id: `child-${Date.now()}-${rng.int(100,999)}`,
    name: `${rng.pick(names.first)} ${familyName}`,
    age: 0,
    stage: 'baby',
    health: rng.int(78,98),
    traits: [], relationships: [], children: [], alive: true,
    needs: { health:90, energy:80, satiety:80, hygiene:80, comfort:75, mood:78 },
    development: {bonding:50,stimulation:35,stressExposure:10,curiosity:0,resilience:35,grades:50}
  };
  state.player.children.push(child);
  const node = state.familyTree.find(n => n.id === state.player.id);
  if (node) node.children.push(child.id);
  state.familyTree.push({id:child.id,name:child.name,generation:state.player.generation+1,parentIds:[state.player.id],children:[],alive:true});
  addLog(`${child.name} was born. ${reason}`);
  toast(`${child.name} joined your family.`);
  return child;
}

function sceneObjects(scene = state?.scene) {
  if (!state) return [];
  if (scene === 'home') {
    const upgrades = state.household.upgrades || {};
    const sleepObject = state.player.stage === 'baby'
      ? {id:'crib',type:'crib',label:'Crib',x:5.5*TILE,y:4*TILE,w:TILE,h:TILE,solid:true}
      : upgrades.childBed
        ? {id:'childbed',type:'childbed',label:'Your bed',x:6*TILE,y:4*TILE,w:2*TILE,h:TILE,solid:true}
        : {id:'floorbed',type:'floorbed',label:'Temporary sleeping mat',x:5.8*TILE,y:4*TILE,w:1.6*TILE,h:.8*TILE,solid:true};
    return [
      {id:'bed',type:'bed',label:'Parents’ bed',x:3.5*TILE,y:3.5*TILE,w:2*TILE,h:TILE,solid:true},
      sleepObject,
      {id:'fridge',type:'fridge',label:'Get food',x:18*TILE,y:3.5*TILE,w:TILE,h:TILE,solid:true},
      {id:'stove',type:'stove',label:'Touch the stove',x:19*TILE,y:5*TILE,w:TILE,h:TILE,solid:true},
      {id:'table',type:'table',label:'Sit at the table',x:15*TILE,y:9*TILE,w:3*TILE,h:2*TILE,solid:true},
      {id:'toy',type:'toy',label:'Play with toy',x:9*TILE,y:11*TILE,w:TILE,h:TILE,solid:false},
      {id:'book',type:'book',label:upgrades.studyDesk?'Study at your desk':'Look at books',x:3*TILE,y:10*TILE,w:TILE,h:2*TILE,solid:true},
      ...(upgrades.rug ? [{id:'rug',type:'rug',label:'A warm rug',x:11*TILE,y:12*TILE,w:4*TILE,h:2*TILE,solid:false}] : []),
      ...(upgrades.sofa ? [{id:'sofa',type:'sofa',label:'Relax on the sofa',x:15*TILE,y:13*TILE,w:3*TILE,h:TILE,solid:true}] : []),
      ...(upgrades.plant ? [{id:'plant',type:'plant',label:'House plant',x:20*TILE,y:13*TILE,w:TILE,h:TILE,solid:false}] : []),
      {id:'door',type:'exit',label:'Go outside',x:11*TILE,y:17*TILE,w:TILE,h:TILE,solid:false},
      ...(state.player.stage === 'adult' ? [{id:'family',type:'family',label:'Talk about starting a family',x:7*TILE,y:3*TILE,w:TILE,h:TILE,solid:false}] : [])
    ];
  }
  if (scene === 'town') {
    return state.world.locations.map(loc => ({
      id:`enter-${loc.type}`, type:'enter', target:loc.type, label:`Enter ${loc.name}`,
      x:(loc.doorX+.5)*TILE, y:(loc.doorY+.35)*TILE, w:TILE, h:TILE, solid:false
    }));
  }
  const base = [{id:'exit',type:'exitTown',label:'Return to town',x:11*TILE,y:17*TILE,w:TILE,h:TILE,solid:false}];
  const extras = {
    park: [
      {id:'friend',type:'friend',label:'Talk to a child',x:7*TILE,y:8*TILE,w:TILE,h:TILE,solid:false},
      {id:'swing',type:'play',label:'Play on the swings',x:14*TILE,y:7*TILE,w:2*TILE,h:TILE,solid:true}
    ],
    school: [
      {id:'desk',type:'study',label:'Attend class',x:11*TILE,y:8*TILE,w:2*TILE,h:TILE,solid:true},
      {id:'teacher',type:'teacher',label:'Talk to your teacher',x:11*TILE,y:3*TILE,w:TILE,h:TILE,solid:false}
    ],
    grocery: [
      {id:'checkout',type:'checkout',label:'Buy groceries',x:17*TILE,y:13*TILE,w:2*TILE,h:TILE,solid:true},
      ...[4,7,10,13].map((x,i)=>({id:`shelf-${i}`,type:'shelf',label:'Browse groceries',x:x*TILE,y:7*TILE,w:2*TILE,h:TILE,solid:true}))
    ],
    workplace: [{id:'workdesk',type:'work',label:'Work a shift',x:11*TILE,y:7*TILE,w:2*TILE,h:TILE,solid:true}],
    hospital: [{id:'doctor',type:'doctor',label:'See a doctor',x:11*TILE,y:6*TILE,w:TILE,h:TILE,solid:false}],
    social: [{id:'caseworker',type:'caseworker',label:'Speak with a case worker',x:11*TILE,y:6*TILE,w:TILE,h:TILE,solid:false}]
  };
  return [...base, ...(extras[scene] || [])];
}

function sceneBlocks(scene = state?.scene) {
  if (!state) return [];
  if (scene === 'town') {
    return state.world.locations.filter(l=>l.type!=='park').map(l => ({x:l.x*TILE,y:l.y*TILE,w:l.w*TILE,h:l.h*TILE}));
  }
  return sceneObjects(scene).filter(o=>o.solid).map(o=>({x:o.x-o.w/2,y:o.y-o.h/2,w:o.w,h:o.h}));
}

function collides(x, y, radius = 9) {
  if (x < radius || y < radius || x > canvas.width-radius || y > canvas.height-radius) return true;
  for (const b of sceneBlocks()) {
    if (x+radius > b.x && x-radius < b.x+b.w && y+radius > b.y && y-radius < b.y+b.h) return true;
  }
  return false;
}

function setScene(scene, entry = null) {
  state.scene = scene;
  state.player.location = scene;
  state.player.carriedBy = null;
  if (scene === 'town') {
    const home = state.world.locations.find(l=>l.type==='home');
    state.player.x = (home.doorX+.5)*TILE;
    state.player.y = Math.min(canvas.height-28,(home.doorY+1.4)*TILE);
  } else {
    state.player.x = entry?.x ?? 11*TILE+16;
    state.player.y = entry?.y ?? 16*TILE+8;
  }
  nearbyObject = null;
  toast(scene === 'town' ? state.world.name : locationLabel(scene));
}

function locationLabel(scene) {
  if (scene === 'town') return state?.world?.name || 'Town';
  const loc = state?.world?.locations?.find(l=>l.type===scene);
  return loc?.name || titleCase(scene || 'home');
}

function addLog(text) {
  if (!state) return;
  state.log.unshift({day:state.time.day,text});
  state.log = state.log.slice(0, 30);
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  dom.toastLayer.prepend(el);
  setTimeout(() => el.remove(), 3800);
}

function saveGame(showToast = true) {
  if (!state) return;
  state.rngState = rng.state;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    if (showToast) toast('Life saved.');
    dom.continueBtn.disabled = false;
  } catch (err) {
    toast('Save failed in this browser.');
    console.error(err);
  }
}

function loadGame() {
  const raw = storageGet(SAVE_KEY);
  if (!raw) return false;
  try {
    state = JSON.parse(raw);
    rng = new RNG(state.seed, state.rngState);
    state.player.stage = stageForAge(state.player.age);
    ensureStateShape();
    closeMenu();
    toast(`Welcome back, ${state.player.name.split(' ')[0]}.`);
    return true;
  } catch (err) {
    console.error(err);
    storageRemove(SAVE_KEY);
    return false;
  }
}

function ensureStateShape() {
  state.player.children ||= [];
  state.player.relationships ||= [];
  state.player.status ||= [];
  state.player.school ||= {attendedToday:false,truancy:0,incidents:0};
  state.memoryFlags ||= {};
  state.log ||= [];
  state.household.reports ||= 0;
  state.household.condition ??= 70;
  state.household.upgrades ||= {};
  const upgrades = state.household.upgrades;
  upgrades.childBed ??= false;
  upgrades.decorLevel ??= Math.max(0, (state.household.tier || 2) - 2);
  upgrades.rug ??= upgrades.decorLevel >= 1;
  upgrades.sofa ??= upgrades.decorLevel >= 2;
  upgrades.plant ??= upgrades.decorLevel >= 3;
  upgrades.studyDesk ??= false;
  upgrades.wallPaint ??= upgrades.decorLevel >= 2;
  state.parents.forEach(parent => {
    parent.lastChildCareAt ??= -999;
    parent.lastWorkDay ??= -1;
    parent.lastErrandDay ??= -1;
    parent.lastDecorDay ??= -1;
    const careNoLongerNeeded = parent.action === 'feeding child' && (state.household.food <= 0 || state.player.needs.satiety >= 55 || !['baby','toddler'].includes(state.player.stage));
    if (careNoLongerNeeded) { parent.actionTimer = 0; parent.decisionTimer = 0; }
  });
  state.scene ||= 'home';
}

function updateTime(dt) {
  const mult = SPEEDS[speedIndex];
  const previousDay = state.time.day;
  state.time.minute += dt * mult * 6;
  while (state.time.minute >= 1440) {
    state.time.minute -= 1440;
    state.time.day++;
    state.time.totalDays++;
    dailyReset();
  }
  state.player.age += dt * mult / 100;
  for (const child of state.player.children) {
    child.age += dt * mult / 100;
    child.stage = stageForAge(child.age);
  }
  const oldStage = state.player.stage;
  const newStage = stageForAge(state.player.age);
  if (newStage !== oldStage) changeStage(newStage, oldStage);
  if (previousDay !== state.time.day) maybeDailyEvent();
}

function dailyReset() {
  const attendedYesterday = state.player.school.attendedToday;
  state.player.school.attendedToday = false;
  if (state.parentRelationship) {
    state.parentRelationship.tension = clamp(state.parentRelationship.tension + rng.int(-4,5));
    state.parentRelationship.affection = clamp(state.parentRelationship.affection + rng.int(-2,2));
  }
  state.household.cleanliness = clamp(state.household.cleanliness - rng.int(1,4));
  state.household.condition = clamp(state.household.condition - rng.int(0,2));
  if (['child','teen'].includes(state.player.stage) && (state.time.totalDays - 1) % 7 < 5 && !attendedYesterday) {
    state.player.school.truancy++;
  }
}

function changeStage(newStage, oldStage) {
  state.player.stage = newStage;
  state.player.crying = false;
  state.player.carriedBy = null;
  revealTrait(newStage);
  const copy = {
    toddler: ['First steps', 'You can now move around the house and interact with the world. Curiosity brings discovery—and danger.'],
    child: ['The first school day', 'School, friendships, grades, and independence are now part of your life.'],
    teen: ['A changing voice', 'Your personality is becoming clearer. Work, romance, and rebellion are now possible.'],
    adult: ['Your own direction', 'You can build a career, form a household, and decide whether another generation begins.'],
    elder: ['The long view', 'Age carries memories and risk. Your children may one day inherit the story.']
  }[newStage];
  if (copy) showModal('LIFE STAGE', copy[0], copy[1], [{label:'Continue',action:()=>{}}]);
  addLog(`${state.player.name} entered the ${newStage} stage.`);
  toast(`New life stage: ${titleCase(newStage)}`);
}

function revealTrait(stage) {
  const d = state.player.development;
  let trait;
  if (stage === 'toddler') trait = d.bonding > 60 ? 'Secure' : d.stressExposure > 45 ? 'Watchful' : 'Sensitive';
  if (stage === 'child') trait = d.curiosity > 50 ? 'Curious' : d.stimulation > 55 ? 'Imaginative' : 'Cautious';
  if (stage === 'teen') trait = d.resilience > 60 ? 'Resilient' : d.stressExposure > 60 ? 'Anxious' : 'Independent';
  if (stage === 'adult') trait = d.grades > 70 ? 'Disciplined' : d.bonding > 65 ? 'Compassionate' : 'Pragmatic';
  if (trait && !state.player.traits.includes(trait)) {
    state.player.traits.push(trait);
    addLog(`A trait became clear: ${trait}.`);
  }
}

function updatePlayerNeeds(dt) {
  const mult = SPEEDS[speedIndex];
  const n = state.player.needs;
  const stage = state.player.stage;
  const satietyDecay = {baby:.8,toddler:.34,child:.22,teen:.2,adult:.18,elder:.2}[stage] ?? .22;
  const energyDecay = {baby:.16,toddler:.2,child:.16,teen:.18,adult:.16,elder:.18}[stage] ?? .16;
  const hygieneDecay = {baby:.16,toddler:.11,child:.09,teen:.08,adult:.07,elder:.08}[stage] ?? .08;
  const comfortDecay = {baby:.24,toddler:.12,child:.08,teen:.06,adult:.05,elder:.06}[stage] ?? .08;
  n.satiety = clamp(n.satiety - dt * mult * satietyDecay);
  n.energy = clamp(n.energy - dt * mult * energyDecay);
  n.hygiene = clamp(n.hygiene - dt * mult * hygieneDecay);
  n.comfort = clamp(n.comfort - dt * mult * comfortDecay);
  n.mood = clamp(n.mood + dt * mult * ((n.satiety > 40 && n.comfort > 40) ? .03 : -.12));
  if (n.satiety < 12 || n.hygiene < 10 || n.comfort < 8) n.health = clamp(n.health - dt * mult * .12);
  else n.health = clamp(n.health + dt * mult * .012);

  if (stage === 'baby') {
    const care = (n.satiety + n.hygiene + n.comfort + n.health + n.energy) / 5;
    if (care < 28) state.player.neglectTimer += dt * mult;
    else state.player.neglectTimer = Math.max(0, state.player.neglectTimer - dt * mult * .7);
    if (state.player.crying) {
      state.player.cryPower = clamp(state.player.cryPower + dt * mult * 8);
      n.energy = clamp(n.energy - dt * mult * .28);
      n.comfort = clamp(n.comfort - dt * mult * .08);
    } else state.player.cryPower = Math.max(0, state.player.cryPower - dt * mult * 10);
    updateSocialServices(dt, care);
    state.player.development.bonding = clamp(state.player.development.bonding + dt * mult * (care > 65 ? .015 : -.012));
    state.player.development.stressExposure = clamp(state.player.development.stressExposure + dt * mult * (care < 35 ? .035 : -.004));
  }
  if (n.health <= 0) die('complications from poor health');
}

function updateSocialServices(dt, care) {
  const p = state.player;
  if (p.socialStatus === 'none' && p.neglectTimer > 45) {
    p.socialStatus = 'dispatched';
    p.socialTimer = 14;
    state.household.reports++;
    addLog('A concern report reached Family Services.');
    toast('A social worker has been dispatched.');
  } else if (p.socialStatus === 'dispatched') {
    p.socialTimer -= dt * SPEEDS[speedIndex];
    if (p.socialTimer <= 0) evaluateHome(care);
  }
}

function evaluateHome(care) {
  const avgResponsibility = state.parents.length ? state.parents.reduce((s,p)=>s+p.traits.responsibility,0)/state.parents.length : 50;
  const score = care * .45 + avgResponsibility * .25 + state.household.food * 2 + state.household.cleanliness * .15 - state.household.reports * 7;
  if (score < 30) {
    state.household.foster = true;
    state.household.label = 'Foster placement';
    state.household.food = 9;
    state.household.money = 180;
    state.player.development.stressExposure = clamp(state.player.development.stressExposure + 18);
    state.player.development.bonding = clamp(state.player.development.bonding - 12);
    const familyName = state.player.name.split(' ').slice(-1)[0];
    state.parents = [createParent(0, familyName)];
    state.parents[0].role = 'Foster caregiver';
    state.parents[0].traits.responsibility = 82;
    state.parents[0].traits.warmth = 72;
    state.player.needs.satiety = 70;
    state.player.needs.hygiene = 70;
    state.player.needs.comfort = 55;
    showModal('FAMILY SERVICES','Temporary placement','The home was judged unsafe for now. You have been moved to a foster caregiver. The change will shape future relationships.',[{label:'Continue',action:()=>{}}]);
    addLog('Family Services arranged a temporary foster placement.');
  } else if (score < 52) {
    state.household.food += 5;
    state.player.socialStatus = 'monitoring';
    showModal('FAMILY SERVICES','Support and monitoring','The social worker found serious strain, but also signs that support could help. Food assistance and follow-up visits begin.',[{label:'Continue',action:()=>{}}]);
    addLog('The household received support and monitoring.');
  } else {
    state.player.socialStatus = 'resolved';
    showModal('FAMILY SERVICES','A difficult visit','The social worker documented the concern, but no removal occurred. Your caregivers were warned and offered support.',[{label:'Continue',action:()=>{}}]);
    addLog('A social worker completed a home visit.');
  }
  state.player.neglectTimer = 0;
}

function parentActionOptions(parent) {
  const p = state.player;
  const n = parent.needs;
  const hour = state.time.minute / 60;
  const weekday = isWeekday();
  const workWindow = weekday && isWorkWindow(hour);
  const afterWork = hour >= 17 && hour < 20;
  const care = childCareUrgency();
  const childStageWeight = CHILDCARE_STAGE_WEIGHT[p.stage] ?? 0;
  const careCooldown = Math.max(0, CHILDCARE_COOLDOWN - ((timeStampDayFraction() - parent.lastChildCareAt) * 1440));
  const anotherHelping = activeCaregiverExists(parent);
  const moneyPressure = Math.max(0, 320 - state.household.money);
  const foodPressure = Math.max(0, 8 - state.household.food);
  const upgrades = state.household.upgrades;
  const bedCost = 140;
  const deskCost = 110;
  const decorCost = 80 + upgrades.decorLevel * 45;
  const desiredDecor = Math.min(4, Math.max(1, state.household.tier));
  const canBuyBed = p.age >= 2 && p.age < 13 && !upgrades.childBed && state.household.money >= bedCost;
  const canBuyDesk = p.stage === 'child' && !upgrades.studyDesk && state.household.money >= deskCost + 80;
  const canDecorate = upgrades.decorLevel < desiredDecor && state.household.money >= decorCost + 120 && parent.lastDecorDay !== state.time.totalDays;
  const opts = [
    {name:'sleeping',score:(100-n.energy)*1.35 + (hour>22||hour<6?42:0),loc:'home',target:{x:4*TILE,y:4*TILE},duration:6},
    {name:'eating',score:(100-n.satiety)*1.05,loc:'home',target:{x:18*TILE,y:4*TILE},duration:3},
    {name:'buying groceries',score:foodPressure*12 + (state.household.food<3?55:0) + (afterWork?16:0) - (workWindow?12:0),loc:'grocery',target:{x:17*TILE,y:13*TILE},duration:7},
    {name:'working',score:(workWindow?88:8) + moneyPressure*.16 + parent.traits.workEthic*.5 - (100-n.energy)*.28 - (parent.struggle==='burnout'?14:0),loc:'workplace',target:{x:11*TILE,y:7*TILE},duration:9},
    {name:'relaxing',score:n.stress*.7 + (100-n.mood)*.25 + (!workWindow?8:0),loc:'home',target:{x:14*TILE,y:10*TILE},duration:5},
    {name:'cleaning',score:(100-state.household.cleanliness)*.55 + parent.traits.responsibility*.16 + (!workWindow?8:0),loc:'home',target:{x:12*TILE,y:8*TILE},duration:5},
    {name:'repairing the house',score:state.household.condition<55?(100-state.household.condition)*1.15+parent.traits.responsibility*.2:-999,loc:'home',target:{x:12*TILE,y:8*TILE},duration:7},
    {name:'buying a child bed',score:canBuyBed?(workWindow?62:118)+(100-p.needs.energy)*.22+parent.traits.responsibility*.2:-999,loc:'grocery',target:{x:17*TILE,y:13*TILE},duration:8},
    {name:'buying a study desk',score:canBuyDesk?(workWindow?24:68)+parent.traits.responsibility*.2:-999,loc:'grocery',target:{x:17*TILE,y:13*TILE},duration:8},
    {name:'shopping for home decor',score:canDecorate?(afterWork?64:28)+(state.household.money-350)*.025+parent.traits.responsibility*.1:-999,loc:'grocery',target:{x:17*TILE,y:13*TILE},duration:8},
    {
      name:'playing with child',
      score: childStageWeight > 0 ? Math.max(0, parent.traits.warmth*.22 + care.mood*1.2 + (afterWork?18:0) + (p.stage==='toddler'?15:0) - n.stress*.18 - (anotherHelping?26:0)) : -999,
      loc:p.location,target:{x:p.x,y:p.y},duration:4
    },
    {
      name:'feeding child',
      score: (state.household.food > 0 && childStageWeight > 0 && care.satiety > 0)
        ? Math.max(0, care.satiety*3.2*childStageWeight + (p.stage==='baby'?18:0) - careCooldown*2.2 - (anotherHelping?42:0))
        : -999,
      loc:p.location,target:{x:p.x,y:p.y},duration:3
    },
    {
      name:'comforting child',
      score: childStageWeight > 0
        ? Math.max(0, (p.crying?75:0) + care.comfort*2.6*childStageWeight + parent.traits.warmth*.18 - n.stress*.22 - (anotherHelping?38:0))
        : -999,
      loc:p.location,target:{x:p.x,y:p.y},duration:3
    },
    {
      name:'changing child',
      score: childStageWeight > 0 && care.hygiene > 0
        ? Math.max(0, care.hygiene*2.8*childStageWeight + parent.traits.responsibility*.15 - (anotherHelping?34:0))
        : -999,
      loc:p.location,target:{x:p.x,y:p.y},duration:3
    }
  ];
  if (state.parentRelationship && state.parentRelationship.tension > 60) {
    opts.push({name:'arguing',score:state.parentRelationship.tension*.55+parent.traits.impulsiveness*.35,loc:'home',target:{x:11*TILE,y:8*TILE},duration:4});
  }
  if (parent.struggle) {
    opts.push({name:'withdrawing',score:parent.needs.stress*.7+parent.traits.impulsiveness*.25,loc:'home',target:{x:3*TILE,y:13*TILE},duration:6});
  }
  opts.forEach(o => o.score += rng.next()*6);
  return opts.sort((a,b)=>b.score-a.score);
}

function chooseParentAction(parent) {
  const option = parentActionOptions(parent)[0];
  parent.action = option.name;
  parent.target = option.target;
  parent.actionTimer = option.duration;
  parent.carriedPlayer = false;
  if (parent.location !== option.loc) {
    parent.travelingTo = option.loc;
    parent.travelTimer = 4 + rng.next()*4;
    const canBring = state.player.stage === 'baby' && state.player.location === parent.location;
    const bringScore = parent.traits.responsibility + parent.traits.warmth - parent.needs.stress - (parent.struggle ? 20 : 0);
    if (canBring && bringScore > 55 && !['working','arguing','withdrawing'].includes(option.name)) {
      parent.carriedPlayer = true;
      state.player.carriedBy = parent.id;
    }
  }
}

function completeParentAction(parent) {
  const pn = parent.needs;
  switch (parent.action) {
    case 'sleeping': pn.energy=clamp(pn.energy+55); pn.stress=clamp(pn.stress-15); break;
    case 'eating': if(state.household.food>0){state.household.food--;pn.satiety=clamp(pn.satiety+55);} break;
    case 'buying groceries': {
      const spend = Math.min(state.household.money, rng.int(24,46));
      state.household.money -= spend; state.household.food += Math.max(3,Math.round(spend/4));
      parent.lastErrandDay = state.time.totalDays;
      break;
    }
    case 'working': state.household.money += rng.int(26,52); pn.energy=clamp(pn.energy-18); pn.stress=clamp(pn.stress+8); parent.lastWorkDay = state.time.totalDays; break;
    case 'relaxing': pn.stress=clamp(pn.stress-28);pn.mood=clamp(pn.mood+18);break;
    case 'cleaning': state.household.cleanliness=clamp(state.household.cleanliness+25);pn.energy=clamp(pn.energy-8);break;
    case 'repairing the house': state.household.condition=clamp(state.household.condition+32);state.household.money=Math.max(0,state.household.money-35);pn.energy=clamp(pn.energy-12);addLog(`${parent.name.split(' ')[0]} repaired worn parts of the house.`);break;
    case 'buying a child bed':
      if(!state.household.upgrades.childBed && state.household.money>=140){state.household.money-=140;state.household.upgrades.childBed=true;parent.lastErrandDay=state.time.totalDays;toast(`${parent.name.split(' ')[0]} bought you a proper bed.`);addLog(`${parent.name} bought a child-sized bed for ${state.player.name}.`);}break;
    case 'buying a study desk':
      if(!state.household.upgrades.studyDesk && state.household.money>=110){state.household.money-=110;state.household.upgrades.studyDesk=true;parent.lastErrandDay=state.time.totalDays;toast('A study desk was added to your room.');addLog(`${parent.name} bought a study desk for the house.`);}break;
    case 'shopping for home decor': {
      const upgrades=state.household.upgrades;
      const cost=80+upgrades.decorLevel*45;
      if(state.household.money>=cost){state.household.money-=cost;upgrades.decorLevel=Math.min(4,upgrades.decorLevel+1);upgrades.rug=upgrades.decorLevel>=1;upgrades.wallPaint=upgrades.decorLevel>=2;upgrades.sofa=upgrades.decorLevel>=3;upgrades.plant=upgrades.decorLevel>=4;parent.lastDecorDay=state.time.totalDays;toast(`${parent.name.split(' ')[0]} improved the house.`);addLog(`${parent.name} spent ${peso(cost)} improving the home.`);}break;
    }
    case 'playing with child': state.player.needs.mood=clamp(state.player.needs.mood+22);state.player.needs.comfort=clamp(state.player.needs.comfort+18);state.player.development.stimulation=clamp(state.player.development.stimulation+4);state.player.development.bonding=clamp(state.player.development.bonding+3); parent.lastChildCareAt = timeStampDayFraction(); break;
    case 'feeding child': if(state.household.food>0){state.household.food--;state.player.needs.satiety=Math.max(state.player.needs.satiety, 82);state.player.needs.comfort=clamp(state.player.needs.comfort+8);state.player.crying=false;state.player.development.bonding=clamp(state.player.development.bonding+2); parent.lastChildCareAt = timeStampDayFraction();}break;
    case 'comforting child': state.player.needs.comfort=Math.max(state.player.needs.comfort, 76);state.player.needs.mood=clamp(state.player.needs.mood+24);state.player.crying=false;state.player.development.bonding=clamp(state.player.development.bonding+3); parent.lastChildCareAt = timeStampDayFraction(); break;
    case 'changing child': state.player.needs.hygiene=Math.max(state.player.needs.hygiene, 84);state.player.needs.comfort=clamp(state.player.needs.comfort+12); parent.lastChildCareAt = timeStampDayFraction(); break;
    case 'arguing': if(state.parentRelationship){state.parentRelationship.tension=clamp(state.parentRelationship.tension+12);state.parentRelationship.affection=clamp(state.parentRelationship.affection-5);state.player.development.stressExposure=clamp(state.player.development.stressExposure+4);}break;
    case 'withdrawing': pn.stress=clamp(pn.stress-8);pn.mood=clamp(pn.mood-4);break;
  }
  parent.actionTimer = 0;
  parent.decisionTimer = 1.2 + rng.next()*2.2;
}

function updateParents(dt) {
  const mult = SPEEDS[speedIndex];
  for (const parent of state.parents) {
    parent.needs.energy=clamp(parent.needs.energy-dt*mult*.12);
    parent.needs.satiety=clamp(parent.needs.satiety-dt*mult*.18);
    parent.needs.stress=clamp(parent.needs.stress+dt*mult*(state.household.money<80?.09:.015));
    if (parent.struggle) parent.needs.stress=clamp(parent.needs.stress+dt*mult*.025);
    parent.decisionTimer -= dt*mult;
    if (parent.travelingTo) {
      parent.travelTimer -= dt*mult;
      if (parent.travelTimer <= 0) {
        parent.location = parent.travelingTo;
        parent.travelingTo = null;
        parent.x = parent.target?.x ?? 11*TILE;
        parent.y = parent.target?.y ?? 8*TILE;
        if (parent.carriedPlayer) {
          state.scene = parent.location;
          state.player.location = parent.location;
          state.player.x = parent.x+12; state.player.y=parent.y+6;
          toast(`${parent.name.split(' ')[0]} brought you to ${locationLabel(parent.location)}.`);
        }
      }
      continue;
    }
    if (parent.actionTimer <= 0 || parent.decisionTimer <= 0) chooseParentAction(parent);
    const sameScene = parent.location === state.scene;
    if (sameScene && parent.target) {
      const dx=parent.target.x-parent.x,dy=parent.target.y-parent.y,d=Math.hypot(dx,dy);
      if(d>8){parent.x+=dx/d*dt*mult*48;parent.y+=dy/d*dt*mult*48;}
      else parent.actionTimer-=dt*mult;
    } else parent.actionTimer-=dt*mult;
    if(parent.carriedPlayer && state.player.carriedBy===parent.id && sameScene){state.player.x=parent.x+12;state.player.y=parent.y+6;}
    if(parent.actionTimer<=0) completeParentAction(parent);
  }
}

function updateMovement(dt) {
  const p = state.player;
  p.moving = false;
  if (p.stage === 'baby' || p.carriedBy || modalOpen) return;
  let dx=0,dy=0;
  if(keys.has('w')||keys.has('arrowup')||touchDirs.has('up'))dy--;
  if(keys.has('s')||keys.has('arrowdown')||touchDirs.has('down'))dy++;
  if(keys.has('a')||keys.has('arrowleft')||touchDirs.has('left'))dx--;
  if(keys.has('d')||keys.has('arrowright')||touchDirs.has('right'))dx++;
  if(!dx&&!dy)return;
  const len=Math.hypot(dx,dy);dx/=len;dy/=len;
  const speed = p.stage==='toddler'?72:108;
  const nx=p.x+dx*speed*dt,ny=p.y+dy*speed*dt;
  if(!collides(nx,p.y))p.x=nx;
  if(!collides(p.x,ny))p.y=ny;
  p.moving=true;
  if(Math.abs(dx)>Math.abs(dy))p.dir=dx>0?'right':'left';else p.dir=dy>0?'down':'up';

  if (state.scene==='town' && p.stage==='toddler') {
    const onRoad = Math.abs(p.x-11*TILE)<TILE*1.3 || Math.abs(p.y-9*TILE)<TILE*1.3;
    const supervised = state.parents.some(par=>par.location==='town'&&Math.hypot(par.x-p.x,par.y-p.y)<110);
    if(onRoad&&!supervised&&rng.chance(dt*.04)) hazard('street');
  }
}

function updateNearby() {
  nearbyObject = null;
  if (!state || state.player.stage==='baby') {
    dom.interactionPrompt.classList.add('hidden'); return;
  }
  let best=56;
  for(const o of sceneObjects()){
    const d=Math.hypot(state.player.x-o.x,state.player.y-o.y);
    if(d<best){best=d;nearbyObject=o;}
  }
  if(nearbyObject){dom.interactionPrompt.textContent=`E · ${nearbyObject.label}`;dom.interactionPrompt.classList.remove('hidden');}
  else dom.interactionPrompt.classList.add('hidden');
}

function interact() {
  if (!state || modalOpen) return;
  if (state.player.stage==='baby') { cry(); return; }
  updateNearby();
  const o=nearbyObject;
  if(!o){toast('Nothing nearby to interact with.');return;}
  const p=state.player,n=p.needs;
  switch(o.type){
    case 'bed': n.energy=clamp(n.energy+35);n.mood=clamp(n.mood+4);addLog('You rested in the adults’ bed.');break;
    case 'crib': n.energy=clamp(n.energy+28);break;
    case 'childbed': n.energy=clamp(n.energy+58);n.comfort=clamp(n.comfort+18);toast('Your own bed feels safe and comfortable.');break;
    case 'floorbed': n.energy=clamp(n.energy+26);n.comfort=clamp(n.comfort+3);toast('The temporary sleeping mat is better than the floor, but not very comfortable.');break;
    case 'sofa': n.energy=clamp(n.energy+18);n.mood=clamp(n.mood+10);toast('You relax on the sofa.');break;
    case 'rug': n.comfort=clamp(n.comfort+5);toast('The rug makes the room feel warmer.');break;
    case 'plant': n.mood=clamp(n.mood+4);toast('The plant makes the room feel alive.');break;
    case 'fridge': if(state.household.food>0){state.household.food--;n.satiety=clamp(n.satiety+55);toast('You ate something from the fridge.');}else toast('The refrigerator is empty.');break;
    case 'stove': hazard('stove');break;
    case 'toy': p.development.curiosity=clamp(p.development.curiosity+8);p.development.stimulation=clamp(p.development.stimulation+5);n.mood=clamp(n.mood+18);toast('Play builds curiosity.');break;
    case 'book': p.development.curiosity=clamp(p.development.curiosity+5);p.development.grades=clamp(p.development.grades+3);toast('A story opens another world.');break;
    case 'exit': attemptLeaveHome();break;
    case 'exitTown': setScene('town');break;
    case 'enter': enterLocation(o.target);break;
    case 'friend': meetFriend();break;
    case 'play': p.development.curiosity=clamp(p.development.curiosity+5);n.mood=clamp(n.mood+20);n.energy=clamp(n.energy-8);toast('You play until your legs feel light.');break;
    case 'study': p.development.grades=clamp(p.development.grades+7);p.school.attendedToday=true;n.energy=clamp(n.energy-5);toast('You attended class.');addLog('You spent time learning at school.');break;
    case 'teacher': p.development.grades=clamp(p.development.grades+2);toast('Your teacher offers a little guidance.');break;
    case 'checkout': buyGroceries();break;
    case 'shelf': toast('You compare prices and count what the household can afford.');break;
    case 'work': workShift();break;
    case 'doctor': seeDoctor();break;
    case 'caseworker': state.household.reports=Math.max(0,state.household.reports-1);toast('You ask about available family support.');break;
    case 'family': familyConversation();break;
  }
}

function attemptLeaveHome() {
  const p=state.player;
  if(p.stage==='toddler'){
    const nearParent=state.parents.some(par=>par.location==='home'&&Math.hypot(par.x-p.x,par.y-p.y)<130);
    const permissive=state.parents.some(par=>par.traits.strictness<35);
    if(!nearParent&&!permissive){toast('The door is too difficult to open alone.');return;}
  }
  setScene('town');
}

function enterLocation(target) {
  const p=state.player;
  if(target==='home'){setScene('home');return;}
  if(p.stage==='toddler'){
    const accompanied=state.parents.some(par=>par.location==='town'&&Math.hypot(par.x-p.x,par.y-p.y)<150);
    if(!accompanied){toast('You need a caregiver to go inside.');return;}
  }
  setScene(target);
  if(target==='school' && ['child','teen'].includes(p.stage)) p.school.attendedToday=true;
}

function hazard(type) {
  const p=state.player;
  const supervised=state.parents.some(par=>par.location===state.scene&&Math.hypot(par.x-p.x,par.y-p.y)<120);
  const risk=(p.stage==='toddler'?.5:.2)*(supervised?.35:1);
  if(!rng.chance(risk)){toast(type==='stove'?'A caregiver stops you before you are hurt.':'You get back to safety.');return;}
  const damage=rng.int(8,34);
  p.needs.health=clamp(p.needs.health-damage);
  p.development.stressExposure=clamp(p.development.stressExposure+damage*.25);
  p.development.resilience=clamp(p.development.resilience+2);
  showModal('ACCIDENT', type==='stove'?'A painful burn':'A close call in the street', `The accident costs ${damage} health. ${supervised?'A caregiver was nearby and reacted quickly.':'No caregiver was close enough to prevent it.'}`, [{label:'Continue',action:()=>{}}]);
  addLog(`An accident caused ${damage} health damage.`);
  if(p.needs.health<=0)die(type==='stove'?'a household accident':'a road accident');
}

function meetFriend() {
  let rel=state.player.relationships.find(r=>r.role==='friend');
  if(!rel){
    rel={id:`npc-${rng.int(1000,9999)}`,name:rng.pick(names.first),role:'friend',affection:20,conflict:0,history:['Met at the park']};
    state.player.relationships.push(rel);
    showModal('NEW RELATIONSHIP',`You meet ${rel.name}`,`${rel.name} is playing nearby. A cautious hello becomes the beginning of a recurring friendship.`,[{label:'Play together',action:()=>{rel.affection+=12;state.player.development.bonding=clamp(state.player.development.bonding+3);}}]);
    addLog(`You met ${rel.name} at the park.`);
  } else {rel.affection=clamp(rel.affection+8);toast(`Your friendship with ${rel.name} grows.`);}
}

function buyGroceries() {
  const cost=24;
  if(state.household.money<cost){toast('The household cannot afford a full basket.');return;}
  state.household.money-=cost;state.household.food+=7;toast('You bring home seven food portions.');addLog('The household stocked up on groceries.');
}
function workShift(){
  if(!['teen','adult','elder'].includes(state.player.stage)){toast('You are too young to work here.');return;}
  const pay=state.player.stage==='teen'?18:rng.int(35,65);state.household.money+=pay;state.player.needs.energy=clamp(state.player.needs.energy-18);state.player.needs.mood=clamp(state.player.needs.mood-3);toast(`You earned ${peso(pay)}.`);
}
function seeDoctor(){
  const cost=Math.min(35,state.household.money);state.household.money-=cost;state.player.needs.health=clamp(state.player.needs.health+45);toast(`Treatment restored health and cost ${peso(cost)}.`);
}
function familyConversation(){
  if(state.player.stage!=='adult'){return;}
  if(!state.player.partner){
    state.player.partner={id:`partner-${rng.int(100,999)}`,name:rng.pick(names.first),affection:65};
    showModal('RELATIONSHIP','A shared future',`${state.player.partner.name} has become an important part of your life. Together, you begin talking about the future.`,[{label:'Build a life together',action:()=>{}}]);
    return;
  }
  showModal('FAMILY', 'Another beginning?', `You and ${state.player.partner.name} discuss raising a child. Parenthood will add responsibility, cost, and a possible next generation.`,[
    {label:'Welcome a child',action:()=>createChild('You chose to begin another generation.')},
    {label:'Not yet',action:()=>toast('The decision can wait.')}
  ]);
}

function cry() {
  if(!state||state.player.stage!=='baby'||modalOpen)return;
  state.player.crying=true;
  state.player.cryPower=clamp(state.player.cryPower+22);
  state.player.needs.comfort=clamp(state.player.needs.comfort-3);
  const nearby=state.parents.filter(p=>p.location===state.player.location);
  const heard=nearby.some(p=>rng.chance(clamp((p.traits.patience+p.traits.warmth-p.needs.stress)/130,.05,.92)));
  toast(heard?'Someone heard you crying.':'Your cry goes unanswered for now.');
  addLog(heard?'Your cry caught a caregiver’s attention.':'You cried, but nobody responded immediately.');
  if(heard){
    const p=nearby.sort((a,b)=>(b.traits.warmth-b.needs.stress)-(a.traits.warmth-a.needs.stress))[0];
    if(p){p.actionTimer=0;p.decisionTimer=0;}
  }
}

const LIFE_EVENTS = [
  {stages:['baby'],title:'A quiet lullaby',body:'One caregiver has a rare calm evening and hums beside your crib.',choices:[['Listen',s=>{s.player.development.bonding+=6;s.player.needs.comfort+=18;}]]},
  {stages:['baby'],title:'An extra shift',body:'Money is low, and a caregiver considers working longer while your needs keep rising.',choices:[['They take the shift',s=>{s.household.money+=42;s.player.development.stressExposure+=4;}],['They stay home',s=>{s.player.development.bonding+=5;s.household.money-=12;}]]},
  {stages:['baby','toddler'],title:'The cupboard is nearly empty',body:'Only a few food portions remain. The household must decide what to prioritize.',choices:[['Buy basics',s=>{if(s.household.money>=20){s.household.money-=20;s.household.food+=5;}else{s.player.needs.satiety-=12;}}],['Stretch what remains',s=>{s.household.food=Math.max(0,s.household.food-1);s.player.needs.satiety-=8;}]]},
  {stages:['baby','toddler'],title:'A family visitor',body:'A relative visits and brings warmth, noise, and a small bag of groceries.',choices:[['Welcome them',s=>{s.household.food+=3;s.player.development.stimulation+=5;s.player.needs.mood+=10;}]]},
  {stages:['toddler'],title:'A new word',body:'After days of listening, you manage a word that makes everyone stop and smile.',choices:[['Say it again',s=>{s.player.development.stimulation+=8;s.player.needs.mood+=15;}]]},
  {stages:['toddler'],title:'The broken toy',body:'Your favorite toy snaps during play.',choices:[['Try to fix it',s=>{s.player.development.curiosity+=8;s.player.development.resilience+=3;}],['Cry for help',s=>{s.player.needs.comfort-=5;s.player.development.bonding+=2;}]]},
  {stages:['toddler','child'],title:'Rain over the park',body:'The park empties as a sudden rain begins. A child nearby offers to share an umbrella.',choices:[['Walk together',s=>{s.player.development.bonding+=4;s.player.needs.mood+=8;}],['Run home',s=>{s.player.development.resilience+=2;}]]},
  {stages:['child'],title:'A difficult classmate',body:'A classmate starts making cutting remarks when the teacher looks away.',choices:[['Tell the teacher',s=>{s.player.school.incidents=Math.max(0,s.player.school.incidents-1);s.player.development.resilience+=4;}],['Talk back',s=>{s.player.school.incidents+=1;s.player.development.resilience+=2;s.player.needs.mood-=5;}],['Walk away',s=>{s.player.development.resilience+=3;}]]},
  {stages:['child'],title:'Science fair',body:'The class can enter a small science fair. Preparation will take energy and focus.',choices:[['Build a project',s=>{s.player.development.grades+=9;s.player.development.curiosity+=5;s.player.needs.energy-=8;}],['Skip it',s=>{s.player.needs.mood+=3;}]]},
  {stages:['child'],title:'Report card day',body:'Your grades are sent home, along with a note about attendance.',choices:[['Face the conversation',s=>{s.player.development.resilience+=3;s.player.development.grades+=2;}],['Hide the card',s=>{s.player.school.incidents+=1;s.player.development.stressExposure+=4;}]]},
  {stages:['teen'],title:'A part-time opening',body:'A local shop is hiring after school. The pay is modest, but it is your first chance to earn.',choices:[['Take the job',s=>{s.household.money+=35;s.player.needs.energy-=12;s.memoryFlags.partTimeJob=true;}],['Focus on school',s=>{s.player.development.grades+=7;}]]},
  {stages:['teen'],title:'Past curfew',body:'Friends invite you to stay out long after curfew.',choices:[['Sneak out',s=>{s.player.development.stressExposure+=4;s.player.development.resilience+=2;s.memoryFlags.rebellion=true;}],['Go home',s=>{s.player.development.resilience+=3;}]]},
  {stages:['teen','adult'],title:'A close connection',body:'Someone you trust admits that the relationship means more to them.',choices:[['Explore the relationship',s=>{s.player.partner ||= {id:`partner-${rng.int(100,999)}`,name:rng.pick(names.first),affection:55};s.player.needs.mood+=12;}],['Remain friends',s=>{s.player.development.resilience+=2;}]]},
  {stages:['adult'],title:'A chance to advance',body:'A difficult assignment could lead to better pay, but it will consume time and energy.',choices:[['Take the challenge',s=>{if(rng.chance(.6)){s.household.money+=120;s.player.development.resilience+=5;}else{s.player.needs.energy-=18;s.player.development.stressExposure+=6;}}],['Protect your time',s=>{s.player.needs.mood+=8;}]]},
  {stages:['adult'],condition:s=>s.player.partner&&!s.player.children.length,title:'Room for one more life',body:'Your household feels stable enough to discuss having a child.',choices:[['Begin a family',s=>createChild('A long conversation became a commitment.')],['Wait',s=>{s.player.needs.mood+=2;}]]},
  {stages:['elder'],title:'A health warning',body:'A sudden spell of weakness forces you to think about the years behind and ahead.',choices:[['Seek treatment',s=>{const c=Math.min(50,s.household.money);s.household.money-=c;s.player.needs.health+=22;}],['Rest at home',s=>{s.player.needs.energy+=20;s.player.needs.health-=5;}]]},
  {stages:['elder'],title:'Stories for the next generation',body:'A younger relative asks what mattered most in your life.',choices:[['Tell the whole story',s=>{s.player.needs.mood+=15;s.player.development.bonding+=8;}]]}
];

function triggerRandomEvent(force=false) {
  if(!state||modalOpen)return;
  const eligible=LIFE_EVENTS.filter(e=>e.stages.includes(state.player.stage)&&(!e.condition||e.condition(state)));
  if(!eligible.length)return;
  if(!force&&state.time.day===state.lastEventDay)return;
  const e=rng.pick(eligible);state.lastEventDay=state.time.day;
  showModal('LIFE EVENT',e.title,e.body,e.choices.map(([label,effect])=>({label,action:()=>{
    effect(state);
    normalizeStateNumbers();
    addLog(`${e.title}: ${label}.`);
  }})));
}

function maybeDailyEvent(){if(rng.chance(.42))triggerRandomEvent();}
function normalizeStateNumbers(){
  Object.keys(state.player.needs).forEach(k=>state.player.needs[k]=clamp(state.player.needs[k]));
  Object.keys(state.player.development).forEach(k=>state.player.development[k]=clamp(state.player.development[k]));
  state.household.money=Math.max(0,state.household.money);state.household.food=Math.max(0,state.household.food);
}

function showModal(eyebrow,title,body,choices) {
  modalOpen=true;
  dom.modalEyebrow.textContent=eyebrow;
  dom.modalTitle.textContent=title;
  dom.modalBody.textContent=body;
  dom.modalChoices.innerHTML='';
  choices.forEach(choice=>{
    const b=document.createElement('button');b.textContent=choice.label;
    b.addEventListener('click',()=>{choice.action?.();dom.modalOverlay.classList.add('hidden');modalOpen=false;updateUI(true);});
    dom.modalChoices.appendChild(b);
  });
  dom.modalOverlay.classList.remove('hidden');
}

function die(cause='old age') {
  if(!state?.player.alive||modalOpen)return;
  state.player.alive=false;state.player.causeOfDeath=cause;
  const node=state.familyTree.find(n=>n.id===state.player.id);if(node){node.alive=false;node.cause=cause;node.age=Math.floor(state.player.age);}
  addLog(`${state.player.name} died at age ${Math.floor(state.player.age)} from ${cause}.`);
  const children=state.player.children.filter(c=>c.alive!==false);
  if(children.length){
    showModal('A LIFE ENDS','Choose the next life',`${state.player.name} died from ${cause}. The story can continue through one of their children.`,children.map(child=>({label:`Continue as ${child.name} · ${formatAge(child.age)}`,action:()=>continueAsChild(child)})));
  } else {
    showModal('LINEAGE ENDED','No child remains',`${state.player.name} died from ${cause}. With no living children, this family line ends here.`,[{label:'Begin a new life',action:()=>openNewGame()}]);
  }
}

function continueAsChild(child) {
  const old=state.player;
  const inheritedNeeds=child.needs || {health:child.health||85,energy:75,satiety:75,hygiene:75,comfort:70,mood:70};
  state.player={
    id:child.id,name:child.name,age:child.age,stage:stageForAge(child.age),generation:old.generation+1,
    location:'home',x:11*TILE+16,y:13*TILE+16,dir:'down',moving:false,carriedBy:null,
    needs:{...inheritedNeeds},development:{...(child.development||{bonding:50,stimulation:45,stressExposure:15,curiosity:35,resilience:40,grades:50})},
    traits:child.traits||[],hiddenTraits:[],crying:false,cryPower:0,neglectTimer:0,socialStatus:'none',socialTimer:0,
    school:{attendedToday:false,truancy:0,incidents:0},relationships:child.relationships||[],children:child.children||[],partner:null,status:[],alive:true,causeOfDeath:null
  };
  const familyName=child.name.split(' ').slice(-1)[0];
  if(state.player.age<18){
    const caregiver=createParent(0,familyName);caregiver.role='Surviving caregiver';caregiver.traits.responsibility=clamp(caregiver.traits.responsibility+15);state.parents=[caregiver];
  } else state.parents=[];
  state.scene='home';state.household.money=Math.round(state.household.money*.65);state.household.food=Math.max(5,state.household.food);
  addLog(`Control passed to ${child.name}, generation ${state.player.generation}.`);
  toast(`Generation ${state.player.generation} begins.`);
  saveGame(false);
}

function objectiveForStage() {
  const p=state.player;
  if(p.stage==='baby')return p.crying?'You are crying. A caregiver may respond depending on their stress and patience.':'Your needs shape early bonding. Cry when hunger, hygiene, or comfort becomes low.';
  if(p.stage==='toddler')return 'Explore the house, play with objects, and avoid hazards when caregivers are distracted.';
  if(p.stage==='child')return 'Attend school on weekdays, build friendships, and decide how to respond to conflict.';
  if(p.stage==='teen')return 'Balance school, part-time work, relationships, and growing independence.';
  if(p.stage==='adult')return p.children.length?'Build a stable household while raising the next generation.':'Build a career and interact with the family marker at home when you are ready.';
  return p.children.length?'Protect your health and prepare the next generation to continue.':'Your lineage has no heir yet. Health risks increase with age.';
}

function traitLines(traits) {
  return Object.entries(traits || {}).map(([name,value]) => `${titleCase(name)}: ${Math.round(value)}`).join('\n');
}

function showPlayerDetails() {
  if (!state || modalOpen) return;
  const p = state.player;
  const knownTraits = p.traits.length ? p.traits.join(', ') : 'Still emerging';
  const body = [
    `Age: ${formatAge(p.age)}`,
    `Life stage: ${titleCase(p.stage)}`,
    `Generation: ${p.generation}`,
    `Known traits: ${knownTraits}`,
    '',
    'DEVELOPMENT',
    `Bonding: ${Math.round(p.development.bonding)}`,
    `Curiosity: ${Math.round(p.development.curiosity)}`,
    `Resilience: ${Math.round(p.development.resilience)}`,
    `Grades: ${Math.round(p.development.grades)}`,
    `Stress exposure: ${Math.round(p.development.stressExposure)}`
  ].join('\n');
  showModal('YOUR CHARACTER', p.name, body, [{label:'Close',action:()=>{}}]);
}

function showParentDetails(parent) {
  if (!parent || modalOpen) return;
  const relationship = state.parentRelationship
    ? `
HOUSEHOLD RELATIONSHIP
Affection: ${Math.round(state.parentRelationship.affection)}
Trust: ${Math.round(state.parentRelationship.trust)}
Tension: ${Math.round(state.parentRelationship.tension)}`
    : '';
  const body = [
    `Age: ${Math.floor(parent.age)}`,
    `Role: ${parent.role || 'Parent'}`,
    `Job: ${titleCase(parent.job || 'Unemployed')}`,
    `Current location: ${titleCase(parent.location)}`,
    `Current action: ${parent.travelingTo ? `Going to ${titleCase(parent.travelingTo)}` : titleCase(parent.action || 'Idle')}`,
    `Struggle: ${parent.struggle ? titleCase(parent.struggle) : 'None known'}`,
    '',
    'TRAITS',
    traitLines(parent.traits),
    '',
    'NEEDS',
    `Energy: ${Math.round(parent.needs.energy)}`,
    `Hunger: ${Math.round(parent.needs.satiety)}`,
    `Stress: ${Math.round(parent.needs.stress)}`,
    `Mood: ${Math.round(parent.needs.mood)}`,
    relationship
  ].join('\n');
  showModal('PARENT PROFILE', parent.name, body, [{label:'Close',action:()=>{}}]);
}

function showChildDetails(child) {
  if (!child || modalOpen) return;
  const body = [
    `Age: ${formatAge(child.age || 0)}`,
    `Life stage: ${titleCase(child.stage || stageForAge(child.age || 0))}`,
    `Health: ${Math.round(child.needs?.health ?? child.health ?? 85)}`,
    `Traits: ${(child.traits || []).join(', ') || 'Still emerging'}`
  ].join('\n');
  showModal('FAMILY MEMBER', child.name, body, [{label:'Close',action:()=>{}}]);
}

function handleCanvasTap(event) {
  if (!state || modalOpen || !dom.menuOverlay.classList.contains('hidden')) return;
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * canvas.width / rect.width;
  const y = (event.clientY - rect.top) * canvas.height / rect.height;
  const people = [];
  if (!state.player.carriedBy || state.parents.some(parent => parent.id === state.player.carriedBy && parent.location === state.scene)) {
    people.push({kind:'player', entity:state.player, x:state.player.x, y:state.player.y});
  }
  state.parents.forEach(parent => {
    if (parent.location === state.scene && !parent.travelingTo) people.push({kind:'parent', entity:parent, x:parent.x, y:parent.y});
  });
  let nearest = null;
  for (const person of people) {
    const distance = Math.hypot(x-person.x, y-person.y);
    if (distance <= 38 && (!nearest || distance < nearest.distance)) nearest = {...person,distance};
  }
  if (!nearest) return;
  if (nearest.kind === 'player') showPlayerDetails();
  else showParentDetails(nearest.entity);
}

function setMobilePanel(panel) {
  document.querySelectorAll('.mobile-tab').forEach(button => button.classList.toggle('active', button.dataset.mobileTab === panel));
  document.querySelectorAll('[data-panel-section]').forEach(section => section.classList.toggle('mobile-hidden', section.dataset.panelSection !== panel));
  if (dom.sidePanel) dom.sidePanel.scrollTop = 0;
}

function updateUI(force=false) {
  if(!state)return;
  const p=state.player;
  dom.playerName.textContent=p.name;
  dom.ageLabel.textContent=`Age ${formatAge(p.age)} · Gen ${p.generation}`;
  dom.stageBadge.textContent=p.stage;
  dom.dayLabel.textContent=state.time.day;
  dom.timeLabel.textContent=formatTime(state.time.minute);
  dom.placeLabel.textContent=locationLabel(state.scene);
  dom.moneyLabel.textContent=peso(state.household.money);
  dom.cryBtn.disabled=p.stage!=='baby';
  dom.cryBtn.style.display=p.stage==='baby'?'':'none';
  dom.cryBtn.textContent=p.crying?'Crying…':'Cry';
  dom.actionBtn.style.display=p.stage==='baby'?'none':'';
  dom.actionBtn.textContent='Interact';
  dom.objectiveText.textContent=objectiveForStage();
  dom.objectiveTag.textContent=p.socialStatus==='dispatched'?'Urgent':p.stage==='baby'?'Growing':'Living';
  dom.familyMood.textContent=state.parentRelationship?(state.parentRelationship.tension>70?'Tense':state.parentRelationship.affection>65?'Warm':'Unsteady'):(state.household.foster?'Foster care':'Single caregiver');

  const needs=[['Health',p.needs.health],['Energy',p.needs.energy],['Food',p.needs.satiety],['Comfort',p.needs.comfort],['Hygiene',p.needs.hygiene],['Mood',p.needs.mood]];
  dom.needsList.innerHTML=needs.map(([label,value])=>`<div class="bar-row"><span>${label}</span><div class="bar-track"><div class="bar-fill ${value<20?'danger':value<40?'warning':''}" style="width:${clamp(value)}%"></div></div><b>${Math.round(value)}</b></div>`).join('');

  const family=[
    ...state.parents.map(parent=>({name:parent.name,role:parent.role||'Parent',action:parent.travelingTo?`Going to ${titleCase(parent.travelingTo)}`:titleCase(parent.action || 'Idle'),onOpen:()=>showParentDetails(parent)})),
    ...p.children.map(child=>({name:child.name,role:`Child · ${formatAge(child.age)}`,action:titleCase(child.stage),onOpen:()=>showChildDetails(child)}))
  ];
  if(p.partner)family.push({name:p.partner.name,role:'Partner',action:`Affection ${Math.round(p.partner.affection)}`,onOpen:()=>showChildDetails({...p.partner,age:p.age,stage:'adult'})});
  dom.familyList.innerHTML='';
  if(!family.length){dom.familyList.innerHTML='<p class="objective">No household members are present.</p>';}
  else family.forEach(member=>{
    const button=document.createElement('button');button.type='button';button.className='family-member-button';
    button.innerHTML=`<div class="member-icon">${member.name[0]}</div><div class="member-copy"><strong>${member.name}</strong><span>${member.role}</span></div><div class="member-action">${member.action}</div>`;
    button.addEventListener('click',member.onOpen);dom.familyList.appendChild(button);
  });
  const upgrades=state.household.upgrades;
  dom.homeTierLabel.textContent=state.household.label;
  const sleepingPlace=p.stage==='baby'?'Crib':upgrades.childBed?'Child bed':'Temporary sleeping mat';
  const upgradeNames=[sleepingPlace,upgrades.rug?'Rug':null,upgrades.wallPaint?'Painted walls':null,upgrades.sofa?'Sofa':null,upgrades.plant?'House plant':null,upgrades.studyDesk?'Study desk':null].filter(Boolean);
  dom.homeSummary.innerHTML=`<div class="home-row"><span>Condition</span><strong>${Math.round(state.household.condition)} / 100</strong></div><div class="home-row"><span>Cleanliness</span><strong>${Math.round(state.household.cleanliness)} / 100</strong></div><div class="home-row"><span>Food</span><strong>${Math.round(state.household.food)} portions</strong></div><div class="home-upgrades">${upgradeNames.map(name=>`<span class="home-chip">${name}</span>`).join('')}</div>`;
  dom.eventLog.innerHTML=state.log.slice(0,8).map(item=>`<div class="log-item"><b>Day ${item.day}</b> ${item.text}</div>`).join('');
  dom.portrait.innerHTML=`<div style="position:absolute;left:17px;top:11px;width:28px;height:28px;background:#d89e6b;border:3px solid #172033"></div><div style="position:absolute;left:13px;top:8px;width:36px;height:11px;background:${p.generation%2?'#4b342f':'#312e45'}"></div><div style="position:absolute;left:22px;top:24px;width:4px;height:4px;background:#172033;box-shadow:12px 0 #172033"></div><div style="position:absolute;left:21px;bottom:5px;width:22px;height:18px;background:${p.stage==='baby'?'#e8b765':'#668ca2'};border:3px solid #172033"></div>`;
}

function drawTile(x,y,color,alt=null){ctx.fillStyle=(alt&&((x+y)%2))?alt:color;ctx.fillRect(x*TILE,y*TILE,TILE,TILE);}
function drawScene(){
  if(!state)return;
  if(state.scene==='town')drawTown();else if(state.scene==='home')drawHome();else drawInterior(state.scene);
  drawObjects();
  drawCharacters();
  drawSceneLabel();
}

function drawTown(){
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)drawTile(x,y,'#7ea46f','#82aa72');
  ctx.fillStyle='#657579';ctx.fillRect(10*TILE,0,3*TILE,canvas.height);ctx.fillRect(0,8*TILE,canvas.width,3*TILE);
  ctx.fillStyle='#d8c99f';ctx.fillRect(9*TILE,0,TILE,canvas.height);ctx.fillRect(13*TILE,0,TILE,canvas.height);ctx.fillRect(0,7*TILE,canvas.width,TILE);ctx.fillRect(0,11*TILE,canvas.width,TILE);
  ctx.fillStyle='#e9dcad';
  for(let y=1;y<ROWS;y+=2)ctx.fillRect(11*TILE+14,y*TILE,4,16);
  for(let x=0;x<COLS;x+=2)ctx.fillRect(x*TILE,9*TILE+14,16,4);
  for(const loc of state.world.locations){
    if(loc.type==='park'){drawParkLot(loc);continue;}
    ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(loc.x*TILE+6,loc.y*TILE+8,loc.w*TILE,loc.h*TILE);
    ctx.fillStyle=loc.color;ctx.fillRect(loc.x*TILE,loc.y*TILE,loc.w*TILE,loc.h*TILE);
    ctx.fillStyle='#5b3f3e';ctx.fillRect(loc.x*TILE-5,loc.y*TILE,loc.w*TILE+10,12);
    ctx.fillStyle='#b9d8d5';
    ctx.fillRect((loc.x+1)*TILE, (loc.y+1)*TILE, TILE, TILE);
    ctx.fillRect((loc.x+loc.w-2)*TILE, (loc.y+1)*TILE, TILE, TILE);
    ctx.fillStyle='#4c3c38';ctx.fillRect(loc.doorX*TILE, (loc.doorY-1)*TILE, TILE, TILE);
    ctx.fillStyle='#fff4d6';ctx.font='bold 9px monospace';ctx.textAlign='center';ctx.fillText(loc.name.toUpperCase(),(loc.x+loc.w/2)*TILE,(loc.y+.7)*TILE);
  }
}

function drawParkLot(loc){
  ctx.fillStyle='#6e9b62';ctx.fillRect(loc.x*TILE,loc.y*TILE,loc.w*TILE,loc.h*TILE);
  ctx.fillStyle='#cdbb8f';ctx.fillRect((loc.x+.5)*TILE,(loc.y+1.8)*TILE,(loc.w-1)*TILE,12);
  [[loc.x+1,loc.y+1],[loc.x+loc.w-2,loc.y+1],[loc.x+1,loc.y+loc.h-1]].forEach(([x,y])=>drawTree(x*TILE+16,y*TILE+16));
  ctx.fillStyle='#fff4d6';ctx.font='bold 9px monospace';ctx.textAlign='center';ctx.fillText(loc.name.toUpperCase(),(loc.x+loc.w/2)*TILE,(loc.y+.7)*TILE);
}

function drawHome(){
  const tier=state.household.tier;
  const upgrades=state.household.upgrades || {};
  const painted=upgrades.wallPaint;
  const floorA=painted?'#d8c9a6':tier>=4?'#d7c79f':'#cbb990';
  const floorB=painted?'#e2d4b3':tier>=4?'#ddcea8':'#d1c09a';
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)drawTile(x,y,floorA,floorB);
  ctx.fillStyle=painted?'#5d6f7b':'#6e544b';ctx.fillRect(0,0,canvas.width,TILE);ctx.fillRect(0,0,TILE,canvas.height);ctx.fillRect(canvas.width-TILE,0,TILE,canvas.height);ctx.fillRect(0,canvas.height-TILE,10*TILE,TILE);ctx.fillRect(12*TILE,canvas.height-TILE,10*TILE,TILE);
  ctx.fillStyle=painted?'#74858c':'#8b6a59';ctx.fillRect(12*TILE,TILE,8,8*TILE);ctx.fillRect(TILE,8*TILE,11*TILE,8);
  ctx.fillStyle='#a8c8c6';ctx.fillRect(7*TILE,0,3*TILE,TILE-8);ctx.fillRect(15*TILE,0,3*TILE,TILE-8);
  ctx.fillStyle='#84705e';ctx.font='10px monospace';ctx.textAlign='left';ctx.fillText(`${state.household.label} home · decor ${upgrades.decorLevel||0}`,42,55);
}

function drawInterior(type){
  const palette={school:['#d8c899','#e0d3ad'],park:['#77a86c','#7dac70'],grocery:['#d9d0b4','#e0d8c0'],workplace:['#b7c2c4','#c2ccce'],hospital:['#d9ece5','#e4f2ed'],social:['#d6c5ae','#dfceb8']}[type]||['#cfc2a3','#d7caad'];
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)drawTile(x,y,palette[0],palette[1]);
  if(type!=='park'){ctx.fillStyle='#58616b';ctx.fillRect(0,0,canvas.width,TILE);ctx.fillRect(0,0,TILE,canvas.height);ctx.fillRect(canvas.width-TILE,0,TILE,canvas.height);ctx.fillRect(0,canvas.height-TILE,10*TILE,TILE);ctx.fillRect(12*TILE,canvas.height-TILE,10*TILE,TILE);}
  else {for(let i=0;i<8;i++)drawTree((2+(i*5)%20)*TILE+16,(2+(i*3)%13)*TILE+16);ctx.fillStyle='#d5c291';ctx.fillRect(10*TILE,0,2*TILE,canvas.height);}
  if(type==='school'){ctx.fillStyle='#586b58';ctx.fillRect(7*TILE,2*TILE,8*TILE,2*TILE);ctx.fillStyle='#f4f0d9';ctx.font='16px monospace';ctx.fillText('TODAY: KEEP ASKING WHY',7.4*TILE,3*TILE);}
}

function drawObjects(){
  for(const o of sceneObjects()){
    const x=o.x,y=o.y;
    if(['exit','exitTown','enter','friend','teacher','doctor','caseworker','family'].includes(o.type))continue;
    ctx.save();ctx.translate(x,y);
    if(o.type==='bed'){ctx.fillStyle='#76554d';ctx.fillRect(-o.w/2,-o.h/2,o.w,o.h);ctx.fillStyle='#d9d0bc';ctx.fillRect(-o.w/2+5,-o.h/2+5,o.w-10,o.h-10);ctx.fillStyle='#b6cbd0';ctx.fillRect(-o.w/2+5,-o.h/2+5,22,o.h-10);}
    if(o.type==='crib'){ctx.fillStyle='#815e4d';ctx.fillRect(-16,-16,32,32);ctx.fillStyle='#e7dbc0';ctx.fillRect(-10,-10,20,20);}
    if(o.type==='childbed'){ctx.fillStyle='#6e5048';ctx.fillRect(-o.w/2,-o.h/2,o.w,o.h);ctx.fillStyle='#f1dfbd';ctx.fillRect(-o.w/2+5,-o.h/2+5,o.w-10,o.h-10);ctx.fillStyle='#6c95ae';ctx.fillRect(-o.w/2+5,-o.h/2+5,24,o.h-10);}
    if(o.type==='floorbed'){ctx.fillStyle='#bda87d';ctx.fillRect(-o.w/2,-o.h/2,o.w,o.h);ctx.fillStyle='#d6c69e';ctx.fillRect(-o.w/2+4,-o.h/2+4,o.w-8,o.h-8);}
    if(o.type==='rug'){ctx.fillStyle='#a95f56';ctx.fillRect(-o.w/2,-o.h/2,o.w,o.h);ctx.fillStyle='#d49a69';ctx.fillRect(-o.w/2+8,-o.h/2+8,o.w-16,o.h-16);}
    if(o.type==='sofa'){ctx.fillStyle='#587f88';ctx.fillRect(-o.w/2,-o.h/2,o.w,o.h);ctx.fillStyle='#47666d';ctx.fillRect(-o.w/2,-o.h/2-8,o.w,10);ctx.fillRect(-o.w/2+5,o.h/2-2,6,10);ctx.fillRect(o.w/2-11,o.h/2-2,6,10);}
    if(o.type==='plant'){ctx.fillStyle='#8b5e45';ctx.fillRect(-10,3,20,16);ctx.fillStyle='#5b8a54';ctx.fillRect(-4,-20,8,24);ctx.fillRect(-14,-12,12,8);ctx.fillRect(2,-16,14,8);}
    if(o.type==='fridge'){ctx.fillStyle='#d8e0dc';ctx.fillRect(-16,-16,32,32);ctx.fillStyle='#86918f';ctx.fillRect(6,-6,3,9);ctx.fillRect(-16,0,32,3);}
    if(o.type==='stove'){ctx.fillStyle='#59616a';ctx.fillRect(-16,-16,32,32);ctx.fillStyle='#272d33';for(const [a,b]of[[-8,-8],[8,-8],[-8,8],[8,8]]){ctx.beginPath();ctx.arc(a,b,5,0,7);ctx.fill();}}
    if(o.type==='table'||o.type==='study'||o.type==='work'){ctx.fillStyle='#7c5d47';ctx.fillRect(-o.w/2,-o.h/2,o.w,o.h);ctx.fillStyle='#49372e';ctx.fillRect(-o.w/2+5,o.h/2-4,5,12);ctx.fillRect(o.w/2-10,o.h/2-4,5,12);}
    if(o.type==='toy'){ctx.fillStyle='#e0a34f';ctx.fillRect(-10,-8,20,16);ctx.fillStyle='#547f9a';ctx.fillRect(-5,-14,10,6);}
    if(o.type==='book'){if(state.scene==='home'&&state.household.upgrades?.studyDesk){ctx.fillStyle='#7c5d47';ctx.fillRect(-26,-18,52,34);ctx.fillStyle='#49372e';ctx.fillRect(-22,16,5,18);ctx.fillRect(17,16,5,18);ctx.fillStyle='#865a5e';ctx.fillRect(-8,-24,16,12);}else{ctx.fillStyle='#865a5e';ctx.fillRect(-16,-32,32,64);ctx.fillStyle='#d2b56c';for(let yy=-25;yy<25;yy+=10)ctx.fillRect(-11,yy,22,4);}}
    if(o.type==='play'){ctx.fillStyle='#6f594a';ctx.fillRect(-30,-5,60,8);ctx.fillRect(-24,-30,5,60);ctx.fillRect(20,-30,5,60);ctx.strokeStyle='#4c4c4c';ctx.beginPath();ctx.moveTo(-12,-25);ctx.lineTo(-12,12);ctx.moveTo(12,-25);ctx.lineTo(12,12);ctx.stroke();}
    if(o.type==='checkout'){ctx.fillStyle='#6d5747';ctx.fillRect(-o.w/2,-o.h/2,o.w,o.h);ctx.fillStyle='#cc6f57';ctx.fillRect(-10,-28,20,16);}
    if(o.type==='shelf'){ctx.fillStyle='#746858';ctx.fillRect(-o.w/2,-o.h/2,o.w,o.h);for(let xx=-o.w/2+5;xx<o.w/2-5;xx+=12){ctx.fillStyle=['#d46f58','#6f9b70','#d6ab57'][Math.abs(xx)%3];ctx.fillRect(xx,-9,8,18);}}
    ctx.restore();
  }
  if(state.scene==='home'&&state.player.stage==='adult'){
    ctx.fillStyle='#edc16d';ctx.fillRect(7*TILE-8,3*TILE-8,16,16);ctx.fillStyle='#7d4f45';ctx.fillRect(7*TILE-2,3*TILE-12,4,24);ctx.fillRect(7*TILE-12,3*TILE-2,24,4);
  }
}

function drawCharacters(){
  for(const parent of state.parents){if(parent.location===state.scene&&!parent.travelingTo)drawPerson(parent.x,parent.y,'adult',parent.id===state.player.carriedBy?'#9c6b78':'#557d8e',false,parent.action);}
  if(state.scene==='park')drawPerson(7*TILE,8*TILE,'child','#b26d69',false,'friend');
  if(state.scene==='school')drawPerson(11*TILE,3*TILE,'adult','#6d759b',false,'teacher');
  if(state.scene==='hospital')drawPerson(11*TILE,6*TILE,'adult','#d7e7df',false,'doctor');
  if(state.scene==='social')drawPerson(11*TILE,6*TILE,'adult','#806f91',false,'case worker');
  if(!state.player.carriedBy||!state.parents.some(p=>p.id===state.player.carriedBy&&p.location===state.scene))drawPerson(state.player.x,state.player.y,state.player.stage,'#d89a58',true,state.player.name);
}

function drawPerson(x,y,stage,shirt,isPlayer,label=''){
  const bob=Math.sin(animationClock*8+(x+y))*(isPlayer&&state.player.moving?2:.6);
  ctx.save();ctx.translate(Math.round(x),Math.round(y+bob));
  if(isPlayer){ctx.fillStyle='rgba(255,242,175,.28)';ctx.beginPath();ctx.ellipse(0,12,16,7,0,0,7);ctx.fill();}
  ctx.fillStyle='rgba(20,25,35,.24)';ctx.beginPath();ctx.ellipse(0,13,10,4,0,0,7);ctx.fill();
  if(stage==='baby'){
    ctx.fillStyle='#e8bd76';ctx.fillRect(-9,-8,18,22);ctx.fillStyle='#d7a06d';ctx.fillRect(-6,-14,12,10);ctx.fillStyle='#3c2d2c';ctx.fillRect(-6,-15,12,4);ctx.fillStyle='#18202e';ctx.fillRect(-3,-10,2,2);ctx.fillRect(3,-10,2,2);
  } else {
    const scale=stage==='toddler'?.75:stage==='child'?.88:stage==='teen'?1:stage==='elder'?1.03:1.06;
    ctx.scale(scale,scale);
    ctx.fillStyle='#3e3030';ctx.fillRect(-7,-19,14,6);
    ctx.fillStyle='#d6a06f';ctx.fillRect(-7,-16,14,13);
    ctx.fillStyle='#18202e';ctx.fillRect(-4,-11,2,2);ctx.fillRect(3,-11,2,2);
    ctx.fillStyle=shirt;ctx.fillRect(-9,-3,18,15);
    ctx.fillStyle='#26364a';ctx.fillRect(-8,12,6,9);ctx.fillRect(2,12,6,9);
    if(stage==='elder'){ctx.fillStyle='#d8d8d0';ctx.fillRect(-7,-20,14,5);}
  }
  ctx.restore();
  if(label&&state.scene!=='town'){
    ctx.font='9px monospace';ctx.textAlign='center';ctx.fillStyle='rgba(18,25,37,.82)';const w=Math.min(120,ctx.measureText(label).width+10);ctx.fillRect(x-w/2,y-39,w,14);ctx.fillStyle='#fff4dc';ctx.fillText(label,x,y-29);
  }
}

function drawTree(x,y){ctx.fillStyle='#6d4d3b';ctx.fillRect(x-5,y,10,18);ctx.fillStyle='#477348';ctx.fillRect(x-18,y-22,36,28);ctx.fillStyle='#5b8a54';ctx.fillRect(x-12,y-30,24,20);}
function drawSceneLabel(){ctx.fillStyle='rgba(15,22,33,.82)';ctx.fillRect(12,canvas.height-38,220,26);ctx.fillStyle='#fff3d6';ctx.font='bold 11px monospace';ctx.textAlign='left';ctx.fillText(locationLabel(state.scene).toUpperCase(),24,canvas.height-21);}

function update(dt){
  if(!state||paused||modalOpen)return;
  animationClock+=dt;
  updateTime(dt);updatePlayerNeeds(dt);updateParents(dt);updateMovement(dt);updateNearby();
  eventTimer+=dt*SPEEDS[speedIndex];
  if(eventTimer>36){eventTimer=0;if(rng.chance(.32))triggerRandomEvent();}
  autoSaveTimer+=dt;if(autoSaveTimer>20){autoSaveTimer=0;saveGame(false);}
  if(state.player.age>=72&&state.player.alive){const risk=Math.max(0,(state.player.age-72)/80)+Math.max(0,(45-state.player.needs.health)/180);if(rng.chance(dt*SPEEDS[speedIndex]*risk*.018))die('old age');}
}

function loop(now){
  const dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;
  update(dt);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(state)drawScene();else drawSplash();
  uiTimer+=dt;if(uiTimer>.18){uiTimer=0;updateUI();}
  requestAnimationFrame(loop);
}

function drawSplash(){
  ctx.fillStyle='#26384a';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#3d5264';for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)if((x+y)%2===0)ctx.fillRect(x*TILE,y*TILE,TILE,TILE);
  ctx.fillStyle='#f3d18b';ctx.font='bold 54px system-ui';ctx.textAlign='center';ctx.fillText('BORN INTO',canvas.width/2,canvas.height/2-12);
  ctx.fillStyle='#fff4da';ctx.font='14px monospace';ctx.fillText('Every life begins somewhere.',canvas.width/2,canvas.height/2+28);
}

function openNewGame(){
  dom.mainMenuButtons.classList.add('hidden');dom.howPanel.classList.add('hidden');dom.newGameForm.classList.remove('hidden');dom.menuOverlay.classList.remove('hidden');dom.menuOverlay.classList.add('visible');
}
function openMainMenu(){
  dom.newGameForm.classList.add('hidden');dom.howPanel.classList.add('hidden');dom.mainMenuButtons.classList.remove('hidden');dom.menuOverlay.classList.remove('hidden');dom.menuOverlay.classList.add('visible');dom.continueBtn.disabled=!storageGet(SAVE_KEY);
}
function closeMenu(){dom.menuOverlay.classList.add('hidden');dom.menuOverlay.classList.remove('visible');lastTime=performance.now();}

function bindPress(element, handler) {
  if (!element) return;
  let lastTouch = 0;
  element.addEventListener('touchend', event => {
    event.preventDefault();
    lastTouch = Date.now();
    handler(event);
  }, { passive: false });
  element.addEventListener('click', event => {
    if (Date.now() - lastTouch < 600) return;
    handler(event);
  });
}

function bindEvents(){
  canvas.addEventListener('pointerup', handleCanvasTap);
  bindPress(dom.playerCardBtn, showPlayerDetails);
  dom.playerCardBtn?.addEventListener('keydown', event => { if(event.key==='Enter'||event.key===' '){event.preventDefault();showPlayerDetails();} });
  document.querySelectorAll('.mobile-tab').forEach(button => bindPress(button, ()=>setMobilePanel(button.dataset.mobileTab)));
  window.addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();
    if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();
    keys.add(k);
    if(k==='e')interact();if(k==='c')cry();if(k===' ')togglePause();
  });
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  document.querySelectorAll('.dpad button').forEach(btn=>{
    const dir=btn.dataset.dir;
    for(const ev of ['pointerdown','touchstart'])btn.addEventListener(ev,e=>{e.preventDefault();touchDirs.add(dir);});
    for(const ev of ['pointerup','pointercancel','pointerleave','touchend'])btn.addEventListener(ev,e=>{e.preventDefault();touchDirs.delete(dir);});
  });
  bindPress(dom.actionBtn, interact); bindPress(dom.cryBtn, cry);
  bindPress(dom.pauseBtn, togglePause);
  bindPress(dom.speedBtn, ()=>{speedIndex=(speedIndex+1)%SPEEDS.length;dom.speedBtn.textContent=`${SPEEDS[speedIndex]}×`;toast(`Simulation speed ${SPEEDS[speedIndex]}×`);});
  bindPress(dom.saveBtn, ()=>saveGame());
  bindPress(dom.menuBtn, ()=>{saveGame(false);openMainMenu();});
  bindPress(dom.continueBtn, ()=>{if(!loadGame())openNewGame();});
  bindPress(dom.newGameBtn, openNewGame);
  bindPress(dom.backBtn, openMainMenu);
  bindPress(dom.howBtn, ()=>{dom.mainMenuButtons.classList.add('hidden');dom.howPanel.classList.remove('hidden');});
  bindPress(dom.howBackBtn, openMainMenu);
  bindPress(dom.randomSeedBtn, ()=>dom.seedInput.value=Math.random().toString(36).slice(2,10).toUpperCase());
  dom.newGameForm.addEventListener('submit',e=>{
    e.preventDefault();
    const seed=dom.seedInput.value.trim()||Math.random().toString(36).slice(2,11);
    state=createNewState(dom.nameInput.value,seed);paused=false;speedIndex=0;dom.speedBtn.textContent='1×';closeMenu();saveGame(false);updateUI(true);showModal('A NEW LIFE','You were born here',`${state.player.name} begins life in ${state.world.name}. Your household is ${state.household.label.toLowerCase()}, and your caregivers will make choices of their own.`,[{label:'Open your eyes',action:()=>{}}]);
  });
  bindPress(dom.clearLogBtn, ()=>{if(state)state.log=[];updateUI(true);});
  bindPress(dom.ageBtn, ()=>{if(!state)return;const old=state.player.stage;state.player.age+=1;const next=stageForAge(state.player.age);if(next!==old)changeStage(next,old);updateUI(true);});
  bindPress(dom.eventBtn, ()=>triggerRandomEvent(true));
  bindPress(dom.childBtn, ()=>createChild('Added through test controls.'));
  bindPress(dom.deathBtn, ()=>die('a test of the generational system'));
}
function togglePause(){if(!state)return;paused=!paused;dom.pauseBtn.textContent=paused?'▶':'Ⅱ';toast(paused?'Paused':'Life continues');}

bindEvents();
setMobilePanel('me');
openMainMenu();
window.__BORN_INTO_READY__ = true;
const startupError = document.querySelector('#startupError');
if (startupError) startupError.hidden = true;
requestAnimationFrame(loop);
