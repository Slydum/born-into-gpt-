import { TILE, JOBS, HOUSE_PURCHASES } from './config.js';
import { clamp, stageForAge, titleCase } from './utils.js';
import { createAppearance } from './art.js';

const MOODS = ['Content','Happy','Hopeful','Excited','Bored','Lonely','Stressed','Anxious','Sad','Angry','Grieving','Exhausted'];
const QUICK_MESSAGES = {
  hello: ['Hi! How are you?', 'Hey, what are you doing today?', 'Just checking in.'],
  hobby: ['Want to practice our hobby together?', 'I made some progress today!', 'What have you been working on lately?'],
  support: ['I am here if you need to talk.', 'You can tell me what happened.', 'I hope today gets easier.'],
  invite: ['Want to meet at the park later?', 'Would you like to come over?', 'Can we hang out after school?'],
  family: ['Are you coming home this weekend?', 'Everyone misses you.', 'How is life away from home?']
};

export function v7PersonList(state, includeAway = true) {
  const current = [state.player, ...state.parents, ...(state.siblings || []), state.nanny].filter(Boolean);
  return includeAway ? [...current, ...(state.extendedFamily || [])] : current;
}

export function v7PersonById(state, id) {
  return v7PersonList(state, true).find(person => person.id === id)
    || state.town?.residents?.find(person => person.id === id)
    || null;
}

function ensurePerson(person) {
  if (!person) return;
  person.memories ||= [];
  person.health ||= { conditions: [], disability: null, appointments: [], status: 'Well' };
  person.moodState ||= { label: 'Content', reasons: [], sinceDay: 0 };
  person.romance ||= { crushId: null, partnerId: null, status: 'single', exclusive: false, milestones: [], loyalty: 70 };
  person.phone ||= { hasPhone: person.stage === 'adult' || person.stage === 'elder', contacts: [], unread: 0 };
  person.hobbyPractice ||= {};
  person.residence ||= person.movedOut ? 'Away from family home' : 'Family home';
  person.assignedRoomId ||= null;
  person.assignedBedId ||= null;
  person.assignedSeat ||= null;
  person.socialNeed ??= 55;
  person.currentGoal ||= null;
}

function roomById(home, id) {
  return home.rooms.find(room => room.id === id) || null;
}

function makeUpperRooms() {
  return [
    { id:'upperLanding', label:'Upstairs landing', x:8, y:7, w:6, h:4, active:false, floor:1, door:{x:11,y:10.95,edge:'bottom'} },
    { id:'upperBedroomA', label:'Upstairs bedroom A', x:1, y:1, w:8, h:6, active:false, floor:1, door:{x:8.95,y:4,edge:'right'} },
    { id:'upperBedroomB', label:'Upstairs bedroom B', x:14, y:1, w:7, h:6, active:false, floor:1, door:{x:14.05,y:4,edge:'left'} },
    { id:'upperHobbyRoom', label:'Hobby room', x:1, y:9, w:8, h:8, active:false, floor:1, door:{x:8.95,y:13,edge:'right'} },
    { id:'upperBathroom', label:'Upstairs bathroom', x:14, y:9, w:7, h:8, active:false, floor:1, door:{x:14.05,y:13,edge:'left'} }
  ];
}

function addFurnitureInstance(home, id, room, options = {}) {
  const exists = home.furniture.find(item => item.id === id && item.room === room && (options.ownerId ? item.ownerId === options.ownerId : true));
  if (exists) return exists;
  const item = {
    id,
    instanceId: `${id}-${room}-${options.ownerId || 'shared'}-${home.furniture.length + 1}`,
    room,
    floor: options.floor ?? roomById(home, room)?.floor ?? 0,
    ownerId: options.ownerId || null,
    essential: Boolean(options.essential),
    condition: 100,
    delivered: true
  };
  home.furniture.push(item);
  return item;
}

function suitableBedroom(home, person, occupied = new Set()) {
  const all = home.rooms.filter(room => room.active && ['parentBedroom','childBedroom','teenBedroom','upperBedroomA','upperBedroomB'].includes(room.id));
  if (person.role === 'Parent') return roomById(home, 'parentBedroom') || all[0];
  if (person.role === 'Nanny') {
    return all.find(room => room.id === 'upperBedroomB' && !occupied.has(room.id))
      || all.find(room => room.id === 'teenBedroom' && !occupied.has(room.id))
      || roomById(home, 'childBedroom')
      || roomById(home, 'livingRoom');
  }
  if (person.stage === 'teen' || person.stage === 'adult') {
    return all.find(room => ['teenBedroom','upperBedroomA','upperBedroomB'].includes(room.id) && !occupied.has(room.id))
      || roomById(home, 'childBedroom')
      || roomById(home, 'parentBedroom');
  }
  return roomById(home, 'childBedroom') || roomById(home, 'parentBedroom') || all[0];
}

