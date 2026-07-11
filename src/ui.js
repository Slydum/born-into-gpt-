import { MAX_TOASTS, ROUTINE_TOAST_COOLDOWN_MS, SPEEDS, DAYS } from './config.js';
import { ACTIVITY_LABELS, ROOM_LABELS, TRAIT_LABELS } from './data.js';
import { getActiveRooms, getAllFamily, getPersonById, getVisibleResidents, locationLabel } from './world.js';
import { clamp, dayName, formatAge, formatTime, gameDateLabel, peso, titleCase } from './utils.js';
import { portraitMarkup } from './art.js';
import { v7PersonById } from './v7.js';

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
    this.selectedPhoneContactId = null;
    this.dom = {
      pauseBtn: el('pauseBtn'), speedBtn: el('speedBtn'), saveBtn: el('saveBtn'), menuBtn: el('menuBtn'),
      calendarLabel: el('calendarLabel'), clockLabel: el('clockLabel'), moneyTop: el('moneyTop'),
      playerName: el('playerName'), ageLabel: el('ageLabel'), stageBadge: el('stageBadge'), portrait: el('portrait'),
      dayLabel: el('dayLabel'), timeLabel: el('timeLabel'), placeLabel: el('placeLabel'), moneyLabel: el('moneyLabel'),
      needsList: el('needsList'), playerTraits: el('playerTraits'), familyList: el('familyList'), familyMood: el('familyMood'),
      objectiveTag: el('objectiveTag'), objectiveText: el('objectiveText'), scheduleText: el('scheduleText'),
      homeSummary: el('homeSummary'), homeTierLabel: el('homeTierLabel'), townSummary: el('townSummary'), socialSummary:el('socialSummary'), socialStatus:el('socialStatus'), lifeSummary:el('lifeSummary'),
      eventLog: el('eventLog'), ledgerList: el('ledgerList'),
      modeBadge: el('modeBadge'), goalLabel: el('goalLabel'), stopBtn: el('stopBtn'), resumeBtn: el('resumeBtn'),
      directBtn: el('directBtn'), destinationBtn: el('destinationBtn'), actionBtn: el('actionBtn'), cryBtn: el('cryBtn'),
      directControls: el('directControls'), mobileTabs: [...document.querySelectorAll('[data-tab]')],
      panelSections: [...document.querySelectorAll('[data-panel-section]')],
      profileOverlay: el('profileOverlay'), profileTitle: el('profileTitle'), profileBody: el('profileBody'), profileCloseBtn: el('profileCloseBtn'),
      destinationOverlay: el('destinationOverlay'), destinationChoices: el('destinationChoices'), destinationCloseBtn: el('destinationCloseBtn'),
      modalOverlay: el('modalOverlay'), modalEyebrow: el('modalEyebrow'), modalTitle: el('modalTitle'), modalBody: el('modalBody'), modalChoices: el('modalChoices'),
      phoneBtn:el('phoneBtn'), phoneOverlay:el('phoneOverlay'), phoneCloseBtn:el('phoneCloseBtn'), phoneContacts:el('phoneContacts'), phoneThread:el('phoneThread'), phoneActions:el('phoneActions'), invitePhoneBtn:el('invitePhoneBtn'), floorControls:el('floorControls')
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
    this.dom.phoneBtn?.addEventListener('click', () => this.openPhone());
    this.dom.phoneCloseBtn?.addEventListener('click', () => this.closePhone());
    this.dom.phoneOverlay?.addEventListener('click', event => { if (event.target === this.dom.phoneOverlay) this.closePhone(); });
    for (const button of document.querySelectorAll('[data-message-kind]')) button.addEventListener('click', () => this.sendPhoneMessage(button.dataset.messageKind));
    this.dom.invitePhoneBtn?.addEventListener('click', () => this.invitePhoneContact());
    for (const button of document.querySelectorAll('[data-floor]')) button.addEventListener('click', () => { if (this.simulation.changeHomeFloor(button.dataset.floor)) this.render(); });
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
    this.dom.portrait.classList.add('generated-host');
    this.dom.portrait.innerHTML = portraitMarkup(player, 'compact-portrait');
    this.dom.dayLabel.textContent = Math.floor(state.time.totalDays) + 1;
    this.dom.timeLabel.textContent = formatTime(state.time.minute);
    this.dom.placeLabel.textContent = locationLabel(state, player.location);
    this.dom.moneyLabel.textContent = peso(state.household.money);
    this.renderNeeds();
    this.renderPlayerTraits();
    this.renderFamily();
    this.renderObjective();
    this.renderHome();
    this.renderTown();
    this.renderSocial();
    this.renderLife();
    this.renderPhoneButton();
    this.renderFloorControls();
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

  renderPlayerTraits() {
    const player = this.state.player;
    const developed = (player.traits || []).map(trait => trait.label || TRAIT_LABELS[trait.id] || titleCase(trait.id));
    const seeds = Object.entries(player.traitSeeds || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, value]) => `${TRAIT_LABELS[id] || titleCase(id)} ${Math.round(value)}`);
    const hobbies = (player.hobbies || []).map(titleCase);
    const skills = Object.entries(player.skills || {}).filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([id, value]) => `${titleCase(id)} ${Math.floor(value)}`);
    this.dom.playerTraits.innerHTML = `
      <div class="trait-tags">${(developed.length ? developed : seeds).map(label => `<span>${label}</span>`).join('')}</div>
      <p><strong>Interests:</strong> ${hobbies.length ? hobbies.join(', ') : 'Still developing'}</p>
      ${skills.length ? `<p><strong>Practiced skills:</strong> ${skills.join(', ')}</p>` : '<p>Your routines and choices will turn tendencies into lasting traits.</p>'}`;
  }

  renderFamily() {
    const state = this.state;
    const relationship = state.family.relationship;
    this.dom.familyMood.textContent = relationship
      ? relationship.tension > 68 ? 'Tense' : relationship.affection > 68 ? 'Warm' : 'Steady'
      : 'Single-parent home';
    const members = [...state.parents, ...state.siblings, state.nanny, ...(state.extendedFamily || [])].filter(Boolean);
    const activeCaregiver = this.simulation.getActiveCaregiver?.();
    const familyContext = `<section class="family-context">
      <div><span>Birth order</span><strong>${state.family.birthOrder?.label || 'Child'}</strong></div>
      <div><span>Childcare plan</span><strong>${state.family.childcare?.label || 'Family care'}</strong></div>
      <div><span>Active caregiver</span><strong>${activeCaregiver ? activeCaregiver.name : 'No one available'}</strong></div>
      <p>${state.family.childcare?.reason || ''}</p>
    </section>`;
    this.dom.familyList.innerHTML = familyContext + members.map(person => {
      const status = person.alive === false ? `Deceased${person.deathDay != null ? ` · Day ${person.deathDay + 1}` : ''}` : person.movedOut ? person.residence || 'Lives elsewhere' : this.simulation.getPersonStatus(person);
      const isParent = state.parents.some(parent => parent.id === person.id);
      const role = isParent
        ? `${person.alive === false ? (person.formerJob?.label || 'Parent') : (person.job?.label || 'Caregiver')} · ${formatAge(person.age)}`
        : person.role === 'Nanny'
          ? `${person.job?.label || 'Nanny'} · ${formatAge(person.age)}`
          : `Sibling · ${formatAge(person.age)}${person.movedOut ? ` · ${person.residence}` : ''}`;
      return `<button type="button" class="family-card" data-person-id="${person.id}">
        <span class="family-avatar">${portraitMarkup(person, 'mini-portrait')}</span>
        <span class="family-copy"><strong>${person.name}</strong><small>${role}</small></span>
        <span class="family-action">${status}</span>
      </button>`;
    }).join('');
    if (state.family.history?.length) {
      this.dom.familyList.insertAdjacentHTML('beforeend', `<section class="family-history"><h4>Family history</h4>${state.family.history.slice(0, 5).map(item => `<p>• ${item}</p>`).join('')}</section>`);
    }
    for (const button of this.dom.familyList.querySelectorAll('[data-person-id]')) {
      button.addEventListener('click', () => this.showProfile(v7PersonById(state, button.dataset.personId)));
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
    const day = `${dayName(this.state.time.totalDays)}, Day ${Math.floor(this.state.time.totalDays)+1} at ${formatTime(this.state.time.minute)}`;
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
    const chores = home.chores || {};
    const meal = home.meal || {};
    this.dom.homeTierLabel.textContent = `${state.activeResidenceId==='familyHome'?state.household.label:(state.player.residence||state.household.label)} · ${home.layoutLabel || home.label || 'Home plan'}`;
    const rooms = getActiveRooms(state).map(room => ROOM_LABELS[room.id] || room.label);
    const assignments=[state.player,...state.parents,...state.siblings,state.nanny].filter(Boolean).filter(person=>person.alive!==false && (person.currentResidenceId||person.officialResidenceId||'familyHome')===(state.activeResidenceId||'familyHome')).map(person=>({person,room:home.roomAssignments?.[person.id],bed:home.bedAssignments?.[person.id]}));
    const wishlist = home.wishlist.slice(0, 5);
    const project = home.construction
      ? `<div class="home-project"><strong>${home.construction.label}</strong><span>${Math.round(home.construction.progress)}% · completes around Day ${home.construction.dueDay + 1}</span></div>`
      : home.deliveries.length
        ? `<div class="home-project"><strong>Delivery pending</strong><span>${home.deliveries.map(item => item.label).join(', ')}</span></div>`
        : '<div class="home-project"><strong>No active construction</strong><span>The family evaluates space, hobbies, and chores every day.</span></div>';
    const mealLabel = ['idle','cleared'].includes(meal.phase) ? 'No meal currently served' : `${titleCase(meal.type || 'meal')} · ${titleCase(meal.phase)}`;
    const cook = meal.cookId ? getPersonById(state, meal.cookId) : null;
    const equipment = [...new Set([...(home.hobbies?.equipment || []), ...home.furniture.filter(item => ['exerciseMat','dumbbells','easel','keyboard','sewingKit','gardenKit','gameConsole'].includes(item.id)).map(item => item.id)])];
    const artworks = (home.hobbies?.artworks || []).slice(-4).reverse();
    this.dom.homeSummary.innerHTML = `
      <div class="home-metrics">${percentBar('Condition', home.condition)}${percentBar('Cleanliness', home.cleanliness)}</div>
      <div class="house-life-grid">
        <div><span>House layout</span><strong>${home.layoutLabel || home.layoutId || 'Family home'}</strong></div>
        <div><span>Current meal</span><strong>${mealLabel}</strong></div>
        <div><span>Cooking</span><strong>${cook ? cook.name.split(' ')[0] : 'Nobody'}</strong></div>
        <div><span>Food portions</span><strong>${state.household.food}</strong></div>
        <div><span>Dirty dishes</span><strong>${chores.dirtyDishes || 0}</strong></div>
        <div><span>Laundry</span><strong>${chores.laundryLoads || 0} load${chores.laundryLoads === 1 ? '' : 's'}</strong></div>
        <div><span>Trash</span><strong>${chores.trash || 0}</strong></div>
        <div><span>Floor mess</span><strong>${Math.round(chores.floorMess || 0)}%</strong></div>
      </div>
      ${project}
      <h4>Visible floor</h4><p><strong>${(home.currentFloor||0)===0?'Ground Floor':'Second Floor'}</strong> · ${rooms.join(' · ')}</p>
      <h4>Room and bed assignments</h4><div class="assignment-list">${assignments.map(({person,room,bed})=>`<div><strong>${person.name.split(' ')[0]}</strong><span>${room ? titleCase(room.replace(/([A-Z])/g,' $1')) : 'No room'} · ${bed?.furnitureId ? titleCase(bed.furnitureId.replace(/([A-Z])/g,' $1')) : 'No assigned bed'}</span></div>`).join('')}</div>
      ${!home.floors?.some(floor=>floor.id===1&&floor.active) && !home.construction ? `<button type="button" id="requestSecondFloorBtn" class="secondary-inline-btn">Request second-floor project</button>` : ''}
      <h4>Hobby equipment</h4><p>${equipment.length ? equipment.map(id => titleCase(id.replace(/([A-Z])/g,' $1'))).join(' · ') : 'The family has not bought dedicated hobby equipment yet.'}</p>
      <h4>Paintings and crafts</h4>
      ${artworks.length ? `<div class="art-list">${artworks.map(item => `<div class="art-row"><span><strong>${item.title}</strong><small>${item.creator.split(' ')[0]} · quality ${Math.round(item.quality)}</small></span><strong>${item.sold ? 'Sold' : peso(item.value)}</strong></div>`).join('')}</div>` : '<p class="empty-copy">No finished artwork yet.</p>'}
      <h4>Household wishlist</h4>
      ${wishlist.length ? `<ol class="wishlist">${wishlist.map(item => `<li><strong>${item.label}</strong><span>${peso(item.cost)} · ${item.reason || 'Optional upgrade'}</span></li>`).join('')}</ol>` : '<p class="empty-copy">No urgent purchases right now.</p>'}
      <h4>Childcare arrangement</h4><p><strong>${state.family.childcare?.label || 'Family care'}</strong><br>${state.family.childcare?.reason || ''}</p>
      <h4>Family planning</h4><p>${state.family.pregnancy ? `A baby is expected around day ${state.family.pregnancy.dueDay + 1}.` : `The parents currently hope for about ${state.family.desiredChildren} child${state.family.desiredChildren === 1 ? '' : 'ren'}.`}</p>
    `;
    el('requestSecondFloorBtn')?.addEventListener('click', () => {
      const ok=this.simulation.requestSecondFloor();
      if (!ok) this.showEvent({eyebrow:'HOME PLAN',title:'Second floor not available yet',body:'The household needs enough savings and no other active project.',choices:[{label:'Okay'}]});
      this.render();
    });
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


  renderSocial() {
    if (!this.dom.socialSummary) return;
    const player=this.state.player;
    const rels=[...(player.relationships||[])].sort((a,b)=>(b.affection||0)-(a.affection||0));
    const friends=rels.filter(rel=>['friend','close friend'].includes(rel.type));
    const acquaintances=rels.filter(rel=>rel.type==='acquaintance');
    const roster=(this.state.social.classRoster||[]).map(id=>this.state.town.residents.find(person=>person.id===id)).filter(Boolean);
    this.dom.socialStatus.textContent=friends.length?`${friends.length} friend${friends.length===1?'':'s'}`:'Looking for connection';
    this.dom.socialSummary.innerHTML=`
      <div class="social-metrics"><div><span>Social fulfillment</span><strong>${Math.round(player.socialNeed||0)}/100</strong></div><div><span>Friends</span><strong>${friends.length}</strong></div><div><span>Acquaintances</span><strong>${acquaintances.length}</strong></div></div>
      <h4>Relationships</h4>
      <div class="relationship-list">${rels.length?rels.slice(0,10).map(rel=>{const person=v7PersonById(this.state,rel.id);return `<button type="button" data-social-person="${rel.id}"><strong>${person?.name||rel.name||'Someone'}</strong><span>${titleCase(rel.type||'stranger')} · familiarity ${Math.round(rel.familiarity||0)} · affection ${Math.round(rel.affection||0)} · trust ${Math.round(rel.trust||0)}</span></button>`}).join(''):'<p class="empty-copy">No relationships yet. School, clubs, parks, family visits, and messages create opportunities.</p>'}</div>
      <h4>Persistent classmates</h4><div class="class-roster">${roster.map(person=>`<button type="button" data-social-person="${person.id}"><strong>${person.name}</strong><span>${titleCase(person.stage)} · ${(person.hobbies||[]).map(titleCase).slice(0,2).join(', ')}</span></button>`).join('')||'<p class="empty-copy">Classmates appear when school begins.</p>'}</div>
      <h4>Clubs</h4>${(this.state.social.clubs||[]).length?this.state.social.clubs.map(club=>`<p>• <strong>${club.label}</strong> · ${club.memberIds.length} recurring members</p>`).join(''):'<p class="empty-copy">Clubs unlock as interests develop.</p>'}
      <h4>Plans & invitations</h4>${(this.state.social.invitations||[]).length?this.state.social.invitations.slice(-5).reverse().map(plan=>`<p>• ${v7PersonById(this.state,plan.contactId)?.name||'Someone'} · ${titleCase(plan.status)} · Day ${plan.day+1} at ${plan.location}</p>`).join(''):'<p class="empty-copy">No plans yet.</p>'}`;
    for(const button of this.dom.socialSummary.querySelectorAll('[data-social-person]')) button.addEventListener('click',()=>this.showProfile(v7PersonById(this.state,button.dataset.socialPerson)));
  }

  renderLife() {
    if (!this.dom.lifeSummary) return;
    const events=this.state.events?.history||[];
    const milestones=this.state.player.romance?.milestones||[];
    const adulthood=this.state.adulthood?.transitions?.[this.state.player.id];
    this.dom.lifeSummary.innerHTML=`
      <div class="life-state-grid"><div><span>Current mood</span><strong>${this.state.player.moodState?.label||'Content'}</strong></div><div><span>Health</span><strong>${this.state.player.health?.status||'Well'}</strong></div><div><span>Residence</span><strong>${this.state.player.residence||'Family home'}</strong></div><div><span>Adult path</span><strong>${adulthood?.path?titleCase(adulthood.path):'Not chosen'}</strong></div></div>
      ${this.state.player.moodState?.reasons?.length?`<p><strong>Mood reasons:</strong> ${this.state.player.moodState.reasons.join(' · ')}</p>`:''}
      <h4>Romantic milestones</h4>${milestones.length?milestones.slice().reverse().map(item=>`<p>• ${titleCase(item.type.replaceAll('-',' '))} · Day ${item.day+1} · ${v7PersonById(this.state,item.personId)?.name||''}</p>`).join(''):'<p class="empty-copy">Crushes, dates, and age-appropriate milestones can develop from real relationships.</p>'}
      <h4>Major life events</h4>${events.length?events.slice(0,12).map(event=>`<article class="life-event-card"><small>Day ${event.day+1} · ${titleCase(event.type.replaceAll('-',' '))}</small><strong>${event.label}</strong></article>`).join(''):'<p class="empty-copy">No major events yet.</p>'}
      <h4>Event settings</h4><p>${Object.entries(this.state.settings||{}).map(([key,value])=>`${titleCase(key.replace(/([A-Z])/g,' $1'))}: ${titleCase(value)}`).join(' · ')}</p>`;
  }

  renderPhoneButton() {
    if (!this.dom.phoneBtn) return;
    this.dom.phoneBtn.hidden=!this.state.phone?.unlocked;
  }

  renderFloorControls() {
    if (!this.dom.floorControls) return;
    const home=this.state.household.home;
    const hasSecond=home.floors?.some(floor=>floor.id===1&&floor.active);
    this.dom.floorControls.hidden=!hasSecond || this.state.scene!=='home';
    for(const button of this.dom.floorControls.querySelectorAll('[data-floor]')) button.classList.toggle('active',Number(button.dataset.floor)===(home.currentFloor||0));
  }

  openPhone() {
    if (!this.state.phone?.unlocked) return;
    this.renderPhone();
    this.dom.phoneOverlay.classList.remove('hidden');
  }

  closePhone() { this.dom.phoneOverlay?.classList.add('hidden'); }

  renderPhone() {
    const ids=[...new Set([...(this.state.social.contacts||[]),...(this.state.extendedFamily||[]).map(person=>person.id)])];
    const contacts=ids.map(id=>v7PersonById(this.state,id)).filter(Boolean);
    this.dom.phoneContacts.innerHTML=contacts.length?contacts.map(person=>`<button type="button" data-phone-contact="${person.id}" class="${person.id===this.selectedPhoneContactId?'active':''} ${person.alive===false?'memorialized':''}"><strong>${person.name}</strong><span>${person.alive===false?'Memorialized contact':`${person.role||titleCase(person.stage)} · ${person.residence||'Nearby'}`}</span></button>`).join(''):'<p class="empty-copy">Contacts appear after exchanging numbers or through family.</p>';
    for(const button of this.dom.phoneContacts.querySelectorAll('[data-phone-contact]')) button.addEventListener('click',()=>{this.selectedPhoneContactId=button.dataset.phoneContact;this.renderPhone();});
    const selected=v7PersonById(this.state,this.selectedPhoneContactId);
    this.dom.phoneActions.hidden=!selected || selected.alive===false;
    if (!selected) {this.dom.phoneThread.innerHTML='<p class="empty-copy">Choose a contact.</p>';return;}
    const thread=this.state.social.threads?.[selected.id]||[];
    const availability=selected.alive===false?'Memorialized contact':selected.activity?.type==='working'?'At work':selected.activity?.type==='sleeping'?'Sleeping':((selected.currentResidenceId||selected.officialResidenceId)===(this.state.player.currentResidenceId||this.state.player.officialResidenceId)&&selected.location==='home'&&this.state.player.location==='home'?'In the same home':'Available later');
    this.dom.phoneThread.innerHTML=`<header class="thread-header"><strong>${selected.name}</strong><span>${availability}</span></header><div class="messages">${thread.length?thread.filter(message=>message.stamp<=this.state.time.totalDays*1440+this.state.time.minute||!message.pending).map(message=>`<p class="${message.from===this.state.player.id?'sent':'received'}">${message.text}</p>`).join(''):'<p class="empty-copy">No messages yet.</p>'}${selected.alive===false?'<p class="empty-copy">This conversation is archived. New messages cannot be sent.</p>':''}</div>`;
  }

  sendPhoneMessage(kind) {
    if (!this.selectedPhoneContactId) return;
    const result=this.simulation.sendPhoneMessage(this.selectedPhoneContactId,kind);
    if (result?.text) this.showEvent({eyebrow:'PHONE',title:result.ok?'Message sent':'Cannot send',body:result.text,choices:[{label:'Okay'}]});
    this.renderPhone(); this.renderSocial();
  }

  invitePhoneContact() {
    if (!this.selectedPhoneContactId) return;
    const result=this.simulation.inviteContact(this.selectedPhoneContactId);
    if (result?.text) this.showEvent({eyebrow:'INVITATION',title:result.ok?'Invitation update':'Cannot invite',body:result.text,choices:[{label:'Okay'}]});
    this.renderPhone(); this.renderSocial();
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

  showBirthIntro() {
    const intro = this.state.family.intro;
    if (!intro || this.state.flags.introShown) return;
    this.state.flags.introShown = true;
    const steps = [
      { eyebrow: 'YOUR BEGINNING', title: intro.birthTitle, body: intro.birthBody },
      { eyebrow: 'YOUR FAMILY', title: intro.familyTitle, body: intro.familyBody },
      { eyebrow: 'YOUR HOME', title: intro.homeTitle, body: intro.homeBody }
    ];
    const showStep = index => {
      const step = steps[index];
      this.showEvent({
        ...step,
        choices: [{ label: index === steps.length - 1 ? 'Begin your life' : 'Continue', action: () => { if (index < steps.length - 1) window.setTimeout(() => showStep(index + 1), 0); } }]
      });
    };
    showStep(0);
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
    const isNanny = person.role === 'Nanny';
    const isAwaySibling = person.role==='Sibling' && person.movedOut;
    this.dom.profileTitle.textContent = person.name;
    const traits = person.traits && !Array.isArray(person.traits) ? person.traits : person.traitSeeds || {};
    const acquiredTraits = Array.isArray(person.traits) ? person.traits : [];
    const relationshipRows = (person.relationships || []).slice(0,6).map(rel => `<div class="relationship-chip"><strong>${rel.name || getPersonById(this.state,rel.id)?.name || 'Someone'}</strong><span>${titleCase(rel.type || 'acquaintance')} · affection ${Math.round(rel.affection || 0)} · trust ${Math.round(rel.trust || 0)}</span></div>`).join('');
    const traitRows = Object.entries(traits).slice(0, 10).map(([key, value]) => traitMeter(TRAIT_LABELS[key] || titleCase(key), value)).join('');
    const needs = person.needs ? [
      percentBar('Energy', person.needs.energy), percentBar('Food', person.needs.satiety),
      percentBar('Mood', person.needs.mood), percentBar('Stress safety', 100 - (person.needs.stress || 0))
    ].join('') : '';
    const relationship = isParent && this.state.family.relationship ? `
      <div class="profile-grid"><div><span>Affection</span><strong>${Math.round(this.state.family.relationship.affection)}</strong></div><div><span>Trust</span><strong>${Math.round(this.state.family.relationship.trust)}</strong></div><div><span>Tension</span><strong>${Math.round(this.state.family.relationship.tension)}</strong></div></div>` : '';
    this.dom.profileBody.innerHTML = `
      <div class="profile-hero"><div class="profile-avatar portrait-profile">${portraitMarkup(person, 'profile-portrait')}</div><div><span class="stage-badge">${titleCase(person.stage)}</span><h3>${isPlayer ? 'Your character' : isParent ? 'Parent' : isNanny ? 'Nanny' : isResident ? 'Town resident' : isAwaySibling ? 'Older sibling living away' : 'Sibling'}</h3><p>Age ${formatAge(person.age)} · ${person.alive===false?'Deceased':person.movedOut ? person.residence : locationLabel(this.state, person.location || 'home')}</p></div></div>
      <div class="profile-status"><span>Current activity</span><strong>${person.alive===false?'Deceased':isResident ? person.job?.label || 'Following a town routine' : this.simulation.getPersonStatus(person)}</strong></div>
      ${person.job ? `<div class="profile-status"><span>Job</span><strong>${person.job.label}</strong><small>${titleCase(person.job.schedule)} schedule · ${person.role === 'Nanny' ? `${peso(person.salaryPerDay || 0)} per day` : person.job.pay ? `${peso(person.job.pay[0])}–${peso(person.job.pay[1])} per shift` : ''}</small></div>` : ''}
      <div class="profile-grid"><div><span>Mood</span><strong>${person.moodState?.label||'Content'}</strong></div><div><span>Health</span><strong>${person.health?.status||'Well'}</strong></div><div><span>Residence</span><strong>${person.residence||'Family home'}</strong></div></div>
      ${person.health?.conditions?.length?`<div class="profile-warning"><strong>Health conditions</strong><span>${person.health.conditions.map(item=>item.label).join(' · ')}</span></div>`:''}
      ${person.health?.disability?`<div class="profile-warning"><strong>Disability</strong><span>${person.health.disability.label}</span></div>`:''}
      ${person.romance?.status && person.romance.status!=='single'?`<div class="profile-status"><span>Relationship</span><strong>${titleCase(person.romance.status)} with ${v7PersonById(this.state,person.romance.partnerId)?.name||'someone'}</strong></div>`:''}
      ${person.hobbies?.length ? `<div class="profile-status"><span>Hobbies and interests</span><strong>${person.hobbies.map(titleCase).join(' · ')}</strong><small>${Object.entries(person.skills || {}).filter(([,value]) => value > 0).map(([key,value]) => `${titleCase(key)} ${Math.round(value)}`).join(' · ') || 'Skills grow through practice.'}</small></div>` : ''}
      ${acquiredTraits.length ? `<h4>Developed traits</h4><div class="trait-tags">${acquiredTraits.map(item => `<span>${item.label || titleCase(item.id)}</span>`).join('')}</div>` : ''}
      ${needs ? `<h4>Needs</h4><div class="bars">${needs}</div>` : ''}
      ${traitRows ? `<h4>Personality</h4><div class="trait-list">${traitRows}</div>` : ''}
      ${relationship}
      ${relationshipRows ? `<h4>Relationships</h4><div class="relationship-list">${relationshipRows}</div>` : ''}
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
