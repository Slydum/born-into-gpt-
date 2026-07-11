import { MAX_TOASTS, ROUTINE_TOAST_COOLDOWN_MS, SPEEDS, DAYS } from './config.js';
import { ACTIVITY_LABELS, ROOM_LABELS, TRAIT_LABELS } from './data.js';
import { getActiveRooms, getAllFamily, getPersonById, getVisibleResidents, locationLabel } from './world.js';
import { clamp, dayName, formatAge, formatTime, gameDateLabel, peso, titleCase } from './utils.js';

function el(id) {
  return document.getElementById(id);
}

function percentBar(label, value) {
  const safe = clamp(Math.round(value));
  const tone = safe < 25 ? 'danger' : safe < 50 ? 'warning' : 'good';
  return `<div class="need-row"><span>${label}</span><div class="bar-track"><i class="${tone}" style="width:${safe}%"></i></div><strong>${safe}</strong></div>`;
}

function traitMeter(label, value) {
  return `<div class="trait-row"><span>${label}</span><div class="trait-track"><i style="width:${clamp(value)}%"></i></div><strong>${Math.round(value)}</strong></div>`;
}

export class NotificationManager {
  constructor(state, toastLayer, getSpeed) {
    this.state = state;
    this.toastLayer = toastLayer;
    this.getSpeed = getSpeed;
    this.lastRoutineRealTime = 0;
    this.visible = [];
    this.keyTimes = new Map();
  }

  setState(state) {
    this.state = state;
  }

  push(text, type = 'routine', key = text) {
    const now = Date.now();
    const speed = this.getSpeed();
    const lastKey = this.keyTimes.get(key) || 0;
    if (now - lastKey < 5000 && type === 'routine') return;
    this.keyTimes.set(key, now);
    this.state.notifications.history.unshift({ text, type, stamp: this.state.time.totalDays * 1440 + this.state.time.minute });
    this.state.notifications.history = this.state.notifications.history.slice(0, 80);
    if (type === 'routine' && speed >= 8) return;
    if (type === 'routine' && now - this.lastRoutineRealTime < ROUTINE_TOAST_COOLDOWN_MS) return;
    if (type === 'routine') this.lastRoutineRealTime = now;
    this.showToast(text, type);
  }

  showToast(text, type) {
    while (this.visible.length >= MAX_TOASTS) {
      const oldest = this.visible.shift();
      oldest?.remove();
    }
    const node = document.createElement('div');
    node.className = `toast toast-${type}`;
    node.textContent = text;
    this.toastLayer.append(node);
    this.visible.push(node);
    const duration = type === 'important' ? 5200 : 3300;
    window.setTimeout(() => {
      node.classList.add('toast-out');
      window.setTimeout(() => {
        node.remove();
        this.visible = this.visible.filter(item => item !== node);
      }, 260);
    }, duration);
  }
}

export class UI {
  constructor(state, simulation) {
    this.state = state;
    this.simulation = simulation;
    this.activeTab = 'me';
    this.needsExpanded = false;
    this.profileReturn = null;
    this.dom = {
      pauseBtn: el('pauseBtn'), speedBtn: el('speedBtn'), saveBtn: el('saveBtn'), menuBtn: el('menuBtn'),
      calendarLabel: el('calendarLabel'), clockLabel: el('clockLabel'), moneyTop: el('moneyTop'),
      playerName: el('playerName'), ageLabel: el('ageLabel'), stageBadge: el('stageBadge'), portrait: el('portrait'),
      dayLabel: el('dayLabel'), timeLabel: el('timeLabel'), placeLabel: el('placeLabel'), moneyLabel: el('moneyLabel'),
      needsList: el('needsList'), familyList: el('familyList'), familyMood: el('familyMood'),
      objectiveTag: el('objectiveTag'), objectiveText: el('objectiveText'), scheduleText: el('scheduleText'),
      homeSummary: el('homeSummary'), homeTierLabel: el('homeTierLabel'), townSummary: el('townSummary'),
      eventLog: el('eventLog'), ledgerList: el('ledgerList'),
      modeBadge: el('modeBadge'), goalLabel: el('goalLabel'), stopBtn: el('stopBtn'), resumeBtn: el('resumeBtn'),
      directBtn: el('directBtn'), destinationBtn: el('destinationBtn'), actionBtn: el('actionBtn'), cryBtn: el('cryBtn'),
      directControls: el('directControls'), mobileTabs: [...document.querySelectorAll('[data-tab]')],
      panelSections: [...document.querySelectorAll('[data-panel-section]')],
      profileOverlay: el('profileOverlay'), profileTitle: el('profileTitle'), profileBody: el('profileBody'), profileCloseBtn: el('profileCloseBtn'),
      destinationOverlay: el('destinationOverlay'), destinationChoices: el('destinationChoices'), destinationCloseBtn: el('destinationCloseBtn'),
      modalOverlay: el('modalOverlay'), modalEyebrow: el('modalEyebrow'), modalTitle: el('modalTitle'), modalBody: el('modalBody'), modalChoices: el('modalChoices')
    };
    this.bindBaseUI();
  }