export function assignHomeSpaces(state) {
  const home = state.household.home;
  home.roomAssignments ||= {};
  home.bedAssignments ||= {};
  home.seatAssignments ||= {};
  const occupiedPrivateRooms = new Set();
  const household = [state.player, ...state.parents, ...(state.siblings || []), state.nanny]
    .filter(person => person && person.alive !== false && !person.movedOut);

  for (const person of household) ensurePerson(person);
  state.parents.forEach((parent, index) => {
    const sleepingApart = Boolean(parent.romance?.sleepingApart);
    parent.assignedRoomId = sleepingApart ? 'livingRoom' : 'parentBedroom';
    parent.assignedBedId = sleepingApart ? 'sofa' : 'parentBed';
    parent.bedSlot = sleepingApart ? 'center' : (index === 0 ? 'left' : 'right');
    if (sleepingApart) addFurnitureInstance(home, 'sofa', 'livingRoom', { ownerId:parent.id, essential:true, floor:0 });
    home.roomAssignments[parent.id] = parent.assignedRoomId;
    home.bedAssignments[parent.id] = { furnitureId:parent.assignedBedId, roomId:parent.assignedRoomId, slot:parent.bedSlot, floor:0 };
  });

  const young = [state.player, ...(state.siblings || [])].filter(person => person && !person.movedOut);
  young.sort((a,b) => b.age - a.age);
  let childBedIndex = 0;
  for (const person of young) {
    let room = suitableBedroom(home, person, occupiedPrivateRooms);
    if (person.stage === 'baby') room = roomById(home, 'parentBedroom') || room;
    if ((person.stage === 'teen' || person.stage === 'adult') && ['teenBedroom','upperBedroomA','upperBedroomB'].includes(room?.id)) occupiedPrivateRooms.add(room.id);
    person.assignedRoomId = room?.id || 'childBedroom';
    let bedId;
    let slot = 'center';
    if (person.stage === 'baby') bedId = 'crib';
    else if (person.stage === 'toddler' && home.furniture.some(item => item.id === 'toddlerBed')) bedId = 'toddlerBed';
    else if (person.assignedRoomId === 'teenBedroom' || person.assignedRoomId.startsWith('upperBedroom')) {
      bedId = person.assignedRoomId === 'teenBedroom' ? 'teenBed' : `upperBed${person.assignedRoomId.endsWith('A') ? 'A' : 'B'}`;
      addFurnitureInstance(home, bedId, person.assignedRoomId, { ownerId:person.id, essential:true, floor:room?.floor || 0 });
    } else {
      bedId = childBedIndex++ % 2 === 0 ? 'childBed' : 'siblingBed';
      addFurnitureInstance(home, bedId, person.assignedRoomId, { ownerId:person.id, essential:true, floor:room?.floor || 0 });
    }
    person.assignedBedId = bedId;
    home.roomAssignments[person.id] = person.assignedRoomId;
    home.bedAssignments[person.id] = { furnitureId:bedId, roomId:person.assignedRoomId, slot, floor:room?.floor || 0 };
  }

  if (state.nanny && state.nanny.liveIn) {
    const room = suitableBedroom(home, state.nanny, occupiedPrivateRooms);
    state.nanny.assignedRoomId = room?.id || 'livingRoom';
    state.nanny.assignedBedId = room?.id === 'livingRoom' ? 'sofa' : 'nannyBed';
    if (state.nanny.assignedBedId === 'nannyBed') addFurnitureInstance(home,'nannyBed',state.nanny.assignedRoomId,{ownerId:state.nanny.id,essential:true,floor:room?.floor || 0});
    home.roomAssignments[state.nanny.id] = state.nanny.assignedRoomId;
    home.bedAssignments[state.nanny.id] = { furnitureId:state.nanny.assignedBedId, roomId:state.nanny.assignedRoomId, slot:'center', floor:room?.floor || 0 };
  }

  const seats = ['leftTop','rightTop','leftBottom','rightBottom','top','bottom'];
  household.filter(person => person.stage !== 'baby').forEach((person,index) => {
    person.assignedSeat = seats[index % seats.length];
    home.seatAssignments[person.id] = person.assignedSeat;
  });
}

function ensureHomeV7(state) {
  const home = state.household.home;
  home.currentFloor ??= 0;
  home.floors ||= [
    { id:0, label:'Ground Floor', active:true },
    { id:1, label:'Second Floor', active:false }
  ];
  for (const room of home.rooms) room.floor ??= 0;
  if (!home.rooms.some(room => room.floor === 1)) home.rooms.push(...makeUpperRooms());
  for (const item of home.furniture) {
    item.floor ??= roomById(home,item.room)?.floor ?? 0;
    item.instanceId ||= `${item.id}-${item.room}-${home.furniture.indexOf(item)}`;
    item.ownerId ??= null;
  }
  home.constructionHistory ||= [];
  home.pendingRequests ||= [];
  home.hobbyOwnership ||= {};
  home.meal.servedUntilStamp ??= -1;
  home.meal.clearedStamp ??= -1;
  home.kitchen.leftovers ??= 0;
  home.kitchen.leftoverMeals ||= [];
  home.chores.laundryStage ||= 'dirty';
  home.chores.foldedLoads ??= 0;
  home.stairs ||= { ground:{x:10.7,y:8.5}, upper:{x:10.7,y:8.5}, active:false };
}

function ensureSocial(state, rng) {
  state.social ||= {};
  state.social.acquaintances ||= {};
  state.social.speech ||= [];
  state.social.classRoster ||= [];
  state.social.contacts ||= [];
  state.social.threads ||= {};
  state.social.invitations ||= [];
  state.social.clubs ||= [];
  state.social.schoolOpportunities ||= {};
  state.social.lastFriendCheckDay ??= -1;
  state.phone ||= { unlocked:false, selectedContactId:null };
  const player = state.player;
  if (player.stage === 'child' || player.stage === 'teen' || player.stage === 'adult') state.phone.unlocked = true;
  if (state.social.classRoster.length === 0) {
    const stage = player.stage === 'teen' ? 'teen' : 'child';
    const targetAge = player.stage === 'baby' || player.stage === 'toddler' ? 8 : player.age;
    let candidates = state.town.residents.filter(person => ['child','teen'].includes(person.stage) && Math.abs(person.age-targetAge) <= 4);
    if (candidates.length < 8) candidates = state.town.residents.filter(person => ['child','teen'].includes(person.stage));
    state.social.classRoster = rng.shuffle(candidates).slice(0,8).map(person => person.id);
  }
  for (const person of [...(state.extendedFamily || []), ...state.parents, ...(state.siblings || [])]) {
    if (!person) continue;
    if (!state.social.contacts.includes(person.id)) state.social.contacts.push(person.id);
  }
}

function ensureLifeEvents(state) {
  state.settings ||= {
    lifeDifficulty:'realistic', seriousIllness:'rare', unexpectedDeath:'rare', teenPregnancy:'rare',
    cheating:'rare', substanceEvents:'mild', adultIntimacy:'fade', teenRomance:'age-appropriate'
  };
  state.events ||= { lastEventDay:-3, cooldowns:{} };
  state.events.active ||= [];
  state.events.history ||= [];
  state.events.lastMajorDay ??= -10;
  state.adulthood ||= { transitions:{}, playerChoice:null };
}

