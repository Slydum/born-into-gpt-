import { SPEEDS } from './config.js';
import { RNG, storageRemove } from './utils.js';
import {
  clearLegacySaves, createNewGame, deleteSave, hasLegacySave, hasSave, loadGame, saveGame
} from './state.js';
import { Simulation } from './simulation.js';
import { Renderer } from './render.js';
import { NotificationManager, UI } from './ui.js';

const canvas = document.getElementById('game');
const menuOverlay = document.getElementById('menuOverlay');
const continueBtn = document.getElementById('continueBtn');
const mainMenuButtons = document.getElementById('mainMenuButtons');
const newGameForm = document.getElementById('newGameForm');
const howPanel = document.getElementById('howPanel');
const nameInput = document.getElementById('nameInput');
const seedInput = document.getElementById('seedInput');
const toastLayer = document.getElementById('toastLayer');
const startupError = document.getElementById('startupError');

let state = loadGame() || createNewGame('', 'born-into-preview');
let rng = new RNG(state.seed, state.rngState);
let simulation = null;
let renderer = null;
let ui = null;
let notifications = null;
let paused = false;
let menuWasPaused = false;
let gameStarted = hasSave();
let lastFrame = performance.now();
let uiAccumulator = 0;
const heldDirections = new Set();

function initializeSystems(nextState) {
  state = nextState;
  rng = new RNG(state.seed, state.rngState);
  if (!notifications) notifications = new NotificationManager(state, toastLayer, () => SPEEDS[state.speedIndex] || 1);
  else notifications.setState(state);

  simulation = new Simulation(state, rng, {
    notify: (text, type, key) => notifications.push(text, type, key),
    showEvent: event => ui?.showEvent(event),
    onStateChanged: () => ui?.render(),
    onSceneChanged: () => ui?.render()
  });

  if (!ui) ui = new UI(state, simulation);
  else {
    ui.setState(state);
    ui.simulation = simulation;
  }

  if (!renderer) renderer = new Renderer(canvas, state, simulation);
  else {
    renderer.setState(state);
    renderer.simulation = simulation;
  }
  ui.render();
  renderer.draw(0);
}

function hideMenu() {
  menuOverlay.classList.add('hidden');
  paused = menuWasPaused;
}

function showMenu() {
  menuWasPaused = paused;
  paused = true;
  menuOverlay.classList.remove('hidden');
  resetMenuPanels();
}

function resetMenuPanels() {
  mainMenuButtons.classList.remove('hidden');
  newGameForm.classList.add('hidden');
  howPanel.classList.add('hidden');
  continueBtn.hidden = !hasSave();
  continueBtn.disabled = !hasSave();
}

function startLife(nextState, isNewLife = false) {
  initializeSystems(nextState);
  gameStarted = true;
  saveGame(state);
  paused = false;
  menuWasPaused = false;
  menuOverlay.classList.add('hidden');
  ui.render();
  if (isNewLife) window.setTimeout(() => ui.showBirthIntro(), 120);
  else notifications.push('Autonomy is on. Your character will follow their routine unless you intervene.', 'important', 'autonomy-intro');
}

function showStartupError(message) {
  startupError.textContent = message;
  startupError.hidden = false;
}

initializeSystems(state);
resetMenuPanels();
if (!hasSave()) menuOverlay.classList.remove('hidden');
else menuOverlay.classList.remove('hidden');

continueBtn.addEventListener('click', () => {
  const loaded = loadGame();
  if (!loaded) {
    showStartupError('The save could not be loaded. Please begin a new life.');
    continueBtn.hidden = true;
    return;
  }
  startLife(loaded, false);
});

document.getElementById('newGameBtn').addEventListener('click', () => {
  mainMenuButtons.classList.add('hidden');
  howPanel.classList.add('hidden');
  newGameForm.classList.remove('hidden');
  nameInput.focus();
});

document.getElementById('howBtn').addEventListener('click', () => {
  mainMenuButtons.classList.add('hidden');
  newGameForm.classList.add('hidden');
  howPanel.classList.remove('hidden');
});

document.getElementById('backBtn').addEventListener('click', resetMenuPanels);
document.getElementById('howBackBtn').addEventListener('click', resetMenuPanels);
document.getElementById('randomSeedBtn').addEventListener('click', () => {
  seedInput.value = `life-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999)}`;
});