  setState(state) {
    this.state = state;
  }

  bindBaseUI() {
    for (const button of this.dom.mobileTabs) {
      button.addEventListener('click', () => this.setTab(button.dataset.tab));
    }
    this.dom.profileCloseBtn.addEventListener('click', () => this.closeProfile());
    this.dom.profileOverlay.addEventListener('click', event => { if (event.target === this.dom.profileOverlay) this.closeProfile(); });
    this.dom.destinationCloseBtn.addEventListener('click', () => this.closeDestinations());
    this.dom.destinationOverlay.addEventListener('click', event => { if (event.target === this.dom.destinationOverlay) this.closeDestinations(); });
    el('playerCardBtn').addEventListener('click', () => this.showProfile(this.state.player));
    el('needsToggle').addEventListener('click', () => { this.needsExpanded = !this.needsExpanded; this.renderNeeds(); });
    el('clearLogBtn').addEventListener('click', () => { this.state.log = []; this.renderLog(); });
  }

  setTab(tab) {
    this.activeTab = tab;
    for (const button of this.dom.mobileTabs) button.classList.toggle('active', button.dataset.tab === tab);
    for (const section of this.dom.panelSections) section.hidden = section.dataset.panelSection !== tab;
    const side = el('sidePanel');
    if (side) side.scrollTop = 0;
  }

  render() {
    const state = this.state;
    const player = state.player;
    this.dom.calendarLabel.textContent = gameDateLabel(state);
    this.dom.clockLabel.textContent = formatTime(state.time.minute);
    this.dom.moneyTop.textContent = peso(state.household.money);
    this.dom.speedBtn.textContent = `${SPEEDS[state.speedIndex]}×`;
    this.dom.playerName.textContent = player.name;
    this.dom.ageLabel.textContent = `Age ${formatAge(player.age)} · Gen ${player.generation}`;
    this.dom.stageBadge.textContent = player.stage;
    this.dom.portrait.dataset.stage = player.stage;
    this.dom.dayLabel.textContent = Math.floor(state.time.totalDays) + 1;
    this.dom.timeLabel.textContent = formatTime(state.time.minute);
    this.dom.placeLabel.textContent = locationLabel(state, player.location);
    this.dom.moneyLabel.textContent = peso(state.household.money);
    this.renderNeeds();
    this.renderFamily();
    this.renderObjective();
    this.renderHome();
    this.renderTown();
    this.renderLog();
    this.renderLedger();
    this.renderControls();
  }

  renderNeeds() {
    const needs = this.state.player.needs;
    const primary = [
      ['Health', needs.health], ['Energy', needs.energy], ['Food', needs.satiety], ['Mood', needs.mood]
    ];
    const details = [['Comfort', needs.comfort], ['Hygiene', needs.hygiene], ['Stress safety', 100 - needs.stress]];
    const rows = this.needsExpanded ? [...primary, ...details] : primary;
    this.dom.needsList.innerHTML = rows.map(([label, value]) => percentBar(label, value)).join('');
    el('needsToggle').textContent = this.needsExpanded ? 'Less' : 'Details';
  }