export function initializeV7State(state, rng) {
  state.extendedFamily ||= [];
  ensureHomeV7(state);
  ensureLifeEvents(state);
  for (const person of v7PersonList(state,true)) ensurePerson(person);
  if (state.parents?.length === 2) {
    const [first, second] = state.parents;
    if (!first.romance.partnerId && !first.romance.formerPartnerId) {
      first.romance.partnerId = second.id;
      first.romance.status = 'married';
      first.romance.exclusive = true;
    }
    if (!second.romance.partnerId && !second.romance.formerPartnerId) {
      second.romance.partnerId = first.id;
      second.romance.status = 'married';
      second.romance.exclusive = true;
    }
  }
  ensureSocial(state,rng);
  assignHomeSpaces(state);
  return state;
}

function getFurnitureRectLike(state, furnitureId, roomId = null) {
  const home = state.household.home;
  const room = roomById(home, roomId || home.furniture.find(item => item.id === furnitureId)?.room);
  if (!room) return null;
  const specs = {
    parentBed:{rx:.08,ry:.16,rw:.48,rh:.22}, crib:{rx:.68,ry:.16,rw:.20,rh:.22}, toddlerBed:{rx:.56,ry:.60,rw:.34,rh:.18},
    childBed:{rx:.08,ry:.16,rw:.42,rh:.18}, siblingBed:{rx:.08,ry:.58,rw:.42,rh:.18}, teenBed:{rx:.08,ry:.16,rw:.46,rh:.20},
    upperBedA:{rx:.08,ry:.16,rw:.46,rh:.20}, upperBedB:{rx:.08,ry:.16,rw:.46,rh:.20}, nannyBed:{rx:.08,ry:.16,rw:.46,rh:.20},
    sofa:{rx:.08,ry:.64,rw:.46,rh:.18}, basicTable:{rx:.23,ry:.28,rw:.55,rh:.30}, diningSet:{rx:.18,ry:.24,rw:.64,rh:.34}
  };
  const spec = specs[furnitureId] || {rx:.35,ry:.35,rw:.25,rh:.20};
  return {
    x:(room.x + .18 + spec.rx*Math.max(1,room.w-.36))*TILE,
    y:(room.y + .18 + spec.ry*Math.max(1,room.h-.36))*TILE,
    w:Math.max(.55,spec.rw*room.w)*TILE,
    h:Math.max(.45,spec.rh*room.h)*TILE
  };
}

export function assignedSleepPosition(state, person) {
  const assignment = state.household.home.bedAssignments?.[person.id];
  if (!assignment) return null;
  const rect = getFurnitureRectLike(state,assignment.furnitureId,assignment.roomId);
  if (!rect) return null;
  let x = rect.x + rect.w/2;
  let y = rect.y + rect.h/2;
  if (assignment.slot === 'left') x = rect.x + rect.w*.34;
  if (assignment.slot === 'right') x = rect.x + rect.w*.66;
  return { x, y, floor:assignment.floor ?? roomById(state.household.home,assignment.roomId)?.floor ?? 0, roomId:assignment.roomId };
}

export function assignedSeatPosition(state, person) {
  const home = state.household.home;
  const table = home.furniture.find(item => ['diningSet','basicTable'].includes(item.id));
  if (!table) return null;
  const rect = getFurnitureRectLike(state,table.id,table.room);
  if (!rect) return null;
  const slot = home.seatAssignments?.[person.id] || 'leftTop';
  const map = {
    leftTop:{x:rect.x-12,y:rect.y+rect.h*.3}, leftBottom:{x:rect.x-12,y:rect.y+rect.h*.72},
    rightTop:{x:rect.x+rect.w+12,y:rect.y+rect.h*.3}, rightBottom:{x:rect.x+rect.w+12,y:rect.y+rect.h*.72},
    top:{x:rect.x+rect.w*.5,y:rect.y-14}, bottom:{x:rect.x+rect.w*.5,y:rect.y+rect.h+14}
  };
  return { ...(map[slot] || map.leftTop), floor:table.floor || 0, roomId:table.room };
}

export function preferredHobbyRoom(state, person, hobbyId) {
  const home = state.household.home;
  const assigned = home.roomAssignments?.[person.id];
  if (hobbyId === 'exercise') {
    const hobbyRoom = roomById(home,'upperHobbyRoom');
    if (hobbyRoom?.active) return hobbyRoom.id;
  }
  return assigned || 'livingRoom';
}

function relationRecord(owner, target) {
  owner.relationships ||= [];
  let rel = owner.relationships.find(item => item.id === target.id);
  if (!rel) {
    rel = { id:target.id, name:target.name, type:'stranger', familiarity:0, affection:0, trust:0, conflict:0, attraction:0, lastContactDay:-1 };
    owner.relationships.push(rel);
  }
  return rel;
}

function relationshipType(rel) {
  if ((rel.conflict || 0) > 70) return 'rival';
  if ((rel.affection || 0) >= 82 && (rel.trust || 0) >= 65) return 'close friend';
  if ((rel.affection || 0) >= 55) return 'friend';
  if ((rel.familiarity || 0) >= 35) return 'acquaintance';
  if ((rel.familiarity || 0) >= 10) return 'familiar face';
  return 'stranger';
}

export class V7LifeSystem {
  constructor(simulation) {
    this.sim = simulation;
    this.state = simulation.state;
    this.rng = simulation.rng;
    initializeV7State(this.state,this.rng);
    this.lastMinuteKey = '';
  }

  get stamp() { return this.state.time.totalDays*1440 + this.state.time.minute; }
  get day() { return Math.floor(this.state.time.totalDays); }

  update() {
    this.updateActiveConditions();
    this.updatePhoneUnlock();
    this.updateSleepingPositions();
    this.updateMealClearing();
    this.maybeSchoolSocialMoment();
    this.processInvitations();
  }

  minuteTick() {
    this.maybeSchoolSocialMoment();
  }

  dailyTick() {
    initializeV7State(this.state,this.rng);
    this.updateMoods();
    this.maintainRelationships();
    this.ensureSocialOpportunity();
    this.progressAdultSiblings();
    this.maybeLifeEvent();
    this.maybeRomanceEvent();
    this.maybeHouseholdRomanceEvent();
    this.maybeSubstanceEvent();
  }

  onStageChange(person, oldStage) {
    ensurePerson(person);
    if (['child','teen','adult'].includes(person.stage)) this.state.phone.unlocked = true;
    if (person.stage === 'adult') this.beginAdultTransition(person);
    assignHomeSpaces(this.state);
  }

