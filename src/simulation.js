import {
  SPEEDS, NEED_DECAY, EXPENSES, HOUSE_PURCHASES, HOBBIES, JOBS, TILE,
  FAST_SUMMARY_INTERVAL_MINUTES
} from './config.js';
import { ACTIVITY_LABELS, LIFE_EVENTS, STAGE_TRAITS } from './data.js';
import {
  clamp, dayName, formatTime, getDayIndex, getWeekIndex, isWeekday, isWeekend,
  moveToward, nowGameStamp, peso, stageForAge, titleCase
} from './utils.js';
import {
  activateRoom, addFurniture, createSibling, hasFurniture, roomExists
} from './state.js';
import {
  collides, findSafePoint, getAllFamily, getCaregivers, getDependents, getYoungestChild, getLocation, getPersonById,
  getActivityPoint, getIndoorWaypoints, getSceneEntryPoint, getSceneExitPoint, getTownDoorPoint, locationLabel, nearestObject, residentScheduleLocation
} from './world.js';
import { evolveAppearance } from './art.js';
import { V7LifeSystem, assignHomeSpaces, preferredHobbyRoom } from './v7.js';

const PLAYER_YEAR_DAYS = 2;
const GAME_MINUTES_PER_REAL_SECOND = 5;
const CARE_LOCK_MINUTES = 45;
const ROUTE_EPSILON = 8;

function activity(type, duration = 30, extra = {}) {
  return { type, remaining: duration, startedStamp: 0, ...extra };
}

function goal(type, destination, duration, priority = 10, extra = {}) {
  return { type, destination, duration, priority, ...extra };
}

function isDependent(person) {
  return ['baby', 'toddler', 'child'].includes(person.stage);
}

function isYoungDependent(person) {
  return ['baby', 'toddler'].includes(person.stage);
}

function personNeedScore(person) {
  const needs = person.needs;
  return (100 - needs.satiety) + (100 - needs.energy) + (100 - needs.hygiene) + (100 - needs.comfort) + (needs.stress || 0);
}

function purchaseById(id) {
  return HOUSE_PURCHASES.find(item => item.id === id) || null;
}

function hobbyById(id) {
  return HOBBIES.find(item => item.id === id) || HOBBIES[0];
}

export class Simulation {
  constructor(state, rng, callbacks = {}) {
    this.state = state;
    this.rng = rng;
    this.notify = callbacks.notify || (() => {});
    this.showEvent = callbacks.showEvent || (() => {});
    this.onStateChanged = callbacks.onStateChanged || (() => {});
    this.onSceneChanged = callbacks.onSceneChanged || (() => {});
    this.careLock = null;
    this.lastMinute = Math.floor(state.time.minute);
    this.lastScheduleTick = -999;
    this.lastResidentTick = -999;
    this.lastFastSummaryStamp = nowGameStamp(state);
    this.ensureAgentsReady();
    this.v7 = new V7LifeSystem(this);
  }

  ensureAgentsReady() {
    for (const person of getAllFamily(this.state)) {
      person.activity ||= activity('waiting', 0);
      person.currentGoal ||= null;
      person.route ||= null;
      person.moving ??= false;
      person.dir ||= 'down';
      person.needs.stress ??= 10;
      person.hobbies ||= ['reading'];
      person.skills ||= { social: 0, cooking: 0, exercise: 0, painting: 0, music: 0, gardening: 0, sewing: 0, gaming: 0 };
      person.relationships ||= [];
    }
  }

  get speed() {
    return SPEEDS[this.state.speedIndex] || 1;
  }

  get gameStamp() {
    return nowGameStamp(this.state);
  }

  update(realDt) {
    const dt = Math.min(0.1, Math.max(0, realDt));
    const gameMinutes = dt * this.speed * GAME_MINUTES_PER_REAL_SECOND;
    this.advanceTime(gameMinutes);
    this.updateAging(gameMinutes);
    this.updateNeeds(gameMinutes);
    this.updateHouseholdLife();
    this.updateFamilyAgents(dt, gameMinutes);
    this.updatePlayer(dt, gameMinutes);
    this.updatePregnancy();
    this.updateHomeProjects();
    this.updateSocialLife();
    this.v7?.update();
    this.maybeFlushFastSummary();
    this.rng.state >>>= 0;
    this.state.rngState = this.rng.state;
  }

  advanceTime(gameMinutes) {
    const previousDay = Math.floor(this.state.time.totalDays);
    this.state.time.minute += gameMinutes;
    while (this.state.time.minute >= 1440) {
      this.state.time.minute -= 1440;
      this.state.time.totalDays += 1;
      this.state.time.day = this.state.time.totalDays + 1;
      this.handleNewDay();
    }
    const minute = Math.floor(this.state.time.minute);
    if (minute !== this.lastMinute) {
      this.lastMinute = minute;
      this.handleMinuteTick();
    }
    if (previousDay !== Math.floor(this.state.time.totalDays)) this.onStateChanged();
  }

  handleMinuteTick() {
    const stamp = this.gameStamp;
    if (stamp - this.lastScheduleTick >= 10) {
      this.lastScheduleTick = stamp;
      this.evaluateScheduledChanges();
      this.v7?.minuteTick();
    }
  }

  handleNewDay() {
    const state = this.state;
    state.player.school.attendedDay = state.player.school.attendedDay ?? -1;
    state.household.home.cleanliness = clamp(state.household.home.cleanliness - this.rng.int(1, 4));
    state.household.home.condition = clamp(state.household.home.condition - this.rng.float(0.15, 0.7));
    const chores = state.household.home.chores;
    const householdSize = getAllFamily(state).filter(person => person.alive !== false).length;
    chores.laundryLoads = clamp((chores.laundryLoads || 0) + Math.max(1, Math.ceil(householdSize / 4)), 0, 8);
    chores.trash = clamp((chores.trash || 0) + this.rng.int(1, 2), 0, 10);
    chores.floorMess = clamp((chores.floorMess || 0) + this.rng.int(5, 11), 0, 100);
    chores.bathroomMess = clamp((chores.bathroomMess || 0) + this.rng.int(3, 8), 0, 100);
    if (state.family.relationship) {
      state.family.relationship.tension = clamp(state.family.relationship.tension + this.rng.int(-3, 4));
      state.family.relationship.affection = clamp(state.family.relationship.affection + this.rng.int(-2, 2));
    }
    this.evaluateChildcareArrangement();
    this.evaluateHomeWishlist();
    this.processBills();
    this.evaluateFamilyPlanning();
    this.maybeTriggerEvent();
    this.v7?.dailyTick();
    this.log(`${dayName(state.time.totalDays)} begins.`, 'routine');
  }

  updateAging(gameMinutes) {
    const years = gameMinutes / (1440 * PLAYER_YEAR_DAYS);
    const familyYoung = [this.state.player, ...this.state.siblings];
    for (const person of familyYoung) {
      const oldStage = person.stage;
      person.age += years;
      person.stage = stageForAge(person.age);
      if (oldStage !== person.stage) { person.appearance = evolveAppearance(this.rng, person, person.stage); this.handleStageChange(person, oldStage); }
    }
    for (const parent of this.state.parents) {
      const oldStage = parent.stage;
      parent.age += years;
      parent.stage = stageForAge(parent.age);
      if (oldStage !== parent.stage) parent.appearance = evolveAppearance(this.rng, parent, parent.stage);
    }
    for (const resident of this.state.town.residents) {
      resident.age += years * 0.2;
      resident.stage = stageForAge(resident.age);
    }
  }

  handleStageChange(person, oldStage) {
    this.v7?.onStageChange(person, oldStage);
    if (person.id === this.state.player.id) {
      person.crying = false;
      person.carriedBy = null;
      person.route = null;
      person.currentGoal = null;
      const safe = findSafePoint(this.state, person.location, getSceneEntryPoint(person.location));
      person.x = safe.x;
      person.y = safe.y;
      const trait = (STAGE_TRAITS[person.stage] || []).find(entry => entry.condition(person));
      if (trait && !person.traits.some(item => item.id === trait.id)) person.traits.push({ id: trait.id, label: trait.label });
      this.evaluateChildcareArrangement();
      this.evaluateHomeWishlist(true);
      const messages = {
        toddler: ['First steps', 'You can move around, explore rooms, and follow your caregivers on outings.'],
        child: ['School begins', 'Your daily schedule now includes school, homework, friends, and independent activities.'],
        teen: ['A need for privacy', 'Your family will evaluate whether it can create a separate bedroom. You can study, work part-time, and make more independent plans.'],
        adult: ['Your own direction', 'Work, relationships, housing, and parenthood now become part of your autonomous schedule.'],
        elder: ['The long view', 'Your schedule slows down, while family connections and health become more important.']
      };
      const copy = messages[person.stage];
      if (copy && person.stage !== 'adult') this.showEvent({ eyebrow: 'LIFE STAGE', title: copy[0], body: copy[1], choices: [{ label: 'Continue' }] });
      this.notify(`You are now a ${person.stage}.`, 'important', `stage-${person.stage}`);
      this.log(`${person.name} entered the ${person.stage} stage.`, 'important');
    } else {
      this.notify(`${person.name} is now a ${person.stage}.`, 'important', `sibling-stage-${person.id}-${person.stage}`);
      this.evaluateChildcareArrangement();
      this.evaluateHomeWishlist(true);
    }
  }

  updateNeeds(gameMinutes) {
    const state = this.state;
    for (const person of [state.player, ...state.siblings]) {
      if (person.alive === false) continue;
      const rates = NEED_DECAY[person.stage] || NEED_DECAY.adult;
      person.needs.satiety = clamp(person.needs.satiety - gameMinutes * rates.satiety / 60);
      person.needs.energy = clamp(person.needs.energy - gameMinutes * rates.energy / 60);
      person.needs.hygiene = clamp(person.needs.hygiene - gameMinutes * rates.hygiene / 60);
      person.needs.comfort = clamp(person.needs.comfort - gameMinutes * rates.comfort / 60);
      const comfortable = person.needs.satiety > 38 && person.needs.energy > 25 && person.needs.comfort > 35;
      person.needs.mood = clamp(person.needs.mood + gameMinutes * (comfortable ? 0.012 : -0.045));
      person.needs.stress = clamp(person.needs.stress + gameMinutes * (comfortable ? -0.01 : 0.035));
      if (person.needs.satiety < 8 || person.needs.hygiene < 6 || person.needs.energy < 4) {
        person.needs.health = clamp(person.needs.health - gameMinutes * 0.035);
      } else if (person.needs.health < 100) {
        person.needs.health = clamp(person.needs.health + gameMinutes * 0.004);
      }
    }

    for (const caregiver of getCaregivers(state)) {
      caregiver.needs.satiety = clamp(caregiver.needs.satiety - gameMinutes * 0.13 / 60);
      caregiver.needs.energy = clamp(caregiver.needs.energy - gameMinutes * 0.12 / 60);
      caregiver.needs.hygiene = clamp(caregiver.needs.hygiene - gameMinutes * 0.05 / 60);
      const moneyStress = caregiver.role === 'Parent' && state.household.money < 250 ? 0.04 : -0.008;
      caregiver.needs.stress = clamp(caregiver.needs.stress + gameMinutes * moneyStress);
      caregiver.needs.mood = clamp(caregiver.needs.mood + gameMinutes * (caregiver.needs.stress < 55 ? 0.006 : -0.018));
    }
  }

  updateFamilyAgents(realDt, gameMinutes) {
    this.releaseExpiredCareLock();
    for (const parent of this.state.parents) this.updateParent(parent, realDt, gameMinutes);
    if (this.state.nanny) this.updateNanny(this.state.nanny, realDt, gameMinutes);
    for (const sibling of this.state.siblings) this.updateSibling(sibling, realDt, gameMinutes);
  }