  renderFamily() {
    const state = this.state;
    const relationship = state.family.relationship;
    this.dom.familyMood.textContent = relationship
      ? relationship.tension > 68 ? 'Tense' : relationship.affection > 68 ? 'Warm' : 'Steady'
      : 'Single-parent home';
    const members = [...state.parents, ...state.siblings];
    this.dom.familyList.innerHTML = members.map(person => {
      const status = this.simulation.getPersonStatus(person);
      const role = state.parents.some(parent => parent.id === person.id) ? `${person.job?.label || 'Caregiver'} · ${formatAge(person.age)}` : `Sibling · ${formatAge(person.age)}`;
      return `<button type="button" class="family-card" data-person-id="${person.id}">
        <span class="family-avatar">${person.name.charAt(0)}</span>
        <span class="family-copy"><strong>${person.name}</strong><small>${role}</small></span>
        <span class="family-action">${status}</span>
      </button>`;
    }).join('') || '<p class="empty-copy">No other family members are currently listed.</p>';
    for (const button of this.dom.familyList.querySelectorAll('[data-person-id]')) {
      button.addEventListener('click', () => this.showProfile(getPersonById(state, button.dataset.personId)));
    }
  }

  renderObjective() {
    const player = this.state.player;
    const plan = this.simulation.getNextPlayerPlan();
    this.dom.objectiveTag.textContent = player.controlMode === 'auto' ? 'Autonomous' : player.controlMode === 'guided' ? 'Guided' : player.controlMode === 'direct' ? 'Direct' : 'Stopped';
    this.dom.objectiveText.textContent = plan;
    this.dom.scheduleText.textContent = this.getScheduleDescription(player);
  }

  getScheduleDescription(player) {
    const day = dayName(this.state.time.totalDays);
    const stage = player.stage;
    if (stage === 'baby') return `${day}: caregivers decide where you go. Crying may interrupt their plans.`;
    if (stage === 'toddler') return `${day}: meals, play, naps, exploration, and supervised outings.`;
    if (stage === 'child') return `${day}: ${this.state.time.totalDays % 7 < 5 ? 'school from 8:00 to 15:00, then homework or play.' : 'weekend hobbies, friends, and family plans.'}`;
    if (stage === 'teen') return `${day}: school, homework, hobbies, privacy, and possible part-time work.`;
    if (stage === 'adult') return `${day}: work, errands, hobbies, relationships, and household decisions.`;
    return `${day}: health, family visits, community activities, and retirement.`;
  }

  renderHome() {
    const state = this.state;
    const home = state.household.home;
    this.dom.homeTierLabel.textContent = `${state.household.label} · Tier ${state.household.tier}`;
    const rooms = getActiveRooms(state).map(room => ROOM_LABELS[room.id] || room.label);
    const wishlist = home.wishlist.slice(0, 4);
    const project = home.construction
      ? `<div class="home-project"><strong>${home.construction.label}</strong><span>${Math.round(home.construction.progress)}% complete</span></div>`
      : home.deliveries.length
        ? `<div class="home-project"><strong>Delivery pending</strong><span>${home.deliveries.map(item => item.label).join(', ')}</span></div>`
        : '<div class="home-project"><strong>No active construction</strong><span>The family will evaluate needs daily.</span></div>';
    this.dom.homeSummary.innerHTML = `
      <div class="home-metrics">
        ${percentBar('Condition', home.condition)}
        ${percentBar('Cleanliness', home.cleanliness)}
      </div>
      ${project}
      <h4>Rooms</h4><p>${rooms.join(' · ')}</p>
      <h4>Household wishlist</h4>
      ${wishlist.length ? `<ol class="wishlist">${wishlist.map(item => `<li><strong>${item.label}</strong><span>${peso(item.cost)} · ${item.reason || 'Optional upgrade'}</span></li>`).join('')}</ol>` : '<p class="empty-copy">No urgent purchases right now.</p>'}
      <h4>Family planning</h4>
      <p>${state.family.pregnancy ? `A baby is expected around day ${state.family.pregnancy.dueDay + 1}.` : `The parents currently hope for about ${state.family.desiredChildren} child${state.family.desiredChildren === 1 ? '' : 'ren'}.`}</p>
    `;
  }