  updatePhoneUnlock() {
    const p = this.state.player;
    const wealthyEarly = this.state.household.tier >= 4 && p.age >= 10;
    if (p.age >= 12 || wealthyEarly || p.stage === 'adult') {
      this.state.phone.unlocked = true;
      p.phone.hasPhone = true;
    }
  }

  updateSleepingPositions() {
    for (const person of [this.state.player,...this.state.parents,...(this.state.siblings||[]),this.state.nanny].filter(Boolean)) {
      if (person.activity?.type !== 'sleeping' || person.location !== 'home') continue;
      const pos = assignedSleepPosition(this.state,person);
      if (!pos) continue;
      person.x = pos.x; person.y = pos.y; person.floor = pos.floor;
    }
  }

  updateMealClearing() {
    const home = this.state.household.home;
    const meal = home.meal;
    if (!meal) return;
    if (['ready','eating'].includes(meal.phase) && this.stamp > (meal.servedUntilStamp || meal.readyStamp + 95)) {
      const remaining = Math.max(0,(meal.attendees?.length || 0) - (meal.eatenIds?.length || 0));
      if (remaining > 0) {
        home.kitchen.leftovers = (home.kitchen.leftovers || 0) + remaining;
        home.kitchen.leftoverMeals.push({ name:meal.recipe || 'Meal', portions:remaining, day:this.day });
      }
      meal.phase = 'cleared';
      meal.clearedStamp = this.stamp;
      home.kitchen.preparedMeal = null;
    }
    if (meal.phase === 'cleared' && this.stamp - meal.clearedStamp > 20) {
      meal.phase = 'idle'; meal.type=null; meal.recipe=null; meal.cookId=null; meal.attendees=[]; meal.eatenIds=[]; meal.ingredientUse={};
    }
  }

  updateMoods() {
    for (const person of v7PersonList(this.state,true)) {
      if (person.alive === false) continue;
      const reasons=[];
      let score = person.needs?.mood ?? 60;
      const stress = person.needs?.stress ?? 20;
      if (stress > 70) { score -= 25; reasons.push('High stress'); }
      if ((person.socialNeed ?? 50) < 25) { score -= 18; reasons.push('Feeling lonely'); }
      if (person.health?.conditions?.length) { score -= 12; reasons.push('Health problems'); }
      if (person.health?.disability?.newlyAcquired) { score -= 18; reasons.push('Adapting to a disability'); }
      const recent = person.memories?.find(memory => this.day - memory.day <= 2 && memory.moodImpact);
      if (recent) { score += recent.moodImpact; reasons.push(recent.label); }
      let label='Content';
      if (person.moodState?.label === 'Grieving' && this.day - (person.moodState.sinceDay || 0) < 5) label='Grieving';
      else if (score < 25) label='Sad';
      else if (stress > 78) label='Anxious';
      else if ((person.needs?.energy ?? 60) < 20) label='Exhausted';
      else if ((person.socialNeed ?? 50) < 25) label='Lonely';
      else if (score > 82) label='Happy';
      else if (score > 70) label='Hopeful';
      person.moodState={ label, reasons:reasons.slice(0,3), sinceDay:person.moodState?.label===label ? person.moodState.sinceDay : this.day };
    }
  }

  updateActiveConditions() {
    for (const person of v7PersonList(this.state,true)) {
      ensurePerson(person);
      const conditions = person.health?.conditions || [];
      for (const condition of conditions) {
        if (condition.active && condition.endsDay != null && this.day >= condition.endsDay) {
          condition.active=false;
          person.health.status='Recovered';
          person.memories.unshift({day:this.day,label:`Recovered from ${condition.label}`,moodImpact:8});
        }
      }
      person.health.conditions = conditions.filter(condition => condition.active || condition.permanent);
    }
  }

  ensureSocialOpportunity() {
    const p=this.state.player;
    if (!['child','teen'].includes(p.stage)) return;
    if (!(this.state.social.clubs||[]).length && p.age >= 7) {
      const preferred=(p.hobbies||[])[0] || 'reading';
      const labels={painting:'Art Club',music:'Music Club',exercise:'Sports Club',gaming:'Game Club',reading:'Book Club',cooking:'Young Cooks Club',gardening:'Garden Club',sewing:'Craft Club'};
      const memberIds=this.rng.shuffle(this.state.social.classRoster).slice(0,Math.min(5,this.state.social.classRoster.length));
      this.state.social.clubs.push({id:`club-${preferred}`,label:labels[preferred]||'Community Club',hobbyId:preferred,memberIds,joinedDay:this.day,lastMeetingDay:-1});
      this.sim.log(`${p.name} joined the ${labels[preferred]||'Community Club'}.`,'important');
    }
    const meaningful=(p.relationships||[]).filter(rel=>['acquaintance','friend','close friend'].includes(rel.type));
    if (meaningful.length===0 && this.day-this.state.social.lastFriendCheckDay>=1) {
      this.state.social.lastFriendCheckDay=this.day;
      const targetId=this.rng.pick(this.state.social.classRoster);
      const target=this.state.town.residents.find(person=>person.id===targetId);
      if (target) {
        this.sim.notify(`${target.name.split(' ')[0]} saved you a seat at school.`, 'important', `social-opportunity-${this.day}`);
        this.sim.log(`${target.name} created a new social opportunity at school.`,'important');
      }
    }
    for (const club of this.state.social.clubs||[]) {
      if (this.day-club.lastMeetingDay < 3) continue;
      club.lastMeetingDay=this.day;
      const targetId=this.rng.pick(club.memberIds);
      const target=this.state.town.residents.find(person=>person.id===targetId);
      if (target) {
        this.socialize(p,target,'club');
        this.sim.log(`${p.name.split(' ')[0]} practiced ${club.hobbyId} with ${target.name.split(' ')[0]} at ${club.label}.`,'routine');
      }
    }
  }