  updateParent(parent, realDt, gameMinutes) {
    if (!parent.alive) return;
    if (this.finishExpiredActivity(parent)) return;
    if (parent.route) {
      this.updateRoute(parent, realDt);
      return;
    }
    if (this.activityActive(parent)) {
      this.advanceActivity(parent, gameMinutes);
      return;
    }
    const nextGoal = this.chooseParentGoal(parent);
    this.assignGoal(parent, nextGoal);
  }

  updateNanny(nanny, realDt, gameMinutes) {
    if (!nanny.alive) return;
    if (this.finishExpiredActivity(nanny)) return;
    if (nanny.route) { this.updateRoute(nanny, realDt); return; }
    if (this.activityActive(nanny)) { this.advanceActivity(nanny, gameMinutes); return; }
    this.assignGoal(nanny, this.chooseNannyGoal(nanny));
  }

  updateSibling(sibling, realDt, gameMinutes) {
    if (!sibling.alive || sibling.movedOut) return;
    if (this.finishExpiredActivity(sibling)) return;
    if (sibling.route) {
      this.updateRoute(sibling, realDt);
      return;
    }
    if (this.activityActive(sibling)) {
      this.advanceActivity(sibling, gameMinutes);
      return;
    }
    const duty = this.chooseHouseholdDutyGoal(sibling);
    const next = duty || this.chooseYoungPersonGoal(sibling, false);
    this.assignGoal(sibling, next);
  }

  updatePlayer(realDt, gameMinutes) {
    const player = this.state.player;
    if (!player.alive || player.carriedBy) return;
    if (this.finishExpiredActivity(player)) return;
    if (player.controlMode === 'direct' || player.controlMode === 'paused') {
      player.moving = false;
      return;
    }
    if (player.route) {
      this.updateRoute(player, realDt);
      return;
    }
    if (this.activityActive(player)) {
      this.advanceActivity(player, gameMinutes);
      return;
    }
    const duty = this.chooseHouseholdDutyGoal(player);
    const nextGoal = duty || this.choosePlayerGoal();
    this.assignGoal(player, nextGoal);
  }

  isWorkingOrUnavailable(person) {
    if (!person || person.alive === false) return true;
    const type = person.activity?.type;
    if (['working','remoteWork','commuting','school','partTimeWork'].includes(type)) return true;
    if (person.route && ['workplace','school','hospital','grocery'].includes(person.route.destination) && person.currentGoal?.type === 'working') return true;
    return false;
  }

  isCaregiverAvailable(person) {
    if (!person || person.alive === false || this.isWorkingOrUnavailable(person)) return false;
    const hour = this.state.time.minute / 60;
    if (person.role === 'Nanny' && !person.liveIn && (!isWeekday(this.state.time.totalDays) || hour < 6.5 || hour >= 19)) return false;
    return person.location === 'home';
  }

  getActiveCaregiver() {
    const assignedId = this.state.family.childcare?.caregiverId;
    const assigned = assignedId ? getPersonById(this.state, assignedId) : null;
    if (this.isCaregiverAvailable(assigned)) return assigned;
    const candidates = [this.state.nanny, ...this.state.parents]
      .filter(person => this.isCaregiverAvailable(person))
      .sort((a,b) => {
        const aStay = a.careerStatus === 'stayHome' || a.role === 'Nanny' ? 1 : 0;
        const bStay = b.careerStatus === 'stayHome' || b.role === 'Nanny' ? 1 : 0;
        return bStay-aStay || (b.traits?.responsibility||50)-(a.traits?.responsibility||50);
      });
    return candidates[0] || null;
  }

  selectHouseholdAdult(filter = () => true) {
    return [this.state.nanny, ...this.state.parents]
      .filter(person => person && person.location === 'home' && !this.isWorkingOrUnavailable(person) && filter(person))
      .sort((a,b) => (b.traits?.responsibility||50) - (a.traits?.responsibility||50))[0] || null;
  }

  currentMealWindow() {
    const hour = this.state.time.minute / 60;
    const pantry = this.state.household.home.kitchen.ingredients || {};
    if (hour >= 6.4 && hour < 9) {
      if ((pantry.bread || 0) >= 1 && (pantry.fruit || 0) >= 1) return { type:'breakfast', recipe:'Toast and fruit', ingredients:{bread:1,fruit:1} };
      return { type:'breakfast', recipe:'Warm breakfast rice', ingredients:{rice:1} };
    }
    if (hour >= 11.5 && hour < 14) {
      if ((pantry.vegetables || 0) >= 1) return { type:'lunch', recipe:'Vegetable rice bowls', ingredients:{rice:1,vegetables:1} };
      return { type:'lunch', recipe:'Simple sandwiches', ingredients:{bread:1} };
    }
    if (hour >= 17.5 && hour < 20.5) {
      if ((pantry.protein || 0) >= 1 && (pantry.vegetables || 0) >= 1) return { type:'dinner', recipe:'Protein and vegetable dinner', ingredients:{protein:1,vegetables:1,rice:1} };
      return { type:'dinner', recipe:'Family vegetable stew', ingredients:{vegetables:1,rice:1} };
    }
    return null;
  }

  updateHouseholdLife() {
    const home = this.state.household.home;
    home.speech = (home.speech || []).filter(item => item.untilStamp > this.gameStamp);
    const meal = home.meal;
    const window = this.currentMealWindow();
    const day = Math.floor(this.state.time.totalDays);
    if (window) {
      const key = `${day}-${window.type}`;
      if (meal.lastKey !== key && meal.phase === 'idle') {
        const cook = this.getActiveCaregiver() || this.selectHouseholdAdult();
        meal.phase = 'planned'; meal.type = window.type; meal.recipe = window.recipe; meal.ingredientUse = window.ingredients || {}; meal.cookId = cook?.id || null;
        meal.startedStamp = this.gameStamp; meal.readyStamp = -1; meal.lastKey = key; meal.attendees = []; meal.eatenIds = [];
      }
      if (meal.phase === 'planned') {
        const cook = getPersonById(this.state, meal.cookId);
        if (!this.isCaregiverAvailable(cook)) {
          const replacement = this.getActiveCaregiver() || this.selectHouseholdAdult();
          meal.cookId = replacement?.id || null;
        }
      }
    }
    // V7: food is visible only while served/eaten. Dishes are a separate chore and never block the next meal.
    if (['ready','eating'].includes(meal.phase) && !meal.servedUntilStamp) meal.servedUntilStamp = meal.readyStamp + 95;
    if (meal.phase === 'cleared' && this.gameStamp - (meal.clearedStamp || this.gameStamp) > 20) {
      meal.phase = 'idle'; meal.type = null; meal.recipe = null; meal.ingredientUse = {}; meal.cookId = null; meal.attendees = []; meal.eatenIds = []; meal.servedUntilStamp = -1;
    }
    home.cleanliness = clamp(100 - ((home.chores.floorMess||0)*.35 + (home.chores.bathroomMess||0)*.25 + (home.chores.dirtyDishes||0)*1.4 + (home.chores.trash||0)*2.4));
  }

  chooseHouseholdDutyGoal(person) {
    if (!person || person.location !== 'home' || this.isWorkingOrUnavailable(person)) return null;
    const home = this.state.household.home;
    const meal = home.meal;
    if (meal.phase === 'planned' && meal.cookId === person.id) return goal('cooking','home',45,108,{ mealType:meal.type, recipe:meal.recipe });
    if (['ready','eating'].includes(meal.phase) && !['baby'].includes(person.stage)) {
      const eligible = [this.state.player,...this.state.parents,...this.state.siblings,this.state.nanny].filter(Boolean).filter(member => member.location === 'home' && member.alive !== false && member.stage !== 'baby');
      meal.attendees = eligible.map(member => member.id);
      meal.eatenIds ||= [];
      if (meal.attendees.includes(person.id) && !meal.eatenIds.includes(person.id)) return goal('familyMeal','home',35,102,{ mealType:meal.type });
    }
    const chores = home.chores;
    const responsible = (person.traits?.responsibility ?? person.traitSeeds?.responsibility ?? 45);
    const ageOK = ['teen','adult','elder'].includes(person.stage) || person.role === 'Nanny' || person.role === 'Parent';
    if (!ageOK) return null;
    const availableAdults = [this.state.nanny, ...this.state.parents]
      .filter(candidate => candidate && candidate.location === 'home' && !this.isWorkingOrUnavailable(candidate));
    const owner = type => {
      const ranked = [...availableAdults].sort((a, b) => {
        const aScore = (a.traits?.responsibility || 50) + (a.careerStatus === 'stayHome' ? 18 : 0)
          + (a.role === 'Nanny' && ['dishes','laundry'].includes(type) ? 5 : 0)
          + ((a.skills?.[type] || 0) * 2);
        const bScore = (b.traits?.responsibility || 50) + (b.careerStatus === 'stayHome' ? 18 : 0)
          + (b.role === 'Nanny' && ['dishes','laundry'].includes(type) ? 5 : 0)
          + ((b.skills?.[type] || 0) * 2);
        return bScore - aScore;
      });
      if (!ranked.length) return null;
      const rotation = Math.floor(this.state.time.totalDays + ['dishes','laundry','trash'].indexOf(type)) % ranked.length;
      return ranked[rotation];
    };
    if ((chores.dirtyDishes||0) >= 4 && owner('dishes')?.id === person.id) return goal('washDishes','home',35,82);
    if ((chores.laundryLoads||0) >= 2 && owner('laundry')?.id === person.id) return goal('laundry','home',70,72);
    if ((chores.trash||0) >= 4 && owner('trash')?.id === person.id) return goal('takeTrash','home',25,68);
    if ((chores.bathroomMess||0) >= 55 && responsible > 42) return goal('cleanBathroom','home',55,62);
    if ((chores.floorMess||0) >= 60 && responsible > 42) return goal('cleaning','home',55,60,{roomId:'livingRoom'});
    return null;
  }

  updateSocialLife() {
    const social = this.state.social;
    social.speech = (social.speech || []).filter(item => item.untilStamp > this.gameStamp);
  }

  addSpeech(person, text, duration = 35) {
    const target = person.location === 'home' ? this.state.household.home.speech : this.state.social.speech;
    target.push({ personId:person.id, text, untilStamp:this.gameStamp+duration });
    while (target.length > 8) target.shift();
  }

  performSocialInteraction(person, preferredTarget = null) {
    const pool = person.location === 'home'
      ? getAllFamily(this.state).filter(other => other.id !== person.id && other.location === 'home' && other.alive !== false)
      : this.state.town.residents.filter(other => residentScheduleLocation(other,this.state) === person.location && other.alive !== false && Math.abs((other.age||0)-(person.age||0)) < 22);
    const target = preferredTarget || this.rng.pick(pool);
    if (!target) return;
    person.relationships ||= []; target.relationships ||= [];
    let rel = person.relationships.find(item => item.id === target.id);
    if (!rel) { rel = { id:target.id, name:target.name, type:'acquaintance', affection:5, trust:2, conflict:0, meetings:0 }; person.relationships.push(rel); }
    rel.meetings = (rel.meetings||0)+1;
    const sociability = person.traits?.sociability ?? person.traitSeeds?.sociability ?? 50;
    rel.affection = clamp(rel.affection + 3 + sociability/30);
    rel.trust = clamp((rel.trust||0)+2);
    if (rel.affection >= 65) rel.type='close friend'; else if (rel.affection >= 30) rel.type='friend';
    const reverse = target.relationships.find(item => item.id === person.id);
    if (reverse) { reverse.affection = clamp(reverse.affection+3); reverse.trust=clamp((reverse.trust||0)+2); }
    else target.relationships.push({id:person.id,name:person.name,type:'acquaintance',affection:8,trust:3,conflict:0,meetings:1});
    const lines = person.location === 'home' ? ['How was your day?','Want to sit together?','I was thinking about you.','Let’s eat together.'] : ['Hi, I see you here often.','What do you like doing?','Nice weather today.','Want to talk for a bit?'];
    this.addSpeech(person, this.rng.pick(lines));
    person.needs.mood = clamp(person.needs.mood+8);
    person.skills.social = (person.skills.social||0)+1;
    if (rel.meetings === 1) this.log(`${person.name} met ${target.name}.`,'important');
    if (rel.affection >= 30 && rel.meetings === 3) this.notify(`${person.name.split(' ')[0]} and ${target.name.split(' ')[0]} are becoming friends.`,'important',`friend-${person.id}-${target.id}`);
  }