  renderTown() {
    const residents = getVisibleResidents(this.state, 'town');
    const all = this.state.town.residents;
    const counts = all.reduce((map, person) => { map[person.stage] = (map[person.stage] || 0) + 1; return map; }, {});
    this.dom.townSummary.innerHTML = `
      <div class="town-stats"><div><strong>${all.length}</strong><span>Residents</span></div><div><strong>${this.state.town.households.length}</strong><span>Households</span></div><div><strong>${residents.length}</strong><span>Nearby</span></div></div>
      <p>${counts.child || 0} children · ${counts.teen || 0} teens · ${counts.adult || 0} adults · ${counts.elder || 0} elders</p>
      <h4>People nearby</h4>
      <div class="nearby-list">${residents.length ? residents.slice(0, 8).map(person => `<button type="button" data-resident-id="${person.id}"><strong>${person.name}</strong><span>${titleCase(person.stage)} · ${person.job?.label || 'Resident'}</span></button>`).join('') : '<p class="empty-copy">Nobody nearby right now. Crowds change with school, work, evenings, and weekends.</p>'}</div>
    `;
    for (const button of this.dom.townSummary.querySelectorAll('[data-resident-id]')) {
      button.addEventListener('click', () => this.showProfile(getPersonById(this.state, button.dataset.residentId)));
    }
  }

  renderLog() {
    this.dom.eventLog.innerHTML = this.state.log.slice(0, 18).map(entry => `<article class="log-entry ${entry.type || 'routine'}"><small>Day ${entry.day}</small><p>${entry.text}</p></article>`).join('') || '<p class="empty-copy">Your memory is empty.</p>';
  }

  renderLedger() {
    const finances = this.state.household.finances;
    this.dom.ledgerList.innerHTML = `
      <div class="finance-summary"><div><span>This week earned</span><strong>${peso(finances.weekIncome)}</strong></div><div><span>This week spent</span><strong>${peso(finances.weekExpenses)}</strong></div></div>
      ${finances.ledger.slice(0, 8).map(entry => `<div class="ledger-row ${entry.type}"><span>${entry.description}</span><strong>${entry.amount >= 0 ? '+' : ''}${peso(entry.amount)}</strong></div>`).join('') || '<p class="empty-copy">No transactions yet.</p>'}
    `;
  }

  renderControls() {
    const player = this.state.player;
    const mode = player.controlMode;
    this.dom.modeBadge.textContent = mode === 'auto' ? 'AUTO' : mode === 'guided' ? 'GUIDED' : mode === 'direct' ? 'DIRECT' : 'STOPPED';
    this.dom.goalLabel.textContent = this.simulation.getNextPlayerPlan();
    this.dom.stopBtn.hidden = player.stage === 'baby' || mode === 'paused';
    this.dom.resumeBtn.hidden = player.stage === 'baby' || mode === 'auto';
    this.dom.directBtn.hidden = player.stage === 'baby' || mode === 'direct';
    this.dom.destinationBtn.disabled = player.stage === 'baby';
    this.dom.directControls.hidden = mode !== 'direct';
    this.dom.actionBtn.hidden = mode !== 'direct';
    this.dom.cryBtn.hidden = player.stage !== 'baby';
    this.dom.cryBtn.textContent = player.crying ? 'Stop crying' : 'Cry';
  }