  maybeSchoolSocialMoment() {
    const p=this.state.player;
    if (!['child','teen'].includes(p.stage) || p.location!=='school') return;
    const minute=Math.floor(this.state.time.minute);
    const windows=[10*60,12*60,14*60+20];
    const window=windows.find(value=>Math.abs(minute-value)<=5);
    if (window==null) return;
    const key=`${this.day}-${window}`;
    if (this.state.social.schoolOpportunities[key]) return;
    this.state.social.schoolOpportunities[key]=true;
    const targetId=this.rng.pick(this.state.social.classRoster);
    const target=this.state.town.residents.find(person=>person.id===targetId);
    if (target) this.socialize(p,target,'school');
  }

  socialize(person,target,context='conversation') {
    if (!person || !target || person.id===target.id) return null;
    ensurePerson(person); ensurePerson(target);
    const a=relationRecord(person,target); const b=relationRecord(target,person);
    const shared=(person.hobbies||[]).filter(item=>(target.hobbies||[]).includes(item)).length;
    const socialTrait=person.traits?.sociability ?? person.traitSeeds?.sociability ?? 50;
    const gain=clamp(7 + shared*4 + socialTrait/25 + this.rng.int(-2,4),4,18);
    a.familiarity=clamp((a.familiarity||0)+gain);
    a.affection=clamp((a.affection||0)+gain*.65);
    a.trust=clamp((a.trust||0)+gain*.35);
    a.lastContactDay=this.day;
    b.familiarity=clamp((b.familiarity||0)+gain*.8);
    b.affection=clamp((b.affection||0)+gain*.55);
    b.trust=clamp((b.trust||0)+gain*.3);
    b.lastContactDay=this.day;
    const oldType=a.type; a.type=relationshipType(a); b.type=relationshipType(b);
    person.socialNeed=clamp((person.socialNeed||50)+16);
    target.socialNeed=clamp((target.socialNeed||50)+10);
    const topics=['school','music','games','family','weekend plans','a shared hobby'];
    const topic=shared? 'a shared hobby':this.rng.pick(topics);
    this.sim.addSpeech?.(person,`We talked about ${topic}.`);
    if (oldType!==a.type && ['acquaintance','friend','close friend'].includes(a.type)) {
      this.sim.notify(`${person.name.split(' ')[0]} and ${target.name.split(' ')[0]} became ${a.type}s.`, 'important', `relationship-${person.id}-${target.id}-${a.type}`);
      this.sim.log(`${person.name} and ${target.name} became ${a.type}s.`,'important');
      if (!this.state.social.contacts.includes(target.id) && (person.id===this.state.player.id || target.id===this.state.player.id)) this.state.social.contacts.push(target.id);
    }
    return a;
  }

  maintainRelationships() {
    for (const person of v7PersonList(this.state,true)) {
      person.socialNeed=clamp((person.socialNeed??55)-this.rng.float(1,4));
      for (const rel of person.relationships||[]) {
        if (rel.lastContactDay>=0 && this.day-rel.lastContactDay>4) {
          rel.affection=clamp((rel.affection||0)-1.5);
          rel.familiarity=clamp((rel.familiarity||0)-.5);
          rel.type=relationshipType(rel);
        }
      }
    }
  }

  processInvitations() {
    const currentMinute=this.state.time.minute;
    for (const plan of this.state.social.invitations||[]) {
      if (!['accepted','in progress'].includes(plan.status)) continue;
      if (this.day > plan.day && plan.status !== 'completed') {
        plan.status='missed';
        continue;
      }
      if (this.day !== plan.day || currentMinute < plan.hour*60) continue;
      const target=v7PersonById(this.state,plan.contactId);
      if (!target) { plan.status='cancelled'; continue; }
      if (plan.status === 'accepted') {
        plan.status='in progress';
        target.location=plan.location;
        target.x=12*TILE; target.y=9*TILE;
        if (this.state.player.controlMode !== 'direct') this.sim.guidePlayer(plan.location, 'visiting');
        this.sim.notify(`${target.name.split(' ')[0]} is waiting at the ${plan.location}.`,'important',`invitation-start-${plan.id}`);
      }
      if (plan.status === 'in progress' && this.state.player.location === plan.location) {
        this.socialize(this.state.player,target,'planned visit');
        plan.status='completed';
        plan.completedDay=this.day;
        this.sim.log(`${this.state.player.name.split(' ')[0]} met ${target.name.split(' ')[0]} at the ${plan.location}.`,'important');
      }
    }
  }

  sendMessage(contactId, kind='hello') {
    if (!this.state.phone.unlocked) return {ok:false,text:'You do not have a personal phone yet.'};
    const target=v7PersonById(this.state,contactId);
    if (!target) return {ok:false,text:'That contact is unavailable.'};
    const thread=this.state.social.threads[contactId] ||= [];
    const sent=this.rng.pick(QUICK_MESSAGES[kind]||QUICK_MESSAGES.hello);
    thread.push({from:this.state.player.id,text:sent,stamp:this.stamp});
    const busy=['working','school','sleeping'].includes(target.activity?.type);
    const replyDelay=busy?90:this.rng.int(5,35);
    const reply=kind==='family' ? 'I miss everyone too. I will call soon.' : kind==='support' ? 'Thank you. That means a lot.' : kind==='invite' ? 'That sounds good. Let me check my schedule.' : 'Hey! It is nice to hear from you.';
    thread.push({from:target.id,text:reply,stamp:this.stamp+replyDelay,pending:replyDelay>20});
    const rel=this.socialize(this.state.player,target,'phone');
    if (rel) { rel.affection=clamp(rel.affection-2); rel.trust=clamp(rel.trust-1); }
    return {ok:true,text:busy?`${target.name.split(' ')[0]} is busy and may reply later.`:`Message sent to ${target.name.split(' ')[0]}.`};
  }

  invite(contactId) {
    const target=v7PersonById(this.state,contactId);
    if (!target) return {ok:false,text:'That contact is unavailable.'};
    const rel=relationRecord(this.state.player,target);
    if ((rel.familiarity||0)<18 && !['Sibling','Parent'].includes(target.role)) return {ok:false,text:'Get to know this person a little better first.'};
    const accepted=this.rng.chance(clamp(.35+(rel.affection||0)/160,0.25,.9));
    const plan={id:`invite-${this.day}-${contactId}`,contactId,day:this.day+1,hour:16,location:'park',status:accepted?'accepted':'declined'};
    this.state.social.invitations.push(plan);
    if (accepted) this.sim.log(`${target.name} agreed to meet at the park tomorrow.`,'important');
    return {ok:true,text:accepted?`${target.name.split(' ')[0]} accepted the invitation.`:`${target.name.split(' ')[0]} cannot make it this time.`};
  }