  chooseNannyGoal(nanny) {
    const urgent = this.chooseUrgentCareGoal(nanny, true);
    if (urgent) return urgent;
    const duty = this.chooseHouseholdDutyGoal(nanny);
    if (duty) return duty;
    const hour = this.state.time.minute / 60;
    const onDuty = nanny.liveIn || (isWeekday(this.state.time.totalDays) && hour >= 6.5 && hour < 19);
    if (!onDuty) return goal('relaxing', 'home', 80, 10);
    const youngest = getYoungestChild(this.state);
    if (youngest && ['baby', 'toddler'].includes(youngest.stage)) {
      if (hour >= 9 && hour < 11.5) return goal('playing', 'home', 45, 45, { targetId: youngest.id });
      if (hour >= 14 && hour < 16 && youngest.stage === 'toddler') return goal('park', 'park', 70, 42, { targetId: youngest.id });
    }
    if (this.state.household.home.cleanliness < 58) return goal('cleaning', 'home', 55, 32);
    return goal('childcare', 'home', 45, 25, { targetId: youngest?.id || null });
  }

  chooseUrgentCareGoal(caregiver, forceProvider = false) {
    if (!this.isCaregiverAvailable(caregiver)) return null;
    const assigned = this.state.family.childcare?.caregiverId;
    if (!forceProvider && assigned && assigned !== caregiver.id) {
      const provider = getPersonById(this.state, assigned);
      const hour = this.state.time.minute / 60;
      if (provider?.alive !== false && provider?.location === 'home' && hour < 20) return null;
    }
    const candidates = [];
    for (const dependent of getDependents(this.state)) {
      if (!isYoungDependent(dependent)) continue;
      const hunger = Math.max(0, 48 - dependent.needs.satiety) * 2.7;
      const hygiene = Math.max(0, 44 - dependent.needs.hygiene) * 2.5;
      const comfort = Math.max(0, 42 - dependent.needs.comfort) * 2.3 + (dependent.crying ? 75 : 0);
      if (hunger > 12) candidates.push(goal('feeding', dependent.location, 30, hunger, { targetId: dependent.id }));
      if (hygiene > 12) candidates.push(goal('changing', dependent.location, 26, hygiene, { targetId: dependent.id }));
      if (comfort > 15) candidates.push(goal('comforting', dependent.location, 28, comfort, { targetId: dependent.id }));
    }
    candidates.sort((a, b) => b.priority - a.priority);
    const best = candidates[0];
    if (best && this.canClaimCare(caregiver, best.targetId)) {
      this.claimCare(caregiver, best.targetId);
      return best;
    }
    return null;
  }

  chooseParentGoal(parent) {
    const urgent = this.chooseUrgentParentGoal(parent);
    if (urgent) return urgent;
    const duty = this.chooseHouseholdDutyGoal(parent);
    if (duty) return duty;
    const scheduled = this.resolveParentSchedule(parent);
    const purchaseGoal = this.choosePurchaseGoal(parent, scheduled);
    if (purchaseGoal) return purchaseGoal;
    return scheduled;
  }

  chooseUrgentParentGoal(parent) {
    if (parent.needs.energy < 8) return goal('sleeping', 'home', 180, 100);
    const careGoal = this.chooseUrgentCareGoal(parent, this.state.family.childcare?.caregiverId === parent.id);
    if (careGoal) return careGoal;
    if (parent.needs.energy < 12) return goal('sleeping', 'home', 240, 96);
    if (parent.needs.satiety < 18) return goal('eating', 'home', 35, 95);
    if (this.state.household.food <= 2 && this.state.household.money >= 55) return goal('shopping', 'grocery', 50, 92);

    if (parent.needs.stress > 88) return goal('relaxing', 'home', 70, 90);
    if (this.state.household.home.condition < 25 && this.state.household.money >= 100) return goal('repairing', 'home', 90, 82);
    return null;
  }

  resolveParentSchedule(parent) {
    const minute = this.state.time.minute;
    const hour = minute / 60;
    const dayIndex = getDayIndex(this.state.time.totalDays);
    if (parent.careerStatus === 'stayHome' || parent.job?.id === 'caregiver') {
      const youngest = getYoungestChild(this.state);
      if (youngest && ['baby', 'toddler'].includes(youngest.stage) && hour >= 9 && hour < 11) return goal('playing', 'home', 45, 55, { targetId: youngest.id });
      if (hour >= 14 && hour < 16 && youngest?.stage === 'toddler') return goal('park', 'park', 70, 45, { targetId: youngest.id });
    }
    const shift = this.resolveShift(parent);
    const weekend = dayIndex >= 5;

    if (shift?.active) {
      return goal(shift.remote ? 'remoteWork' : 'working', shift.destination, Math.max(15, shift.endStamp - this.gameStamp), 80, { shift });
    }

    if (shift?.upcoming && shift.startStamp - this.gameStamp <= 75) {
      if (parent.needs.satiety < 65 && parent.location === 'home') return goal('breakfast', 'home', 25, 65);
      return goal('commuting', shift.destination, 10, 72, { shift, beginWorkOnArrival: true });
    }

    if (hour >= 23 || hour < 6.2) return goal('sleeping', 'home', this.minutesUntil(hour < 6.2 ? 6.3 : 30.3), 60);
    if (hour >= 6.2 && hour < 8 && parent.needs.satiety < 72 && this.state.household.home.meal.phase === 'idle') return goal('breakfast', 'home', 30, 50);
    if (hour >= 12 && hour < 13.5 && parent.needs.satiety < 65) return goal('lunch', parent.location, 30, 44);
    if (hour >= 18 && hour < 20 && parent.needs.satiety < 76 && this.state.household.home.meal.phase === 'idle') return goal('dinner', 'home', 45, 48);

    if (weekend) {
      if (hour >= 9 && hour < 12) {
        if (this.state.household.food < 8 && this.state.household.money >= 55) return goal('shopping', 'grocery', 55, 58);
        if (this.state.household.home.cleanliness < 65) return goal('cleaning', 'home', 85, 47);
        return this.hobbyGoal(parent, 75, 45);
      }
      if (hour >= 13 && hour < 17) {
        if (parent.traits.sociability > 58) return goal('visiting', 'community', 100, 46);
        return this.hobbyGoal(parent, 90, 43);
      }
      if (hour >= 19 && hour < 22.5) return parent.traits.familyFocus > 48 ? goal('familyTime', 'home', 90, 45) : this.hobbyGoal(parent, 80, 40);
    } else {
      if (hour >= 17 && hour < 18.5 && this.state.household.food < 7) return goal('shopping', 'grocery', 55, 52);
      if (hour >= 19.5 && hour < 22.5) {
        if (parent.traits.familyFocus > 62 && this.rng.chance(0.58)) return goal('conversation', 'home', 45, 44);
        return this.hobbyGoal(parent, 70, 38);
      }
    }

    if (this.state.household.home.cleanliness < 45 && parent.traits.responsibility > 45) return goal('cleaning', 'home', 60, 34);
    return goal('relaxing', 'home', 55, 20);
  }

  hobbyGoal(parent, duration, priority) {
    const hobby = hobbyById(this.rng.pick(parent.hobbies));
    return goal('hobby', hobby.location, duration, priority, { hobbyId: hobby.id });
  }

  resolveShift(parent) {
    const job = parent.job;
    if (!job || job.id === 'caregiver') return null;
    const day = Math.floor(this.state.time.totalDays);
    const dayIndex = day % 7;
    const stamp = this.gameStamp;
    let startHour = 9;
    let endHour = 17;
    let worksToday = dayIndex < 5;
    if (job.schedule === 'schoolday') { startHour = 7.5; endHour = 16; worksToday = dayIndex < 5; }
    if (job.schedule === 'retail') { startHour = 10; endHour = 18; worksToday = dayIndex >= 1 && dayIndex <= 5; }
    if (job.schedule === 'shift') { startHour = parent.id.charCodeAt(parent.id.length - 1) % 2 ? 7 : 14; endHour = startHour + 8; worksToday = [0, 2, 4, 5].includes(dayIndex); }
    if (job.schedule === 'parttime') { startHour = 10; endHour = 14; worksToday = [1, 3, 5].includes(dayIndex); }
    if (job.schedule === 'remote') { startHour = 9; endHour = 17; worksToday = dayIndex < 5; }
    if (job.schedule === 'night') {
      const todayWorks = dayIndex < 5;
      const previousDayWorks = ((day - 1 + 7) % 7) < 5;
      if (this.state.time.minute >= 22 * 60 && todayWorks) {
        const startStamp = day * 1440 + 22 * 60;
        return { active: stamp >= startStamp, upcoming: stamp < startStamp, startStamp, endStamp: startStamp + 8 * 60, destination: job.workplace, remote: false, key: `${parent.id}-${day}-night` };
      }
      if (this.state.time.minute < 6 * 60 && previousDayWorks) {
        const startStamp = (day - 1) * 1440 + 22 * 60;
        return { active: true, upcoming: false, startStamp, endStamp: startStamp + 8 * 60, destination: job.workplace, remote: false, key: `${parent.id}-${day - 1}-night` };
      }
      return null;
    }
    if (!worksToday) return null;
    const startStamp = day * 1440 + startHour * 60;
    const endStamp = day * 1440 + endHour * 60;
    return {
      active: stamp >= startStamp && stamp < endStamp,
      upcoming: stamp < startStamp,
      startStamp,
      endStamp,
      destination: job.workplace,
      remote: job.schedule === 'remote',
      key: `${parent.id}-${day}-${job.id}`
    };
  }

  choosePurchaseGoal(parent, scheduledGoal) {
    const home = this.state.household.home;
    if (!home.wishlist.length || home.deliveries.length || home.construction) return null;
    if (scheduledGoal?.type === 'working' || scheduledGoal?.type === 'remoteWork' || scheduledGoal?.type === 'commuting') return null;
    const item = home.wishlist[0];
    const reserve = 180 + this.state.household.tier * 80;
    if (this.state.household.money < item.cost + reserve) return null;
    const hour = this.state.time.minute / 60;
    if (hour < 9 || hour > 18) return null;
    const priority = item.priority + parent.traits.responsibility * 0.2 + (100 - parent.traits.frugality) * (item.priority < 50 ? 0.12 : 0);
    if (priority < scheduledGoal.priority + 8 && item.priority < 90) return null;
    return goal('furnitureShopping', 'furniture', 55, priority, { purchaseId: item.id });
  }

