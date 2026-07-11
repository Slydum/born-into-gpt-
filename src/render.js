import { CANVAS_HEIGHT, CANVAS_WIDTH, TILE, LOCATION_COLORS } from './config.js';
import { getFurnitureAnchor } from './state.js';
import {
  getActiveRooms, getFurnitureRects, getLocation, getSceneObjects, getVisibleResidents,
  locationLabel, nearestObject
} from './world.js';
import { clamp, formatTime, seededPhase, titleCase } from './utils.js';
import { drawTopDownCharacter } from './art.js';

const ROOM_COLORS = {
  parentBedroom: ['#dfcda8', '#e7d7b6'],
  kitchen: ['#d8cba7', '#e3d6b6'],
  livingRoom: ['#d6c6a3', '#dfcfad'],
  diningRoom: ['#d2c09a', '#dcc9a7'],
  childBedroom: ['#c8d7d1', '#d5e2dd'],
  teenBedroom: ['#c4d1dc', '#d1dde5'],
  bathroom: ['#d7e5e4', '#e3efee']
};

const SCENE_PALETTES = {
  school: ['#d8c899', '#e4d7ad'],
  workplace: ['#b7c2c4', '#c7d0d1'],
  grocery: ['#d9d0b4', '#e5ddc6'],
  furniture: ['#d6c4ad', '#e4d2bc'],
  park: ['#78a56e', '#85b178'],
  hospital: ['#d9ece5', '#e8f4ef'],
  social: ['#d6c5ae', '#e4d2ba'],
  community: ['#d1c7a7', '#dfd5b8']
};