  changeFloor(floor) {
    const home=this.state.household.home;
    const target=home.floors.find(item=>item.id===floor && item.active);
    if (!target) return false;
    home.currentFloor=floor;
    return true;
  }

  requestSecondFloor() {
    const home=this.state.household.home;
    if (home.floors.find(item=>item.id===1)?.active || home.construction) return false;
    const item=HOUSE_PURCHASES.find(entry=>entry.id==='secondFloor');
    if (!item || this.state.household.money<item.cost) return false;
    this.sim.recordExpense(item.cost,'Second-floor construction deposit');
    home.construction={id:'secondFloor',label:item.label,roomId:'upperLanding',floor:1,startedDay:this.day,dueDay:this.day+(item.constructionDays||8),progress:0,status:'building',paid:item.cost};
    this.sim.log('Construction began on a second floor.','important');
    return true;
  }

  completeSecondFloor() {
    const home=this.state.household.home;
    const floor=home.floors.find(item=>item.id===1); if (floor) floor.active=true;
    for (const room of home.rooms.filter(item=>item.floor===1)) room.active=true;
    home.stairs.active=true;
    home.constructionHistory.unshift({id:'secondFloor',completedDay:this.day,label:'Second-floor addition'});
    const teens=[this.state.player,...(this.state.siblings||[])].filter(person=>['teen','adult'].includes(person.stage)&&!person.movedOut);
    teens.forEach((person,index)=>{
      const room=index%2===0?'upperBedroomA':'upperBedroomB';
      person.assignedRoomId=room;
      addFurnitureInstance(home,index%2===0?'upperBedA':'upperBedB',room,{ownerId:person.id,essential:true,floor:1});
    });
    assignHomeSpaces(this.state);
    this.sim.notify('The second floor is complete. New bedrooms and a hobby room are ready.', 'important','second-floor-complete');
  }

  beginAdultTransition(person) {
    if (this.state.adulthood.transitions[person.id]) return;
    const grades=person.school?.grades ?? person.development?.grades ?? 50;
    const creative=person.traitSeeds?.creativity ?? person.traits?.creativity ?? 50;
    const path=grades>70?'college':creative>72?'trade':'work';
    this.state.adulthood.transitions[person.id]={status:'decision',path:null,residence:null,day:this.day};
    if (person.id===this.state.player.id) {
      this.sim.showEvent({
        eyebrow:'ADULTHOOD BEGINS', title:'Where will your life go next?',
        body:'You are 18. Choose college, full-time work, or trade training. Each path includes moving away from the family home.',
        choices:[
          {label:'College and dormitory',action:()=>this.chooseAdultPath(person,'college')},
          {label:'Full-time work and shared apartment',action:()=>this.chooseAdultPath(person,'work')},
          {label:'Trade school and boarding house',action:()=>this.chooseAdultPath(person,'trade')}
        ]
      });
    } else this.chooseAdultPath(person,path);
  }

  chooseAdultPath(person,path) {
    const choices={college:{label:'College student',residence:'University dormitory'},work:{label:'Full-time worker',residence:'Shared apartment'},trade:{label:'Trade apprentice',residence:'Boarding house'}};
    const chosen=choices[path]||choices.work;
    const transition=this.state.adulthood.transitions[person.id] ||= {};
    Object.assign(transition,{status:'moved out',path,residence:chosen.residence,day:this.day});
    person.adultPath=path; person.residence=chosen.residence; person.movedOut=true;
    person.memories.unshift({day:this.day,label:`Moved into a ${chosen.residence.toLowerCase()}`,moodImpact:10});
    if (person.id===this.state.player.id) {
      this.state.adulthood.playerChoice=path;
      person.career ||= {job:null,payBonus:0,completedShiftKeys:[]};
      if (path==='work') person.career.job={...JOBS.find(job=>['office','retail','driver'].includes(job.id))};
      this.state.family.history.unshift(`${person.name} moved out to begin life as a ${chosen.label.toLowerCase()}.`);
      this.sim.notify(`You moved into a ${chosen.residence.toLowerCase()}.`, 'important','player-move-out');
    } else {
      const idx=(this.state.siblings||[]).findIndex(item=>item.id===person.id);
      if (idx>=0) {
        this.state.siblings.splice(idx,1);
        if (!this.state.extendedFamily.some(item=>item.id===person.id)) this.state.extendedFamily.push(person);
      }
      person.location='away';
      this.state.family.history.unshift(`${person.name} moved into a ${chosen.residence.toLowerCase()} for ${path}.`);
      this.sim.notify(`${person.name.split(' ')[0]} moved out for ${path}.`,'important',`moveout-${person.id}`);
    }
    assignHomeSpaces(this.state);
  }

  progressAdultSiblings() {
    for (const sibling of [...(this.state.siblings||[])]) {
      if (sibling.stage==='adult' && !sibling.movedOut) this.beginAdultTransition(sibling);
    }
    for (const sibling of this.state.extendedFamily||[]) {
      sibling.age += 1/730;
      if (sibling.adultPath==='college' && sibling.age>=22 && !sibling.job) sibling.job={...JOBS.find(job=>job.id==='office')};
      if (!sibling.phone.contacts.includes(this.state.player.id)) sibling.phone.contacts.push(this.state.player.id);
    }
  }

  addMajorEvent(type,person,label,details={}) {
    const event={id:`event-${type}-${this.day}-${Math.floor(this.rng.next()*1e6)}`,type,personId:person?.id||null,label,day:this.day,details};
    this.state.events.history.unshift(event);
    this.state.events.lastMajorDay=this.day;
    if (person) person.memories.unshift({day:this.day,label,moodImpact:details.moodImpact??-12});
    this.sim.log(label,'important');
    this.sim.notify(label,'important',event.id);
    return event;
  }