  showEvent({ eyebrow = 'LIFE EVENT', title, body, choices = [{ label: 'Continue' }] }) {
    this.dom.modalEyebrow.textContent = eyebrow;
    this.dom.modalTitle.textContent = title;
    this.dom.modalBody.textContent = body;
    this.dom.modalChoices.replaceChildren();
    for (const choice of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice.label;
      button.addEventListener('click', () => {
        this.dom.modalOverlay.classList.add('hidden');
        choice.action?.();
        this.render();
      });
      this.dom.modalChoices.append(button);
    }
    this.dom.modalOverlay.classList.remove('hidden');
  }

  showProfile(person) {
    if (!person) return;
    const isParent = this.state.parents.some(parent => parent.id === person.id);
    const isPlayer = person.id === this.state.player.id;
    const isResident = person.id.startsWith('resident-');
    this.dom.profileTitle.textContent = person.name;
    const traits = person.traits && !Array.isArray(person.traits) ? person.traits : person.traitSeeds || {};
    const traitRows = Object.entries(traits).slice(0, 10).map(([key, value]) => traitMeter(TRAIT_LABELS[key] || titleCase(key), value)).join('');
    const needs = person.needs ? [
      percentBar('Energy', person.needs.energy), percentBar('Food', person.needs.satiety),
      percentBar('Mood', person.needs.mood), percentBar('Stress safety', 100 - (person.needs.stress || 0))
    ].join('') : '';
    const relationship = isParent && this.state.family.relationship ? `
      <div class="profile-grid"><div><span>Affection</span><strong>${Math.round(this.state.family.relationship.affection)}</strong></div><div><span>Trust</span><strong>${Math.round(this.state.family.relationship.trust)}</strong></div><div><span>Tension</span><strong>${Math.round(this.state.family.relationship.tension)}</strong></div></div>` : '';
    this.dom.profileBody.innerHTML = `
      <div class="profile-hero"><div class="profile-avatar">${person.name.charAt(0)}</div><div><span class="stage-badge">${titleCase(person.stage)}</span><h3>${isPlayer ? 'Your character' : isParent ? 'Parent' : isResident ? 'Town resident' : 'Sibling'}</h3><p>Age ${formatAge(person.age)} · ${locationLabel(this.state, person.location || 'home')}</p></div></div>
      <div class="profile-status"><span>Current activity</span><strong>${isResident ? person.job?.label || 'Following a town routine' : this.simulation.getPersonStatus(person)}</strong></div>
      ${person.job ? `<div class="profile-status"><span>Job</span><strong>${person.job.label}</strong><small>${titleCase(person.job.schedule)} schedule · ${person.job.pay ? `${peso(person.job.pay[0])}–${peso(person.job.pay[1])} per shift` : ''}</small></div>` : ''}
      ${person.hobbies?.length ? `<div class="profile-status"><span>Hobbies</span><strong>${person.hobbies.map(titleCase).join(' · ')}</strong></div>` : ''}
      ${needs ? `<h4>Needs</h4><div class="bars">${needs}</div>` : ''}
      ${traitRows ? `<h4>Personality</h4><div class="trait-list">${traitRows}</div>` : ''}
      ${relationship}
      ${person.struggle ? `<div class="profile-warning"><strong>Current struggle</strong><span>${titleCase(person.struggle)}</span></div>` : ''}
    `;
    this.dom.profileOverlay.classList.remove('hidden');
  }

  closeProfile() {
    this.dom.profileOverlay.classList.add('hidden');
  }

  openDestinations() {
    const destinations = this.simulation.getAvailableDestinations();
    this.dom.destinationChoices.innerHTML = destinations.map(item => `<button type="button" data-destination="${item.id}" data-activity="${item.activity}"><strong>${item.label}</strong><span>${locationLabel(this.state, item.id)}</span></button>`).join('');
    for (const button of this.dom.destinationChoices.querySelectorAll('[data-destination]')) {
      button.addEventListener('click', () => {
        this.simulation.guidePlayer(button.dataset.destination, button.dataset.activity);
        this.closeDestinations();
        this.render();
      });
    }
    this.dom.destinationOverlay.classList.remove('hidden');
  }

  closeDestinations() {
    this.dom.destinationOverlay.classList.add('hidden');
  }
}
