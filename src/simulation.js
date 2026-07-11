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
  collides, findSafePoint, getAllFamily, getDependents, getLocation, getPersonById,
  getSceneEntryPoint, getSceneExitPoint, getTownDoorPoint, locationLabel, nearestObject
} from './world.js';

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
  }

  ensureAgentsReady() {
    for (const person of getAllFamily(this.state)) {
      person.activity ||= activity('waiting', 0);
      person.currentGoal ||= null;
      person.route ||= null;
      person.moving ??= false;
      person.dir ||= 'down';
      person.needs.stress ??= 10;
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
    this.updateFamilyAgents(dt, gameMinutes);
    this.updatePlayer(dt, gameMinutes);
    this.updatePregnancy();
    this.updateHomeProjects();
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
    }
  }

  handleNewDay() {
    const state = this.state;
    state.player.school.attendedDay = state.player.school.attendedDay ?? -1;
    state.household.home.cleanliness = clamp(state.household.home.cleanliness - this.rng.int(1, 4));
    state.household.home.condition = clamp(state.household.home.condition - this.rng.float(0.15, 0.7));
    if (state.family.relationship) {
      state.family.relationship.tension = clamp(state.family.relationship.tension + this.rng.int(-3, 4));
      state.family.relationship.affection = clamp(state.family.relationship.affection + this.rng.int(-2, 2));
    }
    this.evaluateHomeWishlist();
    this.processBills();
    this.evaluateFamilyPlanning();
    this.maybeTriggerEvent();
    this.log(`${dayName(state.time.totalDays)} begins.`, 'routine');
  }

  updateAging(gameMinutes) {
    const years = gameMinutes / (1440 * PLAYER_YEAR_DAYS);
    const familyYoung = [this.state.player, ...this.state.siblings];
    for (const person of familyYoung) {
      const oldStage = person.stage;
      person.age += years;
      person.stage = stageForAge(person.age);
      if (oldStage !== person.stage) this.handleStageChange(person, oldStage);
    }
    for (const parent of this.state.parents) {
      parent.age += years;
      parent.stage = stageForAge(parent.age);
    }
    for (const resident of this.state.town.residents) {
      resident.age += years * 0.2;
      resident.stage = stageForAge(resident.age);
    }
  }

  handleStageChange(person, oldStage) {
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
      this.evaluateHomeWishlist(true);
      const messages = {
        toddler: ['First steps', 'You can move around, explore rooms, and follow your caregivers on outings.'],
        child: ['School begins', 'Your daily schedule now includes school, homework, friends, and independent activities.'],
        teen: ['A need for privacy', 'Your family will evaluate whether it can create a separate bedroom. You can study, work part-time, and make more independent plans.'],
        adult: ['Your own direction', 'Work, relationships, housing, and parenthood now become part of your autonomous schedule.'],
        elder: ['The long view', 'Your schedule slows down, while family connections and health become more important.']
      };
      const copy = messages[person.stage];
      if (copy) this.showEvent({ eyebrow: 'LIFE STAGE', title: copy[0], body: copy[1], choices: [{ label: 'Continue' }] });
      this.notify(`You are now a ${person.stage}.`, 'important', `stage-${person.stage}`);
      this.log(`${person.name} entered the ${person.stage} stage.`, 'important');
    } else {
      this.notify(`${person.name} is now a ${person.stage}.`, 'important', `sibling-stage-${person.id}-${person.stage}`);
      this.evaluateHomeWishlist(true);
    }
  }

  updateNeeds(gameMinutes) {
    const state = this.state;
    for (const person of [state.player, ...state.siblings]) {
      if (!person.alive) continue;
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

    for (const parent of state.parents) {
      if (!parent.alive) continue;
      parent.needs.satiety = clamp(parent.needs.satiety - gameMinutes * 0.13 / 60);
      parent.needs.energy = clamp(parent.needs.energy - gameMinutes * 0.12 / 60);
      parent.needs.hygiene = clamp(parent.needs.hygiene - gameMinutes * 0.05 / 60);
      const moneyStress = state.household.money < 250 ? 0.04 : -0.008;
      parent.needs.stress = clamp(parent.needs.stress + gameMinutes * moneyStress);
      parent.needs.mood = clamp(parent.needs.mood + gameMinutes * (parent.needs.stress < 55 ? 0.006 : -0.018));
    }
  }

  updateFamilyAgents(realDt, gameMinutes) {
    this.releaseExpiredCareLock();
    for (const parent of this.state.parents) this.updateParent(parent, realDt, gameMinutes);
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

  updateSibling(sibling, realDt, gameMinutes) {
    if (!sibling.alive) return;
    if (this.finishExpiredActivity(sibling)) return;
    if (sibling.route) {
      this.updateRoute(sibling, realDt);
      return;
    }
    if (this.activityActive(sibling)) {
      this.advanceActivity(sibling, gameMinutes);
      return;
    }
    const next = this.chooseYoungPersonGoal(sibling, false);
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
    const nextGoal = this.choosePlayerGoal();
    this.assignGoal(player, nextGoal);
  }

  chooseParentGoal(parent) {
    const urgent = this.chooseUrgentParentGoal(parent);
    if (urgent) return urgent;
    const scheduled = this.resolveParentSchedule(parent);
    const purchaseGoal = this.choosePurchaseGoal(parent, scheduled);
    if (purchaseGoal) return purchaseGoal;
    return scheduled;
  }

  chooseUrgentParentGoal(parent) {
    const stamp = this.gameStamp;
    if (parent.needs.energy < 12) return goal('sleeping', 'home', 240, 100);
    if (parent.needs.satiety < 18) return goal('eating', 'home', 35, 95);
    if (this.state.household.food <= 2 && this.state.household.money >= 55) return goal('shopping', 'grocery', 50, 92);

    const dependents = getDependents(this.state);
    const candidates = [];
    for (const dependent of dependents) {
      if (!isYoungDependent(dependent)) continue;
      const hunger = Math.max(0, 44 - dependent.needs.satiety) * 2.6;
      const hygiene = Math.max(0, 42 - dependent.needs.hygiene) * 2.4;
      const comfort = Math.max(0, 40 - dependent.needs.comfort) * 2.2 + (dependent.crying ? 70 : 0);
      if (hunger > 12) candidates.push(goal('feeding', dependent.location, 32, hunger, { targetId: dependent.id }));
      if (hygiene > 12) candidates.push(goal('changing', dependent.location, 28, hygiene, { targetId: dependent.id }));
      if (comfort > 15) candidates.push(goal('comforting', dependent.location, 30, comfort, { targetId: dependent.id }));
    }
    candidates.sort((a, b) => b.priority - a.priority);
    const best = candidates[0];
    if (best && this.canClaimCare(parent, best.targetId)) {
      this.claimCare(parent, best.targetId);
      return best;
    }

    if (parent.needs.stress > 88) return goal('relaxing', 'home', 70, 90);
    if (this.state.household.home.condition < 25 && this.state.household.money >= 100) return goal('repairing', 'home', 90, 82);
    return null;
  }

  resolveParentSchedule(parent) {
    const minute = this.state.time.minute;
    const hour = minute / 60;
    const dayIndex = getDayIndex(this.state.time.totalDays);
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
    if (hour >= 6.2 && hour < 8 && parent.needs.satiety < 72) return goal('breakfast', 'home', 30, 50);
    if (hour >= 12 && hour < 13.5 && parent.needs.satiety < 65) return goal('lunch', parent.location, 30, 44);
    if (hour >= 18 && hour < 20 && parent.needs.satiety < 76) return goal('dinner', 'home', 45, 48);

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
        if (parent.traits.familyFocus > 62 && this.rng.chance(0.58)) return goal('familyTime', 'home', 70, 41);
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
    return goal('hobby', person.traitSeeds?.sociability > 60 ? 'community' : 'home', 65, 25, { hobbyId: person.traitSeeds?.creativity > 55 ? 'painting' : 'reading' });
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
      return goal('hobby', player.traitSeeds?.sociability > 60 ? 'community' : 'home', 70, 28, { hobbyId: player.traitSeeds?.creativity > 55 ? 'painting' : 'reading' });
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
    this.startGoalActivity(person, nextGoal);
  }

  maybeCarryBaby(person, nextGoal) {
    if (!this.state.parents.some(parent => parent.id === person.id)) return;
    const player = this.state.player;
    if (player.stage !== 'baby' || player.location !== person.location || player.carriedBy) return;
    if (['working', 'remoteWork'].includes(nextGoal.type)) return;
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
      shiftKey: currentGoal.shiftKey || null
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
        break;
      case 'visiting':
      case 'community':
      case 'park':
        person.needs.mood = clamp(person.needs.mood + 14);
        person.needs.stress = clamp(person.needs.stress - 8);
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
      this.startGoalActivity(person, currentGoal);
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
    this.notify(`${person.name.split(' ')[0]} stocked the kitchen.`, 'routine', 'groceries');
    this.addFastSummary('groceryTrips', 1);
  }

  completeHobby(person, hobbyId) {
    const hobby = hobbyById(hobbyId);
    if (hobby.cost && this.state.household.money >= hobby.cost) this.recordExpense(hobby.cost, hobby.label);
    person.needs.mood = clamp(person.needs.mood + hobby.mood);
    person.needs.energy = clamp(person.needs.energy + hobby.energy);
    person.needs.stress = clamp(person.needs.stress - Math.max(4, hobby.mood * 0.5));
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

  evaluateHomeWishlist(force = false) {
    const home = this.state.household.home;
    const day = Math.floor(this.state.time.totalDays);
    if (!force && home.lastEvaluationDay === day) return;
    home.lastEvaluationDay = day;
    const existing = new Set(home.wishlist.map(item => item.id));
    const add = (id, bonus = 0, reason = '') => {
      if (existing.has(id) || hasFurniture(this.state, id) || home.deliveries.some(delivery => delivery.id === id)) return;
      if (id === 'teenBedroom' && (roomExists(this.state, 'teenBedroom') || home.construction?.id === 'teenBedroom')) return;
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
    if (this.state.player.stage === 'teen') add('teenBedroom', 25, 'A teenager needs privacy and space.');
    if (this.state.siblings.some(sibling => ['toddler', 'child', 'teen'].includes(sibling.stage))) add('siblingBed', 15, 'A sibling needs a proper bed.');
    if (!hasFurniture(this.state, 'sofa') && this.state.household.tier >= 2) add('sofa', 0, 'The family wants a comfortable living room.');
    if (!hasFurniture(this.state, 'bookshelf') && ['child', 'teen'].includes(this.state.player.stage)) add('bookshelf', 8, 'Books support school and hobbies.');
    if (!hasFurniture(this.state, 'diningSet') && this.state.household.tier >= 3) add('diningSet', 4, 'The basic table is getting crowded.');
    if (!hasFurniture(this.state, 'rug') && this.state.household.money > 800) add('rug');
    if (!hasFurniture(this.state, 'plant') && this.state.household.money > 1400) add('plant');
    if (!hasFurniture(this.state, 'television') && this.state.household.money > 2200) add('television');
    if (!home.wallPaint && this.state.household.money > 1600 && !existing.has('paint')) add('paint');
    home.wishlist.sort((a, b) => b.priority - a.priority);
  }

  purchaseFurniture(id, parent) {
    const home = this.state.household.home;
    const item = home.wishlist.find(entry => entry.id === id) || purchaseById(id);
    if (!item || this.state.household.money < item.cost) return;
    this.recordExpense(item.cost, item.label);
    home.wishlist = home.wishlist.filter(entry => entry.id !== id);
    if (id === 'teenBedroom') {
      home.construction = { id, label: item.label, startedDay: Math.floor(this.state.time.totalDays), dueDay: Math.floor(this.state.time.totalDays) + (item.constructionDays || 3), progress: 0 };
      this.notify(`${parent.name.split(' ')[0]} arranged a bedroom extension. Construction will take several days.`, 'important', 'teen-room-start');
      this.log('The household began building a teen bedroom.', 'important');
      return;
    }
    home.deliveries.push({ id, room: item.room, label: item.label, dueDay: Math.floor(this.state.time.totalDays) + 1 });
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
        if (delivery.id === 'childBed') home.furniture = home.furniture.filter(item => item.id !== 'toddlerBed');
        if (delivery.id === 'diningSet') home.furniture = home.furniture.filter(item => item.id !== 'basicTable');
        addFurniture(this.state, delivery.id, delivery.room);
      }
      home.deliveries.splice(home.deliveries.indexOf(delivery), 1);
      this.notify(`The ${delivery.label} was delivered and placed in the correct room.`, 'important', `delivery-${delivery.id}`);
      this.log(`The household received a ${delivery.label}.`, 'important');
    }
    if (home.construction) {
      const span = Math.max(1, home.construction.dueDay - home.construction.startedDay);
      home.construction.progress = clamp(((this.state.time.totalDays - home.construction.startedDay) / span) * 100);
      if (day >= home.construction.dueDay) {
        activateRoom(this.state, 'teenBedroom');
        if (hasFurniture(this.state, 'childBed')) {
          const bed = home.furniture.find(item => item.id === 'childBed');
          if (bed) bed.room = 'teenBedroom';
        } else addFurniture(this.state, 'childBed', 'teenBedroom');
        if (hasFurniture(this.state, 'studyDesk')) {
          const desk = home.furniture.find(item => item.id === 'studyDesk');
          if (desk) desk.room = 'teenBedroom';
        }
        home.construction = null;
        this.notify('The new teen bedroom is complete.', 'important', 'teen-room-complete');
        this.showEvent({ eyebrow: 'HOME EXPANSION', title: 'A room of your own', body: 'Construction is finished. Your bed and study area have been moved into a private bedroom.', choices: [{ label: 'See the new room' }] });
      }
    }
  }

  processBills() {
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
        this.notify('You spend time with people from town.', 'routine', 'community-action');
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