  chooseYoungPersonGoal(person, isPlayer) {
    const hour = this.state.time.minute / 60;
    const weekday = isWeekday(this.state.time.totalDays);
    if (person.needs.energy < 18 || hour >= 22 || hour < 6) return goal('sleeping', 'home', this.minutesUntil(hour < 6 ? 7 : 31), 90);
    if (person.needs.satiety < 30) return goal('eating', 'home', 25, 88);
    if (person.stage === 'baby') return goal('waiting', 'home', 40, 10);
    if (person.stage === 'toddler') {
      if (hour >= 10 && hour < 12 && isWeekend(this.state.time.totalDays)) return goal('park', 'park', 70, 45);
      return goal('exploring', 'home', 55, 28);
    }
    if (['child', 'teen'].includes(person.stage) && weekday) {
      if (hour >= 7.2 && hour < 15) return goal('school', 'school', Math.max(30, 15 * 60 - this.state.time.minute), 75);
      if (hour >= 15.5 && hour < 17) return goal('homework', 'home', 55, 46);
    }
    if (person.stage === 'teen' && hour >= 17 && hour < 20 && person.traitSeeds?.workEthic > 60 && [1, 3, 5].includes(getDayIndex(this.state.time.totalDays))) {
      return goal('partTimeWork', 'grocery', 90, 44);
    }
    if (isWeekend(this.state.time.totalDays) && hour >= 10 && hour < 15) return goal('park', person.traitSeeds?.sociability > 55 ? 'community' : 'park', 90, 40);
    if (person.location === 'home' && hour >= 18 && hour < 21.5 && person.traitSeeds?.familyFocus > 60 && this.rng.chance(.32)) return goal('conversation','home',40,34);
    const interests = person.hobbies?.length ? person.hobbies : ['reading'];
    const hobbyId = this.rng.pick(interests);
    const hobby = hobbyById(hobbyId);
    return goal('hobby', hobby.location || 'home', 65, 25, { hobbyId });
  }

  choosePlayerGoal() {
    const player = this.state.player;
    if (player.guidedGoal) {
      const guided = { ...player.guidedGoal, priority: 120 };
      player.guidedGoal = null;
      return guided;
    }
    if (player.stage === 'adult') {
      if (!player.career.job) player.career.job = { ...this.rng.pick(JOBS.filter(job => ['office', 'retail', 'remote', 'driver'].includes(job.id))) };
      const hour = this.state.time.minute / 60;
      if (player.needs.energy < 18 || hour >= 23 || hour < 6) return goal('sleeping', 'home', this.minutesUntil(hour < 6 ? 7 : 31), 90);
      if (player.needs.satiety < 30) return goal('eating', 'home', 25, 88);
      if (isWeekday(this.state.time.totalDays) && hour >= 8 && hour < 17) return goal('working', 'workplace', Math.max(30, 17 * 60 - this.state.time.minute), 70, { playerShift: true, shiftKey: `${player.id}-${Math.floor(this.state.time.totalDays)}-adult` });
      const hobbyId = this.rng.pick(player.hobbies?.length ? player.hobbies : ['reading']);
      const hobby = hobbyById(hobbyId);
      return goal('hobby', hobby.location || 'home', 70, 28, { hobbyId });
    }
    if (player.stage === 'elder') {
      const hour = this.state.time.minute / 60;
      if (hour >= 9 && hour < 12) return goal('park', 'park', 90, 35);
      return goal('retirement', 'home', 90, 20);
    }
    return this.chooseYoungPersonGoal(player, true);
  }

  minutesUntil(targetHour) {
    const currentHour = this.state.time.minute / 60;
    let hours = targetHour - currentHour;
    if (hours < 0) hours += 24;
    return Math.max(15, hours * 60);
  }

  assignGoal(person, nextGoal) {
    if (!nextGoal) nextGoal = goal('waiting', person.location, 20, 0);
    person.currentGoal = nextGoal;
    person.moving = false;
    if (person.location !== nextGoal.destination) {
      person.route = {
        destination: nextGoal.destination,
        phase: person.location === 'town' ? 'acrossTown' : 'toExit',
        target: person.location === 'town' ? getTownDoorPoint(this.state, nextGoal.destination) : getSceneExitPoint(person.location)
      };
      person.activity = activity('commuting', 0, { goalType: nextGoal.type });
      this.maybeCarryBaby(person, nextGoal);
      return;
    }
    if (nextGoal.beginWorkOnArrival && nextGoal.shift && person.location === nextGoal.destination) {
      nextGoal.type = nextGoal.shift.remote ? 'remoteWork' : 'working';
      nextGoal.duration = Math.max(10, nextGoal.shift.endStamp - this.gameStamp);
    }
    if (person.stage === 'baby' && !['Parent','Nanny'].includes(person.role)) {
      this.startGoalActivity(person, nextGoal);
      return;
    }
    const target = getActivityPoint(this.state, person, nextGoal.type, nextGoal);
    if (target && Math.hypot(person.x - target.x, person.y - target.y) > ROUTE_EPSILON + 4) {
      const points = getIndoorWaypoints(this.state, person, target);
      person.route = { destination: person.location, phase: 'inside', target: points.shift(), waypoints: points, goal: nextGoal };
      person.activity = activity('walkingInside', 0, { goalType: nextGoal.type });
      return;
    }
    this.startGoalActivity(person, nextGoal);
  }

  maybeCarryBaby(person, nextGoal) {
    if (![...this.state.parents, this.state.nanny].filter(Boolean).some(caregiver => caregiver.id === person.id)) return;
    const player = this.state.player;
    if (player.stage !== 'baby' || player.location !== person.location || player.carriedBy) return;
    if (['working','remoteWork','commuting','school','partTimeWork'].includes(nextGoal.type) || nextGoal.beginWorkOnArrival || nextGoal.shift) return;
    if (this.getActiveCaregiver()?.id !== person.id) return;
    const bringScore = person.traits.warmth + person.traits.responsibility - person.needs.stress;
    if (bringScore > 75 || nextGoal.type === 'shopping' || nextGoal.type === 'park' || nextGoal.type === 'visiting') {
      player.carriedBy = person.id;
      player.currentGoal = goal('carried', nextGoal.destination, nextGoal.duration, 100);
    }
  }

  startGoalActivity(person, currentGoal) {
    person.route = null;
    person.moving = false;
    person.activity = activity(currentGoal.type, currentGoal.duration, {
      startedStamp: this.gameStamp,
      endStamp: currentGoal.shift?.endStamp || null,
      shift: currentGoal.shift || null,
      targetId: currentGoal.targetId || null,
      purchaseId: currentGoal.purchaseId || null,
      hobbyId: currentGoal.hobbyId || null,
      playerShift: currentGoal.playerShift || false,
      shiftKey: currentGoal.shiftKey || null,
      mealType: currentGoal.mealType || null,
      recipe: currentGoal.recipe || null,
      roomId: currentGoal.roomId || null
    });
    if (currentGoal.type === 'school' && person.id === this.state.player.id) this.state.player.school.attendedDay = Math.floor(this.state.time.totalDays);
  }

  finishExpiredActivity(person) {
    if (person.activity?.endStamp && this.gameStamp >= person.activity.endStamp) {
      this.completeActivity(person);
      return true;
    }
    if (person.activity && !person.activity.endStamp && person.activity.remaining <= 0 && person.activity.type !== 'waiting') {
      this.completeActivity(person);
      return true;
    }
    return false;
  }

  activityActive(person) {
    if (!person.activity) return false;
    if (person.activity.endStamp) return this.gameStamp < person.activity.endStamp;
    return person.activity.remaining > 0;
  }

  advanceActivity(person, gameMinutes) {
    if (person.activity.endStamp) {
      if (this.gameStamp >= person.activity.endStamp) this.completeActivity(person);
      return;
    }
    person.activity.remaining -= gameMinutes;
    if (person.activity.remaining <= 0) this.completeActivity(person);
  }

  completeActivity(person) {
    const type = person.activity.type;
    const isParent = this.state.parents.some(parent => parent.id === person.id);
    const isPlayer = person.id === this.state.player.id;
    const target = person.activity.targetId ? getPersonById(this.state, person.activity.targetId) : null;

    switch (type) {
      case 'cooking':
        this.completeCooking(person, person.activity.mealType, person.activity.recipe);
        break;
      case 'familyMeal':
        this.completeFamilyMeal(person);
        break;
      case 'washDishes':
        this.completeDishwashing(person);
        break;
      case 'laundry':
        this.completeLaundry(person);
        break;
      case 'takeTrash':
        this.state.household.home.chores.trash = 0; person.needs.energy=clamp(person.needs.energy-4); this.addSpeech(person,'Trash is taken out.');
        break;
      case 'cleanBathroom':
        this.state.household.home.chores.bathroomMess = Math.max(0,this.state.household.home.chores.bathroomMess-65); person.needs.energy=clamp(person.needs.energy-7);
        break;
      case 'conversation':
        this.performSocialInteraction(person, person.activity.targetId ? getPersonById(this.state,person.activity.targetId) : null);
        break;
      case 'sleeping':
        person.needs.energy = clamp(person.needs.energy + 58);
        person.needs.stress = clamp(person.needs.stress - 14);
        break;
      case 'breakfast':
      case 'lunch':
      case 'dinner':
      case 'eating':
        this.consumeMeal(person, type);
        break;
      case 'feeding':
        if (target && this.state.household.food > 0) {
          this.state.household.food -= 1;
          target.needs.satiety = Math.max(target.needs.satiety, 84);
          target.needs.comfort = clamp(target.needs.comfort + 8);
          target.crying = false;
          if (isParent) person.lastCareStamp = this.gameStamp;
        }
        this.releaseCareLock(person.id);
        break;
      case 'changing':
        if (target) {
          target.needs.hygiene = Math.max(target.needs.hygiene, 88);
          target.needs.comfort = clamp(target.needs.comfort + 12);
        }
        this.releaseCareLock(person.id);
        break;
      case 'comforting':
        if (target) {
          target.needs.comfort = Math.max(target.needs.comfort, 80);
          target.needs.mood = clamp(target.needs.mood + 18);
          target.crying = false;
        }
        this.releaseCareLock(person.id);
        break;
      case 'playing':
      case 'childcare':
        if (target) {
          target.needs.mood = clamp(target.needs.mood + 16);
          target.needs.comfort = clamp(target.needs.comfort + 12);
          target.development && (target.development.stimulation = clamp(target.development.stimulation + 2));
        }
        person.needs.mood = clamp(person.needs.mood + 7);
        this.releaseCareLock(person.id);
        break;
      case 'working':
      case 'remoteWork':
        if (isParent) this.completeParentShift(person, person.activity.shift);
        if (isPlayer) this.completePlayerShift(person, person.activity.shiftKey);
        break;
      case 'partTimeWork':
        if (isPlayer) {
          const key = `${person.id}-${Math.floor(this.state.time.totalDays)}-parttime`;
          this.completePlayerShift(person, key, this.rng.int(160, 260));
        }
        break;
      case 'shopping':
        this.buyGroceries(person);
        break;
      case 'furnitureShopping':
        this.purchaseFurniture(person.activity.purchaseId, person);
        break;
      case 'cleaning':
        this.state.household.home.chores.floorMess = Math.max(0,(this.state.household.home.chores.floorMess||0)-55);
        this.state.household.home.cleanliness = clamp(this.state.household.home.cleanliness + 28);
        person.needs.energy = clamp(person.needs.energy - 8);
        break;
      case 'repairing': {
        const cost = Math.min(180, Math.max(60, 100 - this.state.household.home.condition));
        if (this.state.household.money >= cost) {
          this.recordExpense(cost, 'Home repairs');
          this.state.household.home.condition = clamp(this.state.household.home.condition + 32);
          this.notify('A caregiver completed needed house repairs.', 'important', 'home-repair');
        }
        break;
      }
      case 'hobby':
        this.completeHobby(person, person.activity.hobbyId);
        break;
      case 'familyTime':
        person.needs.mood = clamp(person.needs.mood + 16);
        person.needs.stress = clamp(person.needs.stress - 12);
        this.state.player.needs.mood = clamp(this.state.player.needs.mood + 12);
        this.state.player.development.bonding = clamp(this.state.player.development.bonding + 2);
        this.performSocialInteraction(person);
        break;
      case 'visiting':
      case 'community':
      case 'park':
        person.needs.mood = clamp(person.needs.mood + 14);
        person.needs.stress = clamp(person.needs.stress - 8);
        this.performSocialInteraction(person);
        break;
      case 'school':
        if (person.school) {
          person.school.attendedDay = Math.floor(this.state.time.totalDays);
          person.school.grades = clamp((person.school.grades || 50) + 1.2);
        }
        if (isPlayer) {
          this.state.player.development.grades = clamp(this.state.player.development.grades + 1.2);
          this.state.player.school.grades = this.state.player.development.grades;
        }
        break;
      case 'homework':
      case 'study':
        if (isPlayer) this.state.player.development.grades = clamp(this.state.player.development.grades + 2.5);
        person.needs.energy = clamp(person.needs.energy - 5);
        break;
      case 'exploring':
        if (isPlayer) {
          person.development.curiosity = clamp(person.development.curiosity + 1.5);
          person.development.stimulation = clamp(person.development.stimulation + 1);
        }
        person.needs.mood = clamp(person.needs.mood + 5);
        break;
      case 'retirement':
      case 'relaxing':
        person.needs.energy = clamp(person.needs.energy + 8);
        person.needs.stress = clamp(person.needs.stress - 18);
        person.needs.mood = clamp(person.needs.mood + 9);
        break;
      default:
        break;
    }

    if (person.carriedBy && person.id === this.state.player.id) person.carriedBy = null;
    person.activity = activity('waiting', 0);
    person.currentGoal = null;
    if (person.id === this.state.player.id && person.controlMode === 'guided') person.controlMode = 'auto';
  }