export class Renderer {
  constructor(canvas, state, simulation) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.state = state;
    this.simulation = simulation;
    this.animationClock = 0;
    this.personHitboxes = [];
  }

  setState(state) {
    this.state = state;
  }

  draw(dt = 0) {
    this.animationClock += dt;
    this.personHitboxes = [];
    const scene = this.state.scene;
    if (scene === 'home') this.drawHome();
    else if (scene === 'town') this.drawTown();
    else this.drawInterior(scene);
    this.drawPeople(scene);
    this.drawSceneLabels(scene);
    this.drawInteraction();
  }

  drawHome() {
    const ctx = this.ctx;
    ctx.fillStyle = '#6f564d';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#eadbb7';
    ctx.fillRect(TILE, TILE, CANVAS_WIDTH - TILE * 2, CANVAS_HEIGHT - TILE * 2);

    const rooms = getActiveRooms(this.state);
    for (const room of rooms) {
      const [a, b] = ROOM_COLORS[room.id] || ['#dfd1b0', '#e7d9ba'];
      this.drawTileArea(room.x, room.y, room.w, room.h, a, b);
      ctx.strokeStyle = '#795f55';
      ctx.lineWidth = 7;
      ctx.strokeRect(room.x * TILE, room.y * TILE, room.w * TILE, room.h * TILE);
      ctx.fillStyle = 'rgba(23,32,51,.5)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(room.label.toUpperCase(), room.x * TILE + 8, room.y * TILE + 16);
    }

    this.drawInteriorDoorGaps();
    this.drawDoorOpening(11.5 * TILE, 17 * TILE, 'bottom');
    this.drawHomeWindows();
    this.drawFurniture();
    this.drawConstruction();
  }

  drawTileArea(x, y, w, h, first, second) {
    const ctx = this.ctx;
    for (let row = 0; row < h; row += 1) {
      for (let column = 0; column < w; column += 1) {
        ctx.fillStyle = (row + column) % 2 ? first : second;
        ctx.fillRect((x + column) * TILE, (y + row) * TILE, TILE, TILE);
      }
    }
  }

  drawInteriorDoorGaps() {
    const ctx = this.ctx;
    const topDoors = [4.5, 12, 18.5];
    const bottomDoors = [5, 13, 19];
    ctx.fillStyle = '#eadbb7';
    for (const x of topDoors) ctx.fillRect(x * TILE - 15, 7 * TILE - 8, 30, 16);
    for (const x of bottomDoors) ctx.fillRect(x * TILE - 15, 8 * TILE - 8, 30, 16);
    ctx.fillStyle = '#d9caab';
    ctx.fillRect(TILE, 7.25 * TILE, 20 * TILE, 0.5 * TILE);
  }

  drawHomeWindows() {
    const ctx = this.ctx;
    for (const x of [8.5, 18]) {
      ctx.fillStyle = '#b8d7d6';
      ctx.fillRect(x * TILE, TILE - 5, 3.2 * TILE, 18);
      ctx.fillStyle = '#edf7f4';
      ctx.fillRect(x * TILE + 5, TILE - 2, 3.2 * TILE - 10, 11);
    }
  }

  drawDoorOpening(x, y) {
    const ctx = this.ctx;
    ctx.fillStyle = '#eadbb7';
    ctx.fillRect(x - TILE / 2, y - 12, TILE, 18);
  }

  drawFurniture() {
    for (const item of getFurnitureRects(this.state)) this.drawFurnitureItem(item);
  }

  drawFurnitureItem(item) {
    const ctx = this.ctx;
    const x = item.x;
    const y = item.y;
    const w = item.w;
    const h = item.h;
    switch (item.id) {
      case 'parentBed':
      case 'toddlerBed':
      case 'childBed':
      case 'siblingBed':
        ctx.fillStyle = '#65483e';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = item.id === 'parentBed' ? '#8eb1bf' : '#d99b69';
        ctx.fillRect(x + 7, y + 7, w - 14, h - 12);
        ctx.fillStyle = '#edf0e8';
        ctx.fillRect(x + 8, y + 8, Math.min(25, w / 3), h - 16);
        break;
      case 'crib':
        ctx.fillStyle = '#7c5d69';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#d8b27a';
        ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
        for (let bar = 8; bar < w - 5; bar += 8) {
          ctx.fillStyle = '#f0dcaa';
          ctx.fillRect(x + bar, y + 3, 3, h - 6);
        }
        break;
      case 'dresser':
        ctx.fillStyle = '#895d50';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#c1906b';
        for (let row = 0; row < 3; row += 1) ctx.fillRect(x + 5, y + 5 + row * (h / 3), w - 10, 5);
        break;
      case 'fridge':
        ctx.fillStyle = '#e4ebe6';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#9ca9a5';
        ctx.fillRect(x + w - 7, y + 8, 3, h / 3);
        ctx.fillStyle = '#bdcbc6';
        ctx.fillRect(x, y + h * 0.58, w, 3);
        break;
      case 'stove':
        ctx.fillStyle = '#52606a';
        ctx.fillRect(x, y, w, h);
        for (let row = 0; row < 2; row += 1) for (let col = 0; col < 2; col += 1) {
          ctx.fillStyle = '#1e2631';
          ctx.beginPath();
          ctx.arc(x + 9 + col * 15, y + 9 + row * 15, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'counter':
        ctx.fillStyle = '#9a765d';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#d7c0a2';
        ctx.fillRect(x, y, w, 6);
        break;
      case 'basicTable':
      case 'diningSet':
        ctx.fillStyle = '#806047';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#573f31';
        ctx.fillRect(x + 7, y + h - 4, 5, 16);
        ctx.fillRect(x + w - 12, y + h - 4, 5, 16);
        this.drawChair(x - 13, y + h / 2 - 12);
        this.drawChair(x + w + 3, y + h / 2 - 12);
        break;
      case 'sofa':
        ctx.fillStyle = '#587d88';
        ctx.fillRect(x, y + 8, w, h - 8);
        ctx.fillStyle = '#7197a1';
        ctx.fillRect(x + 6, y, w - 12, h - 10);
        ctx.fillStyle = '#405e68';
        ctx.fillRect(x, y + h - 6, 7, 13);
        ctx.fillRect(x + w - 7, y + h - 6, 7, 13);
        break;
      case 'television':
        ctx.fillStyle = '#252b35';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#66899b';
        ctx.fillRect(x + 6, y + 5, w - 12, h - 12);
        ctx.fillStyle = '#252b35';
        ctx.fillRect(x + w / 2 - 3, y + h, 6, 12);
        break;
      case 'rug':
        ctx.fillStyle = '#b66f5a';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#d69a72';
        ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
        break;
      case 'bookshelf':
        ctx.fillStyle = '#77536a';
        ctx.fillRect(x, y, w, h);
        for (let row = 0; row < 4; row += 1) {
          ctx.fillStyle = row % 2 ? '#e2bd70' : '#9ec2a4';
          ctx.fillRect(x + 7, y + 7 + row * 15, w - 14, 8);
        }
        break;
      case 'studyDesk':
        ctx.fillStyle = '#806047';
        ctx.fillRect(x, y, w, h * 0.65);
        ctx.fillStyle = '#52758a';
        ctx.fillRect(x + w * 0.55, y - 9, 18, 14);
        ctx.fillStyle = '#5a4132';
        ctx.fillRect(x + 5, y + h * 0.65, 5, h * 0.4);
        ctx.fillRect(x + w - 10, y + h * 0.65, 5, h * 0.4);
        break;
      case 'plant':
        ctx.fillStyle = '#9a6546';
        ctx.fillRect(x + w * 0.25, y + h * 0.55, w * 0.5, h * 0.4);
        ctx.fillStyle = '#6b9b72';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h * 0.4, w * 0.35, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'toilet':
        ctx.fillStyle = '#eef2ef';
        ctx.fillRect(x + w * 0.15, y + h * 0.15, w * 0.7, h * 0.72);
        ctx.strokeStyle = '#9ca9a5'; ctx.lineWidth = 2; ctx.strokeRect(x + w * 0.15, y + h * 0.15, w * 0.7, h * 0.72);
        break;
      case 'sink':
        ctx.fillStyle = '#edf3f0'; ctx.fillRect(x, y + h * 0.2, w, h * 0.65);
        ctx.fillStyle = '#9aa9a5'; ctx.fillRect(x + w * 0.45, y, 3, h * 0.3);
        break;
      case 'shower':
        ctx.fillStyle = 'rgba(169,210,216,.45)'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#8da6aa'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#75898c'; ctx.beginPath(); ctx.arc(x + w * 0.75, y + h * 0.2, 6, 0, Math.PI * 2); ctx.fill();
        break;
      default:
        ctx.fillStyle = '#8e735c';
        ctx.fillRect(x, y, w, h);
    }
  }

  drawChair(x, y) {
    const ctx = this.ctx;
    ctx.fillStyle = '#70513e';
    ctx.fillRect(x, y, 12, 24);
    ctx.fillRect(x - 2, y - 4, 16, 6);
  }

  drawConstruction() {
    const construction = this.state.household.home.construction;
    if (!construction) return;
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(226,173,72,.24)';
    ctx.fillRect(TILE, 9 * TILE, 9 * TILE, 8 * TILE);
    ctx.strokeStyle = '#d68a35';
    ctx.lineWidth = 5;
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(TILE, 9 * TILE, 9 * TILE, 8 * TILE);
    ctx.setLineDash([]);
    ctx.fillStyle = '#172033';
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillText(`CONSTRUCTION ${Math.round(construction.progress)}%`, 2 * TILE, 13 * TILE);
  }

  drawTown() {
    const ctx = this.ctx;
    ctx.fillStyle = '#79a36c';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.drawRoads();
    for (const location of this.state.town.locations) this.drawBuilding(location);
    this.drawTownDecor();
  }

  drawRoads() {
    const ctx = this.ctx;
    ctx.fillStyle = '#7d8588';
    ctx.fillRect(0, 5.2 * TILE, CANVAS_WIDTH, 1.7 * TILE);
    ctx.fillRect(0, 11.1 * TILE, CANVAS_WIDTH, 1.7 * TILE);
    ctx.fillRect(6.2 * TILE, 0, 1.4 * TILE, CANVAS_HEIGHT);
    ctx.fillRect(14 * TILE, 0, 1.4 * TILE, CANVAS_HEIGHT);
    ctx.fillStyle = '#d3c79b';
    for (let x = 0; x < CANVAS_WIDTH; x += 42) {
      ctx.fillRect(x, 6 * TILE, 22, 3);
      ctx.fillRect(x, 12 * TILE, 22, 3);
    }
  }

  drawBuilding(location) {
    const ctx = this.ctx;
    const x = location.x * TILE;
    const y = location.y * TILE;
    const w = location.w * TILE;
    const h = location.h * TILE;
    if (location.type === 'park') {
      ctx.fillStyle = '#65a45e';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#3f7546';
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, w, h);
      for (let index = 0; index < 5; index += 1) this.drawTree(x + 22 + (index % 3) * 45, y + 22 + Math.floor(index / 3) * 45);
    } else {
      ctx.fillStyle = location.color || LOCATION_COLORS[location.type];
      ctx.fillRect(x, y + 18, w, h - 18);
      ctx.fillStyle = '#624b42';
      ctx.beginPath();
      ctx.moveTo(x - 5, y + 20);
      ctx.lineTo(x + w / 2, y - 8);
      ctx.lineTo(x + w + 5, y + 20);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#cee1df';
      ctx.fillRect(x + 14, y + 42, 28, 22);
      ctx.fillRect(x + w - 42, y + 42, 28, 22);
      ctx.fillStyle = '#4e3f39';
      ctx.fillRect((location.doorX) * TILE, (location.doorY - 1) * TILE, TILE, TILE);
    }
    ctx.fillStyle = '#172033';
    ctx.fillRect(x, y + h - 20, w, 20);
    ctx.fillStyle = '#f7f2e7';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(location.name.toUpperCase().slice(0, 20), x + 7, y + h - 6);
  }

  drawTownDecor() {
    for (let index = 0; index < 12; index += 1) {
      const x = ((index * 83 + 31) % (CANVAS_WIDTH - 40)) + 20;
      const y = ((index * 137 + 55) % (CANVAS_HEIGHT - 40)) + 20;
      const blocked = this.state.town.locations.some(location => x > location.x * TILE - 20 && x < (location.x + location.w) * TILE + 20 && y > location.y * TILE - 20 && y < (location.y + location.h) * TILE + 20);
      if (!blocked) this.drawTree(x, y);
    }
  }

  drawTree(x, y) {
    const ctx = this.ctx;
    ctx.fillStyle = '#704f3f';
    ctx.fillRect(x - 3, y + 5, 7, 16);
    ctx.fillStyle = '#47764a';
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#65935e';
    ctx.beginPath();
    ctx.arc(x - 6, y - 4, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  drawInterior(scene) {
    const [first, second] = SCENE_PALETTES[scene] || ['#d7caad', '#e3d6b9'];
    this.ctx.fillStyle = '#59636c';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.drawTileArea(1, 1, 20, 16, first, second);
    this.drawInteriorDecor(scene);
    for (const object of getSceneObjects(this.state, scene)) this.drawSceneObject(object, scene);
  }

  drawInteriorDecor(scene) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,.32)';
    for (const x of [4, 10, 16]) ctx.fillRect(x * TILE, TILE - 2, 2 * TILE, 16);
    if (scene === 'park') {
      for (let index = 0; index < 7; index += 1) this.drawTree((3 + (index % 4) * 5) * TILE, (3 + Math.floor(index / 4) * 8) * TILE);
    }
  }

  drawSceneObject(object, scene) {
    const ctx = this.ctx;
    const x = object.x - object.w / 2;
    const y = object.y - object.h / 2;
    if (object.type === 'exitTown') {
      ctx.fillStyle = '#6c5245';
      ctx.fillRect(x, y, object.w, object.h);
      return;
    }
    if (['study', 'work', 'checkout', 'furnitureShop', 'community'].includes(object.type)) {
      ctx.fillStyle = '#755841';
      ctx.fillRect(x, y, object.w, object.h);
      ctx.fillStyle = '#b99c74';
      ctx.fillRect(x + 5, y + 5, object.w - 10, 7);
      return;
    }
    if (['shelf', 'display'].includes(object.type)) {
      ctx.fillStyle = object.type === 'shelf' ? '#8c6a55' : '#756b62';
      ctx.fillRect(x, y, object.w, object.h);
      ctx.fillStyle = '#d2b66b';
      ctx.fillRect(x + 6, y + 8, object.w - 12, 7);
      return;
    }
    if (object.type === 'bench') {
      ctx.fillStyle = '#79573e';
      ctx.fillRect(x, y, object.w, object.h * 0.5);
      ctx.fillRect(x + 8, y + object.h * 0.5, 5, object.h * 0.5);
      ctx.fillRect(x + object.w - 13, y + object.h * 0.5, 5, object.h * 0.5);
    }
  }

  drawPeople(scene) {
    const family = [this.state.player, ...this.state.parents, ...this.state.siblings, this.state.nanny]
      .filter(person => person && person.location === scene && !person.carriedBy && person.alive !== false);
    for (const person of family) {
      const isPlayer = person.id === this.state.player.id;
      this.drawPerson(person, isPlayer, true);
    }
    for (const resident of getVisibleResidents(this.state, scene)) this.drawPerson(resident, false, false);
    if (this.state.player.carriedBy) {
      const carrier = [this.state.nanny, ...this.state.parents].find(item => item?.id === this.state.player.carriedBy);
      if (carrier && carrier.location === scene) this.drawCarriedBaby(carrier);
    }
  }

  residentColor(resident) {
    if (resident.stage === 'child') return '#c8916c';
    if (resident.stage === 'teen') return '#7e739e';
    if (resident.stage === 'elder') return '#9a927f';
    return '#6c9278';
  }

  drawPerson(person, isPlayer, clickable) {
    if (!person.appearance) person.appearance = { skin: '#d9a472', hair: '#4b342d', top: this.residentColor(person), bottom: '#26384a', hairStyle: 'short', accessory: 'none' };
    const sittingActivities = new Set(['breakfast','lunch','dinner','eating','familyTime','relaxing','retirement','hobby','homework','study','childcare','playing']);
    const pose = person.activity?.type === 'sleeping' ? 'sleeping' : sittingActivities.has(person.activity?.type) ? 'sitting' : 'standing';
    const box = drawTopDownCharacter(this.ctx, person, this.animationClock, { highlight: isPlayer, pose });
    if (person.activity?.type === 'cooking' || (person.activity?.type === 'hobby' && person.activity?.hobbyId === 'cooking')) this.drawActivityBubble(person, '🍳');
    if (person.activity?.type === 'working' || person.activity?.type === 'remoteWork') this.drawActivityBubble(person, '▣');
    if (person.activity?.type === 'school' || person.activity?.type === 'homework') this.drawActivityBubble(person, '✎');
    this.drawNameTag(person, box.x, box.y - box.height / 2 - 5, isPlayer);
    this.personHitboxes.push({ id: person.id, x: box.x - box.width / 2, y: box.y - box.height / 2, w: box.width, h: box.height, person, clickable: clickable || !person.id.startsWith('resident-') });
  }

  drawActivityBubble(person, symbol) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(247,242,231,.94)';
    ctx.beginPath(); ctx.arc(person.x + 15, person.y - 28, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#172033'; ctx.font = '11px system-ui, sans-serif'; ctx.fillText(symbol, person.x + 10, person.y - 24);
  }


  drawNameTag(person, x, y, isPlayer) {
    const ctx = this.ctx;
    const status = person.id.startsWith('resident-') ? person.name : person.name;
    ctx.font = '9px ui-monospace, monospace';
    const width = Math.min(160, ctx.measureText(status).width + 12);
    ctx.fillStyle = isPlayer ? '#172033' : 'rgba(23,32,51,.82)';
    ctx.fillRect(x - width / 2, y - 10, width, 14);
    ctx.fillStyle = '#f7f2e7';
    ctx.fillText(status.slice(0, 22), x - width / 2 + 6, y);
  }

  drawCarriedBaby(parent) {
    const ctx = this.ctx;
    ctx.fillStyle = '#e5b06a';
    ctx.fillRect(parent.x + 7, parent.y - 5, 10, 14);
    ctx.fillStyle = '#dba176';
    ctx.fillRect(parent.x + 9, parent.y - 10, 7, 7);
  }

  drawSceneLabels(scene) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(19,26,39,.9)';
    ctx.fillRect(16, CANVAS_HEIGHT - 38, 250, 25);
    ctx.fillStyle = '#f7f2e7';
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillText(locationLabel(this.state, scene).toUpperCase(), 28, CANVAS_HEIGHT - 21);
    if (scene === 'home') {
      ctx.fillStyle = 'rgba(19,26,39,.72)';
      ctx.fillRect(16, 14, 240, 24);
      ctx.fillStyle = '#f7f2e7';
      ctx.fillText(`${this.state.household.label.toUpperCase()} · CONDITION ${Math.round(this.state.household.home.condition)}`, 25, 30);
    }
  }

  drawInteraction() {
    if (this.state.player.controlMode !== 'direct') return;
    const object = nearestObject(this.state, this.state.player);
    if (!object) return;
    const ctx = this.ctx;
    const text = `E · ${object.label}`;
    ctx.font = '16px ui-monospace, monospace';
    const width = Math.min(CANVAS_WIDTH - 40, ctx.measureText(text).width + 38);
    ctx.fillStyle = '#172033';
    ctx.fillRect(CANVAS_WIDTH / 2 - width / 2, CANVAS_HEIGHT - 96, width, 42);
    ctx.strokeStyle = '#f7f2e7';
    ctx.lineWidth = 3;
    ctx.strokeRect(CANVAS_WIDTH / 2 - width / 2, CANVAS_HEIGHT - 96, width, 42);
    ctx.fillStyle = '#f7f2e7';
    ctx.fillText(text, CANVAS_WIDTH / 2 - width / 2 + 18, CANVAS_HEIGHT - 68);
  }

  getPersonAt(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * this.canvas.width;
    const y = ((clientY - rect.top) / rect.height) * this.canvas.height;
    const hit = [...this.personHitboxes].reverse().find(box => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
    return hit?.person || null;
  }
}