newGameForm.addEventListener('submit', event => {
  event.preventDefault();
  clearLegacySaves();
  const nextState = createNewGame(nameInput.value, seedInput.value);
  nextState.settings = {
    ...nextState.settings,
    lifeDifficulty: document.getElementById('lifeDifficultyInput')?.value || 'realistic',
    seriousIllness: document.getElementById('seriousIllnessInput')?.value || 'rare',
    unexpectedDeath: document.getElementById('unexpectedDeathInput')?.value || 'rare',
    teenPregnancy: document.getElementById('teenPregnancyInput')?.value || 'rare',
    cheating: document.getElementById('cheatingInput')?.value || 'rare',
    substanceEvents: document.getElementById('substanceInput')?.value || 'mild',
    teenRomance: document.getElementById('teenRomanceInput')?.value || 'age-appropriate',
    adultIntimacy: document.getElementById('adultIntimacyInput')?.value || 'fade'
  };
  startLife(nextState, true);
});

document.getElementById('pauseBtn').addEventListener('click', () => {
  if (!gameStarted) return;
  paused = !paused;
  document.getElementById('pauseBtn').textContent = paused ? '▶' : 'Ⅱ';
  notifications.push(paused ? 'Time paused.' : 'Time resumed.', 'routine', 'pause');
});

document.getElementById('speedBtn').addEventListener('click', () => {
  if (!gameStarted) return;
  state.speedIndex = (state.speedIndex + 1) % SPEEDS.length;
  ui.render();
  notifications.push(`Game speed: ${SPEEDS[state.speedIndex]}×.`, 'routine', 'speed');
});

document.getElementById('saveBtn').addEventListener('click', () => {
  if (!gameStarted) return;
  const ok = saveGame(state);
  notifications.push(ok ? 'Life saved.' : 'The browser could not save this life.', ok ? 'routine' : 'important', 'save');
});

document.getElementById('menuBtn').addEventListener('click', showMenu);
document.getElementById('stopBtn').addEventListener('click', () => { simulation.stopPlayer(); ui.render(); });
document.getElementById('resumeBtn').addEventListener('click', () => { simulation.resumePlayer(); ui.render(); });
document.getElementById('directBtn').addEventListener('click', () => { simulation.takeDirectControl(); ui.render(); });
document.getElementById('destinationBtn').addEventListener('click', () => ui.openDestinations());
document.getElementById('actionBtn').addEventListener('click', () => { simulation.interact(); ui.render(); });
document.getElementById('cryBtn').addEventListener('click', () => { simulation.cry(); ui.render(); });

canvas.addEventListener('pointerup', event => {
  const person = renderer.getPersonAt(event.clientX, event.clientY);
  if (person) ui.showProfile(person);
});

for (const button of document.querySelectorAll('[data-dir]')) {
  const direction = button.dataset.dir;
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    heldDirections.add(direction);
    simulation.movePlayerDirection(direction, 0.12);
    ui.render();
    button.setPointerCapture?.(event.pointerId);
  });
  const release = () => heldDirections.delete(direction);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
}

window.addEventListener('keydown', event => {
  if (event.repeat && !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(event.key)) return;
  const direction = {
    ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
    ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right'
  }[event.key];
  if (direction) {
    heldDirections.add(direction);
    event.preventDefault();
  }
  if (event.key === 'e' || event.key === 'E') simulation.interact();
  if (event.key === 'c' || event.key === 'C') simulation.cry();
  if (event.code === 'Space') {
    event.preventDefault();
    paused = !paused;
  }
});

window.addEventListener('keyup', event => {
  const direction = {
    ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
    ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right'
  }[event.key];
  if (direction) heldDirections.delete(direction);
});

window.addEventListener('beforeunload', () => {
  if (gameStarted) saveGame(state);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && gameStarted) saveGame(state);
});

function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000 || 0);
  lastFrame = now;
  if (gameStarted && !paused && menuOverlay.classList.contains('hidden') && document.getElementById('modalOverlay').classList.contains('hidden')) {
    for (const direction of heldDirections) simulation.movePlayerDirection(direction, dt);
    simulation.update(dt);
  }
  renderer.draw(dt);
  uiAccumulator += dt;
  if (uiAccumulator >= 0.2) {
    uiAccumulator = 0;
    ui.render();
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
window.__BORN_INTO_READY__ = true;

if (hasLegacySave() && !hasSave()) {
  showStartupError('V7 uses a new save format. Begin a new life to use assigned beds, second floors, persistent friendships, phones, adult siblings, move-outs, and life events.');
}