  updateRoute(person, realDt) {
    const route = person.route;
    const speed = GAME_MINUTES_PER_REAL_SECOND * this.speed * 10;
    person.moving = true;
    const arrived = moveToward(person, route.target, realDt * speed);
    if (person.id === this.state.player.id) this.state.scene = person.location;
    if (person.carriedBy === undefined && this.state.player.carriedBy === person.id) {
      this.state.player.location = person.location;
      this.state.player.x = person.x + 12;
      this.state.player.y = person.y + 4;
      this.state.scene = person.location;
    }
    if (!arrived) return;

    if (route.phase === 'inside') {
      if (route.waypoints?.length) {
        route.target = route.waypoints.shift();
        return;
      }
      person.route = null;
      this.startGoalActivity(person, route.goal || person.currentGoal || goal('waiting', person.location, 20, 0));
      return;
    }

    if (route.phase === 'toExit') {
      const oldLocation = person.location;
      person.location = 'town';
      person.x = getTownDoorPoint(this.state, oldLocation).x;
      person.y = getTownDoorPoint(this.state, oldLocation).y;
      route.phase = 'acrossTown';
      route.target = getTownDoorPoint(this.state, route.destination);
      if (person.id === this.state.player.id) this.changePlayerScene('town');
      if (this.state.player.carriedBy === person.id) this.changeCarriedPlayerScene(person);
      return;
    }

    if (route.phase === 'acrossTown') {
      person.location = route.destination;
      const entry = getSceneEntryPoint(route.destination);
      person.x = entry.x;
      person.y = entry.y;
      person.route = null;
      if (person.id === this.state.player.id) this.changePlayerScene(route.destination);
      if (this.state.player.carriedBy === person.id) this.changeCarriedPlayerScene(person);
      const currentGoal = person.currentGoal || goal('waiting', person.location, 20, 0);
      if (currentGoal.beginWorkOnArrival && currentGoal.shift) {
        currentGoal.type = currentGoal.shift.remote ? 'remoteWork' : 'working';
        currentGoal.duration = Math.max(10, currentGoal.shift.endStamp - this.gameStamp);
      }
      const activityPoint = getActivityPoint(this.state, person, currentGoal.type, currentGoal);
      if (activityPoint && Math.hypot(person.x - activityPoint.x, person.y - activityPoint.y) > ROUTE_EPSILON + 4) {
        const points = getIndoorWaypoints(this.state, person, activityPoint);
        person.route = { destination: person.location, phase: 'inside', target: points.shift(), waypoints: points, goal: currentGoal };
      } else this.startGoalActivity(person, currentGoal);
    }
  }

  changePlayerScene(scene) {
    this.state.scene = scene;
    this.onSceneChanged(scene);
  }

  changeCarriedPlayerScene(parent) {
    const player = this.state.player;
    player.location = parent.location;
    player.x = parent.x + 12;
    player.y = parent.y + 4;
    this.changePlayerScene(parent.location);
  }

  consumeMeal(person, type) {
    if (this.state.household.food > 0 && person.location === 'home') {
      this.state.household.food -= 1;
      person.needs.satiety = clamp(person.needs.satiety + (type === 'dinner' ? 58 : 48));
      person.needs.mood = clamp(person.needs.mood + 4);
    } else if (person.location !== 'home') {
      const cost = 28;
      if (this.state.household.money >= cost) {
        this.recordExpense(cost, 'Meal away from home');
        person.needs.satiety = clamp(person.needs.satiety + 48);
      }
    }
  }

  completeCooking(person, mealType, recipe) {
    const home = this.state.household.home;
    const meal = home.meal;
    const familyCount = getAllFamily(this.state).filter(member => member.alive !== false && member.stage !== 'baby').length;
    const portionsNeeded = Math.max(2, Math.ceil(familyCount * .7));
    if (this.state.household.food < portionsNeeded) {
      meal.phase = 'idle';
      this.notify('There was not enough food to cook the planned family meal.','important','meal-no-food');
      return;
    }
    this.state.household.food -= portionsNeeded;
    const pantry = home.kitchen.ingredients || {};
    for (const [ingredient, amount] of Object.entries(meal.ingredientUse || {})) pantry[ingredient] = Math.max(0, (pantry[ingredient] || 0) - amount);
    meal.phase='ready'; meal.type=mealType||meal.type; meal.recipe=recipe||meal.recipe||'Home-cooked meal'; meal.readyStamp=this.gameStamp; meal.servedUntilStamp=this.gameStamp+95; meal.clearedStamp=-1;
    meal.attendees=getAllFamily(this.state).filter(member=>member.location==='home'&&member.alive!==false&&member.stage!=='baby').map(member=>member.id);
    meal.eatenIds=[];
    home.kitchen.preparedMeal={name:meal.recipe,servings:Math.max(2,meal.attendees.length),cookedBy:person.id,stamp:this.gameStamp};
    home.kitchen.lastCookedDay=Math.floor(this.state.time.totalDays);
    person.skills.cooking=(person.skills.cooking||0)+1;
    person.needs.mood=clamp(person.needs.mood+8);
    this.addSpeech(person, `${meal.recipe} is ready!`);
    this.log(`${person.name} cooked ${meal.recipe.toLowerCase()} for the household.`,'important');
  }

  completeFamilyMeal(person) {
    const home=this.state.household.home; const meal=home.meal;
    meal.phase='eating'; meal.eatenIds ||= [];
    if (!meal.eatenIds.includes(person.id)) {
      meal.eatenIds.push(person.id);
      person.needs.satiety=clamp(person.needs.satiety+58);
      person.needs.mood=clamp(person.needs.mood+9);
      person.needs.stress=clamp(person.needs.stress-5);
      home.chores.dirtyDishes=clamp((home.chores.dirtyDishes||0)+1,0,30);
      if (person.id===this.state.player.id) this.state.player.development.bonding=clamp(this.state.player.development.bonding+1.5);
      if (this.rng.chance(.55)) this.performSocialInteraction(person);
    }
    if (meal.eatenIds.length >= Math.max(1,meal.attendees.length)) { meal.phase='cleared'; meal.clearedStamp=this.gameStamp; home.kitchen.preparedMeal=null; }
  }

  completeDishwashing(person) {
    const home=this.state.household.home;
    const machine=hasFurniture(this.state,'dishwasher');
    home.chores.dirtyDishes=Math.max(0,(home.chores.dirtyDishes||0)-(machine?12:7));
    person.needs.energy=clamp(person.needs.energy-(machine?3:7));
    person.needs.mood=clamp(person.needs.mood+2);
    this.addSpeech(person, machine?'Dishwasher is running.':'Dishes are done.');
    // Dirty dishes no longer keep an old meal permanently active.
  }

  completeLaundry(person) {
    const home=this.state.household.home; const machine=hasFurniture(this.state,'washingMachine');
    home.chores.laundryLoads=Math.max(0,(home.chores.laundryLoads||0)-(machine?2:1));
    home.chores.lastLaundryDay=Math.floor(this.state.time.totalDays);
    person.needs.energy=clamp(person.needs.energy-(machine?5:12));
    this.addSpeech(person, machine?'Laundry is washing.':'Laundry is finally done.');
  }

  completeParentShift(parent, shift) {
    if (!shift?.key || parent.completedShiftKeys.includes(shift.key)) return;
    parent.completedShiftKeys.push(shift.key);
    parent.completedShiftKeys = parent.completedShiftKeys.slice(-30);
    const [minimum, maximum] = parent.job.pay;
    const pay = this.rng.int(minimum, maximum) + (parent.payBonus || 0);
    if (pay > 0) {
      this.recordIncome(pay, `${parent.name}'s work shift`);
      this.notify(`${parent.name.split(' ')[0]} completed a shift.`, 'routine', `shift-${parent.id}`);
      this.addFastSummary('workShifts', 1);
      this.addFastSummary('income', pay);
    }
    parent.needs.energy = clamp(parent.needs.energy - 18);
    parent.needs.stress = clamp(parent.needs.stress + 7);
  }

  completePlayerShift(player, key, fixedPay = null) {
    if (!key) key = `${player.id}-${Math.floor(this.state.time.totalDays)}-shift`;
    player.career.completedShiftKeys ||= [];
    if (player.career.completedShiftKeys.includes(key)) return;
    player.career.completedShiftKeys.push(key);
    const pay = fixedPay ?? this.rng.int(380, 620);
    this.recordIncome(pay, `${player.name}'s work shift`);
    this.notify(`You completed a shift and earned ${peso(pay)}.`, 'important', `player-pay-${key}`);
  }

  buyGroceries(person) {
    const household = this.state.household;
    const targetPortions = 10 + this.state.parents.length * 3 + this.state.siblings.length * 2;
    const needed = Math.max(4, targetPortions - household.food);
    const cost = Math.min(household.money, 30 + needed * 10);
    if (cost < 30) return;
    this.recordExpense(cost, 'Groceries');
    household.food += Math.max(4, Math.floor(cost / 10));
    const ingredients=household.home.kitchen.ingredients;
    ingredients.rice+=this.rng.int(2,5); ingredients.vegetables+=this.rng.int(2,5); ingredients.protein+=this.rng.int(1,3); ingredients.bread+=this.rng.int(1,4); ingredients.fruit+=this.rng.int(1,3);
    this.notify(`${person.name.split(' ')[0]} stocked the kitchen.`, 'routine', 'groceries');
    this.addFastSummary('groceryTrips', 1);
  }