  maybeLifeEvent() {
    if (this.day-this.state.events.lastMajorDay<3) return;
    const difficulty=this.state.settings.lifeDifficulty;
    const chance=difficulty==='gentle'?.06:difficulty==='dramatic'?.22:.11;
    if (!this.rng.chance(chance)) return;
    const candidates=v7PersonList(this.state,true).filter(person=>person.alive!==false);
    const person=this.rng.pick(candidates); if (!person) return;
    const roll=this.rng.next();
    if (roll<.32) this.triggerMinorIllness(person);
    else if (roll<.52) this.triggerAccident(person);
    else if (roll<.67 && this.state.settings.seriousIllness!=='off') this.triggerSeriousIllness(person);
    else if (roll<.80 && this.state.settings.teenPregnancy!=='off') this.triggerPregnancyEvent();
    else if (this.state.settings.unexpectedDeath!=='off') this.triggerUnexpectedDeath(person);
  }

  triggerMinorIllness(person) {
    const illness=this.rng.pick(['flu','stomach illness','fever','migraine']);
    person.health.conditions.push({id:illness,label:titleCase(illness),active:true,severity:'minor',startedDay:this.day,endsDay:this.day+this.rng.int(1,3)});
    person.health.status=`Recovering from ${illness}`;
    person.needs.health=clamp((person.needs.health||80)-12);
    person.moodState={label:'Exhausted',reasons:[titleCase(illness)],sinceDay:this.day};
    this.addMajorEvent('illness',person,`${person.name} came down with ${illness}.`,{moodImpact:-8});
  }

  triggerSeriousIllness(person) {
    if (this.state.settings.seriousIllness==='rare' && !this.rng.chance(.35)) return this.triggerMinorIllness(person);
    const illness=this.rng.pick(['cancer','heart disease','serious respiratory illness']);
    person.health.conditions.push({id:illness,label:titleCase(illness),active:true,severity:'serious',startedDay:this.day,endsDay:this.day+this.rng.int(6,14)});
    person.health.status=`In treatment for ${illness}`;
    person.needs.health=clamp((person.needs.health||80)-28);
    this.sim.recordExpense(Math.min(this.state.household.money,500+this.rng.int(200,900)),`Medical care for ${person.name}`);
    this.addMajorEvent('serious-illness',person,`${person.name} was diagnosed with ${illness}. Treatment has begun.`,{moodImpact:-25});
  }

  triggerAccident(person) {
    const serious=this.rng.chance(.28);
    const injury=serious?this.rng.pick(['spinal injury','severe leg injury','head injury']):this.rng.pick(['broken arm','sprained ankle','concussion']);
    person.health.conditions.push({id:`injury-${this.day}`,label:titleCase(injury),active:true,severity:serious?'serious':'moderate',startedDay:this.day,endsDay:this.day+(serious?this.rng.int(5,12):this.rng.int(2,5))});
    if (serious && this.rng.chance(.35)) {
      person.health.disability={type:this.rng.pick(['mobility','hearing','chronic pain']),label:this.rng.pick(['Permanent mobility disability','Permanent hearing loss','Chronic pain']),permanent:true,newlyAcquired:true,startedDay:this.day};
    } else if (serious) person.health.disability={type:'mobility',label:'Temporary mobility disability',permanent:false,newlyAcquired:true,endsDay:this.day+this.rng.int(5,10)};
    person.needs.health=clamp((person.needs.health||80)-(serious?35:15));
    this.addMajorEvent('accident',person,`${person.name} was injured in an accident: ${injury}.`,{moodImpact:serious?-24:-10});
  }

  triggerUnexpectedDeath(person) {
    if (this.state.settings.unexpectedDeath==='rare' && !this.rng.chance(.18)) return this.triggerMinorIllness(person);
    if (person.id===this.state.player.id && person.age<18) return this.triggerAccident(person);
    person.alive=false; person.causeOfDeath='Unexpected medical or accidental event'; person.location='away';
    person.moodState={label:'Grieving',reasons:[],sinceDay:this.day};
    for (const relative of v7PersonList(this.state,true).filter(other=>other.id!==person.id&&other.alive!==false)) {
      relative.moodState={label:'Grieving',reasons:[`Death of ${person.name}`],sinceDay:this.day};
      relative.memories.unshift({day:this.day,label:`Grieved the death of ${person.name}`,moodImpact:-30});
    }
    this.addMajorEvent('death',person,`${person.name} died unexpectedly. The family entered a period of grief.`,{moodImpact:-30});
  }

  triggerPregnancyEvent() {
    const teens=v7PersonList(this.state,true).filter(person=>person.alive!==false && person.stage==='teen' && person.age>=15 && person.romance?.partnerId);
    const adultCouples=v7PersonList(this.state,true).filter(person=>person.stage==='adult'&&person.romance?.partnerId);
    const person=this.rng.pick(teens.length?teens:adultCouples);
    if (!person) return;
    const isTeen=person.stage==='teen';
    if (isTeen && this.state.settings.teenPregnancy==='rare' && !this.rng.chance(.28)) return;
    person.pregnancy={startedDay:this.day,dueDay:this.day+2,unexpected:isTeen};
    this.addMajorEvent('pregnancy',person,isTeen?`${person.name}, age ${Math.floor(person.age)}, learned about an unexpected pregnancy.`:`${person.name} learned that a baby is expected.`,{moodImpact:isTeen?-20:8});
  }