  completeHobby(person, hobbyId) {
    const hobby = hobbyById(hobbyId);
    const home=this.state.household.home;
    person.hobbyPractice ||= {};
    person.hobbyPractice[hobby.id] = (person.hobbyPractice[hobby.id] || 0) + 1;
    if (hobby.equipment && !hasFurniture(this.state,hobby.equipment) && !['stove','bookshelf','television'].includes(hobby.equipment)) {
      // Before a family buys equipment, characters can use school/community/public options.
      person.needs.mood=clamp(person.needs.mood+6);
      person.skills ||= {}; person.skills[hobby.id]=(person.skills[hobby.id]||0)+.35;
      if (person.hobbyPractice[hobby.id] < 5) {
        this.notify(`${person.name.split(' ')[0]} practiced ${hobby.label.toLowerCase()} using borrowed or public equipment.`,'routine',`public-${person.id}-${hobby.id}`);
        return;
      }
    }
    if (hobby.cost && this.state.household.money >= hobby.cost) this.recordExpense(hobby.cost, hobby.label);
    person.needs.mood = clamp(person.needs.mood + hobby.mood);
    person.needs.energy = clamp(person.needs.energy + hobby.energy);
    person.needs.stress = clamp(person.needs.stress - Math.max(4, hobby.mood * 0.5));
    person.skills ||= {}; person.skills[hobby.id]=(person.skills[hobby.id]||0)+1;
    if (hobby.id==='exercise') person.needs.health=clamp(person.needs.health+2.5);
    if (hobby.id==='painting') {
      person.hobbyProgress ||= {}; person.hobbyProgress.painting=(person.hobbyProgress.painting||0)+this.rng.int(24,42);
      if (person.hobbyProgress.painting>=100) {
        person.hobbyProgress.painting-=100;
        const quality=clamp((person.skills.painting||1)*4+(person.traits?.creativity||person.traitSeeds?.creativity||50)*.55+this.rng.int(-8,12),10,100);
        const artwork={id:`art-${Math.floor(this.gameStamp)}-${person.id}`,title:this.rng.pick(['Morning Garden','Quiet Street','Family Table','Willow Park','Blue Afternoon','Home Light']),creatorId:person.id,creator:person.name,quality,value:Math.round(80+quality*12),createdDay:Math.floor(this.state.time.totalDays),sold:false};
        home.hobbies.artworks.push(artwork);
        this.notify(`${person.name.split(' ')[0]} finished “${artwork.title}” — worth about ${peso(artwork.value)}.`,'important',artwork.id);
        const shouldSell=this.state.household.money<700 || (person.traits?.frugality||person.traitSeeds?.frugality||50)>65;
        if (shouldSell) { artwork.sold=true; this.recordIncome(artwork.value,`Sold painting: ${artwork.title}`); this.log(`${person.name} sold “${artwork.title}” for ${peso(artwork.value)}.`,'important'); }
      }
    }
    this.addFastSummary('hobbies', 1);
  }

  evaluateScheduledChanges() {
    const hour = this.state.time.minute / 60;
    if (hour >= 15 && hour < 16 && ['child', 'teen'].includes(this.state.player.stage) && isWeekday(this.state.time.totalDays)) {
      if (this.state.player.school.attendedDay !== Math.floor(this.state.time.totalDays) && this.state.player.controlMode === 'paused') {
        this.state.player.school.truancy += 1;
        this.notify('You missed school while your schedule was stopped.', 'important', `truancy-${Math.floor(this.state.time.totalDays)}`);
      }
    }
  }

  evaluateChildcareArrangement() {
    const state = this.state;
    const youngest = getYoungestChild(state);
    if (!youngest) return;
    const noLongerNeedsFullTimeCare = youngest.stage === 'teen' || youngest.stage === 'adult' || youngest.stage === 'elder';
    if (noLongerNeedsFullTimeCare) {
      if (state.family.childcare?.type === 'nanny' && state.nanny) {
        const nannyName = state.nanny.name;
        state.nanny = null;
        state.family.childcare = { type: 'independent', label: 'No full-time caregiver needed', caregiverId: null, reliable: true, reason: 'The youngest child is old enough to manage ordinary routines.' };
        state.family.history.unshift(`${nannyName} finished working for the family when the youngest child became a teenager.`);
        this.notify(`${nannyName.split(' ')[0]}'s nanny role has ended.`, 'important', 'nanny-ended');
      }
      const parent = state.parents.find(item => item.careerStatus === 'stayHome');
      if (parent) {
        parent.job = parent.originalJob || { ...JOBS.find(job => job.id === 'parttime') };
        parent.careerStatus = 'returning';
        state.family.childcare = { type: 'independent', label: 'Children are independent', caregiverId: null, reliable: true, reason: `${parent.name.split(' ')[0]} can return to paid work.` };
        state.family.history.unshift(`${parent.name} returned to work after the youngest child became a teenager.`);
        this.notify(`${parent.name.split(' ')[0]} is returning to work.`, 'important', `career-return-${parent.id}`);
      }
      return;
    }
    if (state.family.childcare?.type === 'nanny' && !state.nanny) {
      state.family.childcare = { type: 'unstable', label: 'Childcare gap', caregiverId: null, reliable: false, reason: 'The family needs to arrange childcare.' };
    }
  }

  evaluateHomeWishlist(force = false) {
    const home = this.state.household.home;
    const day = Math.floor(this.state.time.totalDays);
    if (!force && home.lastEvaluationDay === day) return;
    home.lastEvaluationDay = day;
    const existing = new Set(home.wishlist.map(item => item.id));
    const add = (id, bonus = 0, reason = '') => {
      if (existing.has(id) || hasFurniture(this.state, id) || home.deliveries.some(delivery => delivery.id === id)) return;
      if (id === 'teenBedroom' && (roomExists(this.state, 'teenBedroom') || home.construction?.id === 'teenBedroom')) return;
      if (id === 'secondFloor' && (home.floors?.some(floor=>floor.id===1&&floor.active) || home.construction?.id === 'secondFloor')) return;
      const item = purchaseById(id);
      if (!item) return;
      home.wishlist.push({ ...item, priority: item.priority + bonus, reason });
      existing.add(id);
    };

    if (!hasFurniture(this.state, 'crib') && [this.state.player, ...this.state.siblings].some(person => person.stage === 'baby')) add('crib', 15, 'A baby needs a safe place to sleep.');
    if (this.state.player.stage === 'toddler') add('toddlerBed', 20, 'The toddler has outgrown the crib.');
    if (['child', 'teen'].includes(this.state.player.stage)) {
      add('childBed', 18, 'The child needs a proper bed.');
      add('studyDesk', 10, 'Schoolwork needs a dedicated place.');
    }
    const householdChildren = [this.state.player, ...this.state.siblings];
    if (householdChildren.some(child => child.stage === 'teen')) {
      const upstairsActive=home.floors?.some(floor=>floor.id===1&&floor.active);
      if (!upstairsActive && this.state.household.tier >= 3 && householdChildren.length >= 3) add('secondFloor',35,'The family needs more bedrooms and a proper hobby room.');
      else add('teenBedroom', 25, 'A teenager in the household needs privacy and space.');
    }
    if (this.state.siblings.some(sibling => ['toddler', 'child', 'teen'].includes(sibling.stage))) add('siblingBed', 15, 'A sibling needs a proper bed.');
    if (!hasFurniture(this.state, 'sofa') && this.state.household.tier >= 2) add('sofa', 0, 'The family wants a comfortable living room.');
    if (!hasFurniture(this.state, 'bookshelf') && ['child', 'teen'].includes(this.state.player.stage)) add('bookshelf', 8, 'Books support school and hobbies.');
    if (!hasFurniture(this.state, 'diningSet') && this.state.household.tier >= 3) add('diningSet', 4, 'The basic table is getting crowded.');
    if (!hasFurniture(this.state, 'rug') && this.state.household.money > 800) add('rug');
    if (!hasFurniture(this.state, 'plant') && this.state.household.money > 1400) add('plant');
    if (!hasFurniture(this.state, 'television') && this.state.household.money > 2200) add('television');
    if (!home.wallPaint && this.state.household.money > 1600 && !existing.has('paint')) add('paint');
    if (!hasFurniture(this.state,'washingMachine') && (home.chores.laundryLoads||0)>=2 && this.state.household.tier>=3) add('washingMachine',12,'Laundry is taking too much time by hand.');
    if (!hasFurniture(this.state,'dishwasher') && (home.chores.dirtyDishes||0)>=8 && this.state.household.tier>=4) add('dishwasher',8,'The family wants help with daily dishes.');
    const hobbyPeople=[...this.state.parents,...this.state.siblings,this.state.player].filter(person=>!person.movedOut);
    for (const person of hobbyPeople) {
      for (const hobbyId of person.hobbies || []) {
        const hobby=hobbyById(hobbyId);
        const sessions=person.hobbyPractice?.[hobbyId] || 0;
        if (!hobby?.equipment || !purchaseById(hobby.equipment) || sessions < 5) continue;
        const roomId=preferredHobbyRoom(this.state,person,hobbyId);
        if (home.furniture.some(item=>item.id===hobby.equipment && item.ownerId===person.id)) continue;
        add(hobby.equipment, Math.min(18,sessions), `${person.name.split(' ')[0]} has practiced ${hobby.label.toLowerCase()} ${sessions} times and wants equipment for ${roomId}.`);
        const wish=home.wishlist.find(item=>item.id===hobby.equipment);
        if (wish) { wish.ownerId=person.id; wish.room=roomId; }
      }
    }
    home.wishlist.sort((a, b) => b.priority - a.priority);
  }

  purchaseFurniture(id, parent) {
    const home = this.state.household.home;
    const item = home.wishlist.find(entry => entry.id === id) || purchaseById(id);
    if (!item || this.state.household.money < item.cost) return;
    this.recordExpense(item.cost, item.label);
    home.wishlist = home.wishlist.filter(entry => entry.id !== id);
    if (id === 'teenBedroom' || id === 'secondFloor') {
      const isSecond=id==='secondFloor';
      home.construction = { id, label: item.label, roomId:isSecond?'upperLanding':'teenBedroom', floor:isSecond?1:0, startedDay: Math.floor(this.state.time.totalDays), startedStamp:this.gameStamp, dueDay: Math.floor(this.state.time.totalDays) + (item.constructionDays || 4), progress: 0, status:'building', paid:item.cost };
      this.notify(`${parent.name.split(' ')[0]} arranged ${isSecond?'a second-floor addition':'a bedroom extension'}. Construction will take several days.`, 'important', `${id}-start`);
      this.log(`The household began building ${item.label}.`, 'important');
      return;
    }
    home.deliveries.push({ id, room: item.room === 'ownerBedroom' ? (item.ownerId ? (getPersonById(this.state,item.ownerId)?.assignedRoomId || 'childBedroom') : 'childBedroom') : item.room, ownerId:item.ownerId || null, label: item.label, dueDay: Math.floor(this.state.time.totalDays) + 1 });
    home.purchaseHistory.push({ id, day: Math.floor(this.state.time.totalDays), cost: item.cost, buyer: parent.id });
    this.notify(`${parent.name.split(' ')[0]} ordered a ${item.label}.`, 'important', `purchase-${id}`);
  }

  updateHomeProjects() {
    const day = Math.floor(this.state.time.totalDays);
    const home = this.state.household.home;
    for (const delivery of [...home.deliveries]) {
      if (day < delivery.dueDay) continue;
      if (delivery.id === 'paint') home.wallPaint = true;
      else {
        if (delivery.id === 'toddlerBed' && !this.state.siblings.some(sibling => sibling.stage === 'baby')) home.furniture = home.furniture.filter(item => item.id !== 'crib');
        if (delivery.id === 'childBed') {
          home.furniture = home.furniture.filter(item => item.id !== 'toddlerBed');
          activateRoom(this.state, 'childBedroom');
        }
        if (delivery.id === 'siblingBed') activateRoom(this.state, 'childBedroom');
        if (delivery.id === 'diningSet') home.furniture = home.furniture.filter(item => item.id !== 'basicTable');
        addFurniture(this.state, delivery.id, delivery.room);
        const deliveredItem=[...home.furniture].reverse().find(entry=>entry.id===delivery.id);
        if (deliveredItem) { deliveredItem.ownerId=delivery.ownerId || null; deliveredItem.floor=home.rooms.find(room=>room.id===delivery.room)?.floor || 0; }
        if (purchaseById(delivery.id)?.hobby && !home.hobbies.equipment.includes(delivery.id)) home.hobbies.equipment.push(delivery.id);
        if (delivery.ownerId) home.hobbyOwnership[delivery.id]=delivery.ownerId;
      }
      home.deliveries.splice(home.deliveries.indexOf(delivery), 1);
      this.notify(`The ${delivery.label} was delivered and placed in the correct room.`, 'important', `delivery-${delivery.id}`);
      this.log(`The household received a ${delivery.label}.`, 'important');
    }
    if (home.construction) {
      const span = Math.max(1, home.construction.dueDay - home.construction.startedDay);
      home.construction.progress = clamp(((this.state.time.totalDays - home.construction.startedDay) / span) * 100);
      if (day >= home.construction.dueDay) {
        const completed={...home.construction,status:'complete',completedDay:day};
        if (home.construction.id==='secondFloor') {
          this.v7.completeSecondFloor();
          this.state.family.history.unshift(`A second floor was completed on day ${day+1}.`);
        } else {
          const plan=home.expansionPlan;
          if(plan?.shrink){const roomToShrink=home.rooms.find(item=>item.id===plan.shrink.roomId);if(roomToShrink)Object.assign(roomToShrink,plan.shrink);}
          activateRoom(this.state, 'teenBedroom');
          const teen=[this.state.player,...this.state.siblings].find(child=>child.stage==='teen'&&!child.movedOut);
          if (teen) {
            addFurniture(this.state,'teenBed','teenBedroom');
            const bed=[...home.furniture].reverse().find(item=>item.id==='teenBed'); if (bed) bed.ownerId=teen.id;
            const desk=home.furniture.find(item=>item.id==='studyDesk');if(desk){desk.room='teenBedroom';desk.floor=0;desk.ownerId=teen.id;}
            teen.assignedRoomId='teenBedroom'; teen.assignedBedId='teenBed';
          }
          this.state.family.history.unshift(`A teen bedroom was completed on day ${day+1}.`);
          this.notify('The new teen bedroom is complete.', 'important', 'teen-room-complete');
        }
        home.constructionHistory ||= []; home.constructionHistory.unshift(completed);
        home.construction = null;
        assignHomeSpaces(this.state);
        this.showEvent({ eyebrow: 'HOME EXPANSION', title: completed.id==='secondFloor'?'A whole new floor':'A room of your own', body: completed.id==='secondFloor'?'Construction is finished. Two bedrooms, a bathroom, and a hobby room are now upstairs.':'Construction is finished. The bedroom has a reachable bed and study area.', choices: [{ label: 'See the finished home' }] });
      }
    }
  }

  processBills() {
    const day = Math.floor(this.state.time.totalDays);
    const finances = this.state.household.finances;
    if (finances.careSupportPerDay > 0 && finances.lastCareSupportDay !== day) {
      this.recordIncome(finances.careSupportPerDay, 'Family caregiver assistance');
      finances.lastCareSupportDay = day;
    }
    if (this.state.nanny && finances.lastNannyPayDay !== day) {
      const salary = this.state.nanny.salaryPerDay || 220;
      if (this.state.household.money >= salary) {
        this.recordExpense(salary, `${this.state.nanny.name}'s childcare salary`);
        finances.lastNannyPayDay = day;
      } else {
        this.state.nanny.needs.stress = clamp(this.state.nanny.needs.stress + 18);
        this.state.family.childcare.reliable = false;
        this.notify('The household is behind on the nanny salary.', 'important', 'nanny-pay-shortfall');
      }
    }
    const state = this.state;
    const week = getWeekIndex(state.time.totalDays);
    const dayIndex = getDayIndex(state.time.totalDays);
    if (dayIndex !== 6 || state.household.finances.lastRentWeek === week) return;
    const rent = EXPENSES.rentByTier[state.household.tier] || 320;
    const utilities = EXPENSES.utilitiesByTier[state.household.tier] || 105;
    const total = rent + utilities;
    state.household.finances.lastRentWeek = week;
    state.household.finances.lastUtilitiesWeek = week;
    this.recordExpense(total, 'Weekly housing and utilities');
    if (state.household.money < 0) {
      state.household.home.condition = clamp(state.household.home.condition - 8);
      this.notify('The household could not fully cover this week’s bills.', 'important', `bills-${week}`);
    } else {
      this.notify(`Weekly bills of ${peso(total)} were paid.`, 'routine', `bills-${week}`);
    }
    state.household.finances.weekIncome = 0;
    state.household.finances.weekExpenses = 0;
  }

  recordIncome(amount, description) {
    const finances = this.state.household.finances;
    this.state.household.money += amount;
    finances.weekIncome += amount;
    finances.lifetimeIncome += amount;
    finances.ledger.unshift({ day: Math.floor(this.state.time.totalDays), amount, type: 'income', description });
    finances.ledger = finances.ledger.slice(0, 40);
  }

  recordExpense(amount, description) {
    const finances = this.state.household.finances;
    this.state.household.money -= amount;
    finances.weekExpenses += amount;
    finances.lifetimeExpenses += amount;
    finances.ledger.unshift({ day: Math.floor(this.state.time.totalDays), amount: -amount, type: 'expense', description });
    finances.ledger = finances.ledger.slice(0, 40);
  }

  evaluateFamilyPlanning() {
    const state = this.state;
    const day = Math.floor(state.time.totalDays);
    if (state.parents.length < 2 || state.family.pregnancy || day < state.family.planningCooldownUntil) return;
    if (state.family.lastPlanningCheck === day || day % 7 !== 5) return;
    state.family.lastPlanningCheck = day;
    const livingChildren = 1 + state.siblings.length;
    if (livingChildren >= state.family.desiredChildren) return;
    const relationship = state.family.relationship || { affection: 40, trust: 40, tension: 40 };
    const averageStress = state.parents.reduce((sum, parent) => sum + parent.needs.stress, 0) / state.parents.length;
    const averageFocus = state.parents.reduce((sum, parent) => sum + parent.traits.familyFocus, 0) / state.parents.length;
    const spacePenalty = livingChildren >= 2 && !roomExists(state, 'childBedroom') ? 18 : 0;
    const moneyScore = clamp(state.household.money / 30, 0, 45);
    const score = relationship.affection * 0.35 + relationship.trust * 0.18 + averageFocus * 0.32 + moneyScore - averageStress * 0.32 - relationship.tension * 0.22 - spacePenalty;
    if (score > 54 && this.rng.chance(clamp(score / 120, 0.18, 0.72))) {
      state.family.pregnancy = { startedDay: day, dueDay: day + this.rng.int(6, 8), parentIds: state.parents.map(parent => parent.id) };
      state.family.planningCooldownUntil = day + 18;
      this.notify('Your parents decided to grow the family. A new baby is expected.', 'important', `pregnancy-${day}`);
      this.showEvent({ eyebrow: 'FAMILY', title: 'The family may grow', body: 'After discussing money, space, and their relationship, your parents decided to have another child.', choices: [{ label: 'Continue' }] });
    } else {
      state.family.planningCooldownUntil = day + 7;
    }
  }

  updatePregnancy() {
    const pregnancy = this.state.family.pregnancy;
    if (!pregnancy) return;
    const day = Math.floor(this.state.time.totalDays);
    if (day < pregnancy.dueDay) return;
    const sibling = createSibling(this.state, this.rng);
    this.state.family.pregnancy = null;
    this.state.family.planningCooldownUntil = day + 20;
    this.evaluateHomeWishlist(true);
    this.notify(`${sibling.name} was born.`, 'important', `birth-${sibling.id}`);
    this.showEvent({ eyebrow: 'NEW SIBLING', title: `${sibling.name} joins the family`, body: 'The new baby is a real member of the household with needs, traits, and a future of their own.', choices: [{ label: 'Welcome them' }] });
    this.log(`${sibling.name} was born.`, 'important');
  }

  maybeTriggerEvent() {
    const state = this.state;
    const day = Math.floor(state.time.totalDays);
    if (day - state.events.lastEventDay < 3 || !this.rng.chance(0.38)) return;
    const eligible = LIFE_EVENTS.filter(event => event.eligible(state) && (!state.events.cooldowns[event.id] || state.events.cooldowns[event.id] <= day));
    const selected = this.rng.pick(eligible);
    if (!selected) return;
    state.events.lastEventDay = day;
    state.events.cooldowns[selected.id] = day + 10;
    if (selected.choices) {
      const choices = selected.choices
        .filter(choice => !choice.condition || choice.condition(state))
        .map(choice => ({ label: choice.label, action: () => { choice.apply(state); this.onStateChanged(); } }));
      this.showEvent({ eyebrow: 'LIFE EVENT', title: selected.title, body: selected.body, choices });
    } else {
      selected.apply?.(state);
      this.showEvent({ eyebrow: 'LIFE EVENT', title: selected.title, body: selected.body, choices: [{ label: 'Continue' }] });
    }
    this.log(selected.title, 'important');
  }

  canClaimCare(parent, targetId) {
    if (!this.careLock) return true;
    if (this.gameStamp >= this.careLock.until) return true;
    return this.careLock.parentId === parent.id || this.careLock.targetId !== targetId;
  }

  claimCare(parent, targetId) {
    this.careLock = { parentId: parent.id, targetId, until: this.gameStamp + CARE_LOCK_MINUTES };
  }

  releaseCareLock(parentId) {
    if (this.careLock?.parentId === parentId) this.careLock = null;
  }

  releaseExpiredCareLock() {
    if (this.careLock && this.gameStamp >= this.careLock.until) this.careLock = null;
  }

  cry() {
    const player = this.state.player;
    if (player.stage !== 'baby') {
      this.notify('You are old enough to express what you need without crying.', 'routine', 'not-baby');
      return;
    }
    player.crying = !player.crying;
    if (player.crying) {
      player.needs.comfort = clamp(player.needs.comfort - 3);
      this.notify('You begin to cry. A caregiver may respond if they are able.', 'routine', 'cry');
    } else this.notify('You settle down for now.', 'routine', 'cry-stop');
  }

  stopPlayer() {
    const player = this.state.player;
    if (player.stage === 'baby') return;
    player.controlMode = 'paused';
    player.stoppedByPlayer = true;
    player.route = null;
    player.currentGoal = null;
    player.activity = activity('waiting', 0);
    player.moving = false;
    this.notify('Autonomy stopped. Your needs and the world still continue.', 'important', 'auto-stop');
  }

  resumePlayer() {
    const player = this.state.player;
    if (player.stage === 'baby') return;
    player.controlMode = 'auto';
    player.stoppedByPlayer = false;
    player.route = null;
    player.currentGoal = null;
    player.activity = activity('waiting', 0);
    this.notify('Your character resumed their normal schedule.', 'routine', 'auto-resume');
  }

  takeDirectControl() {
    const player = this.state.player;
    if (player.stage === 'baby') {
      this.notify('Movement unlocks during the toddler stage.', 'routine', 'baby-move');
      return;
    }
    player.controlMode = 'direct';
    player.stoppedByPlayer = true;
    player.route = null;
    player.currentGoal = null;
    player.activity = activity('waiting', 0);
    this.state.flags.directControlUsed = true;
    this.notify('Direct control enabled. Resume autonomy whenever you are ready.', 'important', 'direct-control');
  }