  maybeRomanceEvent() {
    const player=this.state.player;
    if (!['teen','adult'].includes(player.stage) || this.rng.chance(.72)) return;
    if (player.stage === 'teen' && this.state.settings.teenRomance === 'off') return;
    const peers=(player.relationships||[]).filter(rel=>{
      const person=v7PersonById(this.state,rel.id); return person && Math.abs(person.age-player.age)<=4 && rel.affection>=28;
    });
    const rel=this.rng.pick(peers); if (!rel) return;
    const target=v7PersonById(this.state,rel.id); if (!target) return;
    ensurePerson(target);
    if (!player.romance.crushId) {
      player.romance.crushId=target.id; rel.attraction=clamp((rel.attraction||0)+30);
      player.romance.milestones.push({type:'first-crush',personId:target.id,day:this.day});
      this.addMajorEvent('crush',player,`${player.name.split(' ')[0]} developed a crush on ${target.name}.`,{moodImpact:10});
      return;
    }
    if (!player.romance.partnerId && player.romance.crushId===target.id && rel.affection>48) {
      player.romance.partnerId=target.id; player.romance.status='dating'; player.romance.exclusive=true;
      target.romance.partnerId=player.id; target.romance.status='dating'; target.romance.exclusive=true;
      player.romance.milestones.push({type:'first-relationship',personId:target.id,day:this.day});
      this.addMajorEvent('romance',player,`${player.name.split(' ')[0]} and ${target.name.split(' ')[0]} started dating.`,{moodImpact:15});
      return;
    }
    if (player.romance.partnerId===target.id && !player.romance.milestones.some(item=>item.type==='first-kiss')) {
      player.romance.milestones.push({type:'first-kiss',personId:target.id,day:this.day});
      this.addMajorEvent('first-kiss',player,`${player.name.split(' ')[0]} shared a first kiss with ${target.name.split(' ')[0]}.`,{moodImpact:18});
      return;
    }
    if (player.stage==='adult' && player.romance.partnerId===target.id && this.state.settings.adultIntimacy!=='off' && !player.romance.milestones.some(item=>item.type==='adult-intimacy')) {
      player.romance.milestones.push({type:'adult-intimacy',personId:target.id,day:this.day});
      this.addMajorEvent('adult-intimacy',player,`${player.name.split(' ')[0]} and ${target.name.split(' ')[0]} chose to spend a private night together.`,{moodImpact:12});
    }
    this.maybeCheatingEvent(player,target);
  }

  maybeHouseholdRomanceEvent() {
    if (this.state.settings.cheating === 'off') return;
    const couples = [];
    const seen = new Set();
    for (const person of v7PersonList(this.state,true)) {
      if (person.alive === false || !person.romance?.partnerId || !person.romance.exclusive) continue;
      const partner = v7PersonById(this.state, person.romance.partnerId);
      if (!partner || partner.alive === false) continue;
      const key = [person.id, partner.id].sort().join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      couples.push([person, partner]);
    }
    for (const [person, partner] of couples) {
      if (person.id === this.state.player.id || partner.id === this.state.player.id) continue;
      if (this.rng.chance(.32)) this.maybeCheatingEvent(person, partner);
    }
  }

  maybeCheatingEvent(person,partner) {
    if (this.state.settings.cheating==='off' || !person.romance.exclusive) return;
    const frequency={rare:.015,realistic:.035,frequent:.09}[this.state.settings.cheating] || .015;
    const impulsive=person.traitSeeds?.impulsiveness ?? person.traits?.impulsiveness ?? 50;
    const loyal=person.romance.loyalty ?? 70;
    if (!this.rng.chance(frequency + impulsive/2500 - loyal/5000)) return;
    let others=(person.relationships||[]).filter(rel=>rel.id!==partner.id&&rel.affection>35).map(rel=>v7PersonById(this.state,rel.id)).filter(Boolean);
    if (!others.length) {
      others=(this.state.town?.residents||[]).filter(candidate => candidate.alive !== false && ['adult','elder'].includes(candidate.stage) && candidate.id !== partner.id && Math.abs(candidate.age-person.age) <= 15);
      const introduced=this.rng.pick(others);
      if (introduced) {
        const rel=relationRecord(person,introduced);
        rel.familiarity=Math.max(rel.familiarity||0,38);
        rel.affection=Math.max(rel.affection||0,40);
        others=[introduced];
      }
    }
    const other=this.rng.pick(others); if (!other) return;
    const discovered=this.rng.chance(.55);
    person.romance.affair={personId:other.id,startedDay:this.day,discovered};
    if (discovered) {
      const partnerRel=relationRecord(partner,person); partnerRel.trust=clamp(partnerRel.trust-55); partnerRel.conflict=clamp(partnerRel.conflict+45);
      person.moodState={label:'Anxious',reasons:['Relationship betrayal discovered'],sinceDay:this.day};
      partner.moodState={label:'Angry',reasons:['Discovered cheating'],sinceDay:this.day};
      person.romance.sleepingApart=true;
      if (this.state.parents.some(parent=>parent.id===person.id) && this.state.parents.some(parent=>parent.id===partner.id) && this.state.family.relationship) {
        this.state.family.relationship.trust=clamp((this.state.family.relationship.trust||50)-45);
        this.state.family.relationship.tension=clamp((this.state.family.relationship.tension||30)+50);
      }
      assignHomeSpaces(this.state);
      this.addMajorEvent('cheating',person,`${partner.name} discovered that ${person.name} had been unfaithful. Trust collapsed, and they began sleeping separately.`,{moodImpact:-28});
    } else this.addMajorEvent('secret-affair',person,`${person.name} began hiding a romantic connection outside the relationship.`,{moodImpact:-8});
  }

  maybeSubstanceEvent() {
    if (this.state.settings.substanceEvents==='off') return;
    const candidates=v7PersonList(this.state,true).filter(person=>['teen','adult'].includes(person.stage)&&person.alive!==false);
    const person=this.rng.pick(candidates); if (!person) return;
    const impulsive=person.traitSeeds?.impulsiveness ?? person.traits?.impulsiveness ?? 50;
    const stress=person.needs?.stress ?? 20;
    const chance=this.state.settings.substanceEvents==='mild'?.015:.035;
    if (!this.rng.chance(chance+(impulsive+stress)/5000)) return;
    const refused=this.rng.chance(clamp(.65+(person.traitSeeds?.responsibility??50)/300,0.45,.9));
    if (refused) {
      person.memories.unshift({day:this.day,label:'Refused substance-related peer pressure',moodImpact:4});
      this.sim.log(`${person.name} refused a risky substance offer.`,'important');
    } else {
      person.substanceHistory ||= [];
      person.substanceHistory.push({day:this.day,type:'first experimentation',consequence:this.rng.chance(.25)?'negative reaction':'none'});
      person.needs.mood=clamp(person.needs.mood-6); person.needs.health=clamp(person.needs.health-3);
      this.addMajorEvent('substance',person,`${person.name} experimented with a risky substance for the first time.`,{moodImpact:-7});
    }
  }
}