  guidePlayer(destination, type = null) {
    const player = this.state.player;
    if (player.stage === 'baby') {
      this.notify('A baby needs a caregiver to travel.', 'routine', 'baby-travel');
      return;
    }
    const activityType = type || ({ school: 'school', workplace: 'working', grocery: 'shopping', park: 'park', community: 'community', hospital: 'hospital', home: 'relaxing', furniture: 'furnitureShopping' }[destination] || 'visiting');
    player.controlMode = 'guided';
    player.stoppedByPlayer = false;
    player.route = null;
    player.currentGoal = null;
    player.activity = activity('waiting', 0);
    player.guidedGoal = goal(activityType, destination, destination === 'school' ? 120 : 70, 120);
    this.notify(`Destination selected: ${locationLabel(this.state, destination)}.`, 'routine', 'guided');
  }

  movePlayerDirection(direction, realDt = 0.12) {
    const player = this.state.player;
    if (player.stage === 'baby') return;
    if (player.controlMode !== 'direct') this.takeDirectControl();
    const vectors = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const [dx, dy] = vectors[direction] || [0, 0];
    const amount = 120 * realDt;
    const nextX = player.x + dx * amount;
    const nextY = player.y + dy * amount;
    if (!collides(this.state, nextX, player.y, 9, player.location)) player.x = nextX;
    if (!collides(this.state, player.x, nextY, 9, player.location)) player.y = nextY;
    player.dir = direction;
    player.moving = true;
  }

  interact() {
    const player = this.state.player;
    if (player.stage === 'baby') {
      this.cry();
      return;
    }
    const object = nearestObject(this.state, player);
    if (!object) {
      this.notify('There is nothing close enough to interact with.', 'routine', 'nothing-nearby');
      return;
    }
    switch (object.type) {
      case 'stairs':
        if (this.v7.changeFloor(object.targetFloor)) { player.floor=object.targetFloor; const stair=this.state.household.home.stairs[object.targetFloor===0?'ground':'upper']; player.x=stair.x*TILE+24; player.y=stair.y*TILE; this.notify(object.targetFloor===1?'You went upstairs.':'You went downstairs.','routine','floor-change'); }
        break;
      case 'exit':
        this.teleportThroughDoor('town');
        break;
      case 'exitTown':
        this.teleportThroughDoor('town');
        break;
      case 'enter':
        this.teleportThroughDoor(object.target);
        break;
      case 'bed':
        player.needs.energy = clamp(player.needs.energy + 30);
        player.needs.comfort = clamp(player.needs.comfort + 10);
        this.notify('You rest for a while.', 'routine', 'manual-rest');
        break;
      case 'fridge':
        if (this.state.household.food > 0) {
          this.state.household.food -= 1;
          player.needs.satiety = clamp(player.needs.satiety + 48);
          this.notify('You eat something from the kitchen.', 'routine', 'manual-eat');
        } else this.notify('The kitchen is out of food.', 'important', 'no-food');
        break;
      case 'study':
        player.development.grades = clamp(player.development.grades + 3);
        player.needs.energy = clamp(player.needs.energy - 5);
        this.notify('You spend some time studying.', 'routine', 'manual-study');
        break;
      case 'book':
        player.development.curiosity = clamp(player.development.curiosity + 2);
        player.needs.mood = clamp(player.needs.mood + 8);
        this.notify('You read for a while.', 'routine', 'manual-read');
        break;
      case 'sofa':
      case 'television':
      case 'bench':
      case 'rug':
        player.needs.comfort = clamp(player.needs.comfort + 14);
        player.needs.mood = clamp(player.needs.mood + 10);
        this.notify('You relax for a while.', 'routine', 'manual-relax');
        break;
      case 'play':
        player.needs.mood = clamp(player.needs.mood + 16);
        player.needs.energy = clamp(player.needs.energy - 8);
        player.development.curiosity = clamp(player.development.curiosity + 2);
        this.notify('You spend time playing.', 'routine', 'manual-play');
        break;
      case 'stove': {
        const meal = this.state.household.home.meal;
        if (meal.phase === 'planned' || meal.phase === 'idle') {
          if (meal.phase === 'idle') {
            const window = this.currentMealWindow() || { type:'meal', recipe:'Home-cooked meal' };
            meal.phase='planned'; meal.type=window.type; meal.recipe=window.recipe; meal.cookId=player.id;
          }
          this.completeCooking(player, meal.type, meal.recipe);
          this.notify(`${meal.recipe || 'The meal'} is ready.`, 'important', 'manual-cook');
        } else this.notify('A meal is already being prepared or served.', 'routine', 'meal-busy');
        break;
      }
      case 'table':
        if (['ready','eating'].includes(this.state.household.home.meal.phase)) {
          const meal=this.state.household.home.meal;
          meal.attendees ||= [];
          if (!meal.attendees.includes(player.id)) meal.attendees.push(player.id);
          this.completeFamilyMeal(player);
          this.notify('You join the family meal.', 'routine', 'manual-family-meal');
        } else this.notify('There is no prepared family meal on the table.', 'routine', 'no-meal-table');
        break;
      case 'dishes':
        if (['teen','adult','elder'].includes(player.stage)) {
          this.completeDishwashing(player);
          this.notify('You work through the dirty dishes.', 'routine', 'manual-dishes');
        } else this.notify('You are too young to do the dishes alone.', 'routine', 'young-dishes');
        break;
      case 'laundry':
        if (['teen','adult','elder'].includes(player.stage)) {
          this.completeLaundry(player);
          this.notify('You finish a load of laundry.', 'routine', 'manual-laundry');
        } else this.notify('You are too young to handle the laundry alone.', 'routine', 'young-laundry');
        break;
      case 'exercise':
        this.completeHobby(player, 'exercise');
        this.notify('You practice exercising.', 'routine', 'manual-exercise');
        break;
      case 'painting':
        this.completeHobby(player, 'painting');
        this.notify('You work on a painting.', 'routine', 'manual-painting');
        break;
      case 'music':
        this.completeHobby(player, 'music');
        this.notify('You practice music.', 'routine', 'manual-music');
        break;
      case 'sewing':
        this.completeHobby(player, 'sewing');
        this.notify('You practice sewing.', 'routine', 'manual-sewing');
        break;
      case 'gardening':
        this.completeHobby(player, 'gardening');
        this.notify('You tend the plants.', 'routine', 'manual-gardening');
        break;
      case 'gaming':
        this.completeHobby(player, 'gaming');
        this.notify('You play a game.', 'routine', 'manual-gaming');
        break;
      case 'checkout':
        if (this.state.household.money >= 70) this.buyGroceries(player);
        else this.notify('The household cannot afford a full basket right now.', 'important', 'cant-afford-food');
        break;
      case 'doctor':
        if (this.state.household.money >= EXPENSES.medicalBase) {
          this.recordExpense(EXPENSES.medicalBase, 'Clinic visit');
          player.needs.health = clamp(player.needs.health + 30);
          this.notify('The clinic treated your health problem.', 'important', 'doctor');
        }
        break;
      case 'community':
      case 'socialize':
        player.needs.mood = clamp(player.needs.mood + 14);
        player.development.socialConfidence = clamp(player.development.socialConfidence + 2);
        this.performSocialInteraction(player);
        this.notify('You talk with someone nearby.', 'routine', 'community-action');
        break;
      default:
        this.notify(object.label, 'routine', `object-${object.id}`);
    }
  }

  teleportThroughDoor(destination) {
    const player = this.state.player;
    if (player.location === 'town' && destination !== 'town') {
      player.location = destination;
      const entry = getSceneEntryPoint(destination);
      player.x = entry.x;
      player.y = entry.y;
      this.changePlayerScene(destination);
      return;
    }
    if (destination === 'town') {
      const old = player.location;
      player.location = 'town';
      const point = getTownDoorPoint(this.state, old === 'town' ? 'home' : old);
      player.x = point.x;
      player.y = point.y;
      this.changePlayerScene('town');
    }
  }

  getAvailableDestinations() {
    const stage = this.state.player.stage;
    const common = [
      { id: 'home', label: 'Go home', activity: 'relaxing' },
      { id: 'park', label: 'Visit the park', activity: 'park' },
      { id: 'community', label: 'Community center', activity: 'community' },
      { id: 'hospital', label: 'Hospital', activity: 'hospital' }
    ];
    if (stage === 'toddler') return common.filter(item => ['home', 'park'].includes(item.id));
    if (stage === 'child') return [{ id: 'school', label: 'Go to school', activity: 'school' }, ...common, { id: 'grocery', label: 'Go with an errand', activity: 'shopping' }];
    if (stage === 'teen') return [{ id: 'school', label: 'Go to school', activity: 'school' }, { id: 'workplace', label: 'Part-time work', activity: 'partTimeWork' }, ...common, { id: 'grocery', label: 'Grocery store', activity: 'shopping' }];
    if (stage === 'adult' || stage === 'elder') return [{ id: 'workplace', label: 'Go to work', activity: 'working' }, { id: 'grocery', label: 'Buy groceries', activity: 'shopping' }, { id: 'furniture', label: 'Furniture store', activity: 'furnitureShopping' }, ...common];
    return [];
  }

  sendPhoneMessage(contactId, kind = 'hello') {
    return this.v7.sendMessage(contactId, kind);
  }

  inviteContact(contactId) {
    return this.v7.invite(contactId);
  }

  changeHomeFloor(floor) {
    return this.v7.changeFloor(Number(floor));
  }

  requestSecondFloor() {
    return this.v7.requestSecondFloor();
  }

  setSpeed(index) {
    this.state.speedIndex = clamp(index, 0, SPEEDS.length - 1);
  }

  addFastSummary(key, amount = 1) {
    const summary = this.state.notifications.fastSummary;
    summary[key] = (summary[key] || 0) + amount;
  }

  maybeFlushFastSummary() {
    if (this.speed < 8) return;
    if (this.gameStamp - this.lastFastSummaryStamp < FAST_SUMMARY_INTERVAL_MINUTES) return;
    this.lastFastSummaryStamp = this.gameStamp;
    const summary = this.state.notifications.fastSummary;
    const parts = [];
    if (summary.workShifts) parts.push(`${summary.workShifts} work shift${summary.workShifts === 1 ? '' : 's'} completed`);
    if (summary.income) parts.push(`${peso(summary.income)} earned`);
    if (summary.groceryTrips) parts.push(`${summary.groceryTrips} grocery trip${summary.groceryTrips === 1 ? '' : 's'}`);
    if (summary.hobbies >= 3) parts.push(`${summary.hobbies} hobby sessions`);
    if (parts.length) this.notify(`Fast-forward summary: ${parts.join(' · ')}.`, 'important', `fast-summary-${Math.floor(this.gameStamp / FAST_SUMMARY_INTERVAL_MINUTES)}`);
    this.state.notifications.fastSummary = {};
  }

  log(text, type = 'routine') {
    this.state.log.unshift({ stamp: this.gameStamp, day: Math.floor(this.state.time.totalDays) + 1, text, type });
    this.state.log = this.state.log.slice(0, 80);
  }

  getPersonStatus(person) {
    if (person.route) return `Walking to ${locationLabel(this.state, person.route.destination)}`;
    return ACTIVITY_LABELS[person.activity?.type] || titleCase(person.activity?.type || 'Waiting');
  }

  getNextPlayerPlan() {
    const player = this.state.player;
    if (player.controlMode === 'paused') return 'Schedule stopped';
    if (player.controlMode === 'direct') return 'Direct control';
    if (player.route) return `Walking to ${locationLabel(this.state, player.route.destination)}`;
    if (player.currentGoal) return ACTIVITY_LABELS[player.currentGoal.type] || titleCase(player.currentGoal.type);
    return 'Choosing the next activity';
  }
}
