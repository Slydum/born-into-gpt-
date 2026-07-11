import { CANVAS_HEIGHT, CANVAS_WIDTH, TILE, LOCATION_COLORS } from './config.js';
import { getFurnitureAnchor } from './state.js';
import {
  getActiveRooms, getFurnitureRects, getLocation, getSceneObjects, getVisibleResidents,
  locationLabel, nearestObject
} from './world.js';
import { clamp, formatTime, seededPhase, titleCase } from './utils.js';
import { drawTopDownCharacter } from './art.js';
import { assignedSleepPosition, assignedSeatPosition } from './v7.js';
import { FURNITURE_SPRITES, preloadFurnitureSprites, resolveFurnitureSprite, drawFurnitureSprite } from './furniture.js';

const ROOM_COLORS = {
  parentBedroom: ['#dfcda8', '#e7d7b6'],
  kitchen: ['#d8cba7', '#e3d6b6'],
  livingRoom: ['#d6c6a3', '#dfcfad'],
  diningRoom: ['#d2c09a', '#dcc9a7'],
  childBedroom: ['#c8d7d1', '#d5e2dd'],
  teenBedroom: ['#c4d1dc', '#d1dde5'],
  bathroom: ['#d7e5e4', '#e3efee'],
  upperLanding: ['#d8d0bc','#e5ddcb'], upperBedroomA:['#c9d8df','#d7e4ea'], upperBedroomB:['#d8cadd','#e5d7e8'], upperHobbyRoom:['#d9d3ad','#e7e0bd'], upperBathroom:['#d7e5e4','#e3efee'],
  adultBedroom:['#d7d2c3','#e5dfd0'], roommateBedroom:['#ccd7d0','#d9e3dd'], guestBedroom:['#ddd3c5','#e8dfd2']
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
    this.furnitureSprites = preloadFurnitureSprites();
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
    this.drawSpeechBubbles(scene);
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
    if ((this.state.household.home.currentFloor || 0) === 0) this.drawDoorOpening(11.5 * TILE, 17 * TILE, 'bottom');
    this.drawHomeWindows();
    this.drawFurniture();
    this.drawStairs();
    this.drawHouseholdLife();
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
    ctx.fillStyle = '#eadbb7';
    for (const room of getActiveRooms(this.state)) {
      const door = room.door;
      if (!door) continue;
      const x = door.x * TILE;
      const y = door.y * TILE;
      if (door.edge === 'left' || door.edge === 'right') ctx.fillRect(x - 8, y - 15, 16, 30);
      else ctx.fillRect(x - 15, y - 8, 30, 16);
    }
    if ((this.state.household.home.currentFloor || 0) === 0) { const entrance = this.state.household.home.entrance || { x: 11.5, y: 16.5 }; ctx.fillRect(entrance.x * TILE - 16, entrance.y * TILE - 12, 32, 20); }
  }

  drawHomeWindows() {
    const ctx = this.ctx;
    for (const room of getActiveRooms(this.state)) {
      if (room.id === 'bathroom') continue;
      const x = (room.x + Math.min(room.w - 1.5, Math.max(1, room.w * .55))) * TILE;
      const y = room.y * TILE - 5;
      ctx.fillStyle = '#b8d7d6';
      ctx.fillRect(x, y, Math.min(2.4, room.w * .35) * TILE, 18);
      ctx.fillStyle = '#edf7f4';
      ctx.fillRect(x + 5, y + 3, Math.min(2.4, room.w * .35) * TILE - 10, 10);
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
    const spriteKey = resolveFurnitureSprite(item, this.state);
    const spriteInfo = spriteKey ? FURNITURE_SPRITES[spriteKey] : null;
    const spriteImage = spriteKey ? this.furnitureSprites.get(spriteKey) : null;
    if (spriteKey && spriteImage?.complete && spriteImage.naturalWidth) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      const drawn = drawFurnitureSprite(ctx, spriteImage, spriteInfo, {x,y,w,h});
      ctx.restore();
      if (drawn) return;
    }
    switch (item.id) {
      case 'parentBed':
      case 'toddlerBed':
      case 'childBed':
      case 'siblingBed':
      case 'teenBed':
      case 'upperBedA':
      case 'upperBedB':
      case 'nannyBed':
      case 'bunkBed':
      case 'apartmentBed':
      case 'roommateBed':
      case 'guestBed':
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
      case 'laundryBasket':
        ctx.fillStyle='#9b7658'; ctx.fillRect(x,y,w,h); ctx.fillStyle='#d8bd96';
        for(let i=4;i<w-3;i+=7) ctx.fillRect(x+i,y+3,2,h-6); break;
      case 'washingMachine':
      case 'dishwasher':
        ctx.fillStyle='#d9dfdc'; ctx.fillRect(x,y,w,h); ctx.fillStyle='#68757a'; ctx.beginPath(); ctx.arc(x+w/2,y+h*.58,Math.min(w,h)*.28,0,Math.PI*2); ctx.fill(); break;
      case 'dishRack':
        ctx.fillStyle='#a77f5e'; ctx.fillRect(x,y+h*.55,w,h*.25); ctx.strokeStyle='#dce6e2'; ctx.lineWidth=2;
        for(let i=5;i<w-3;i+=8){ctx.beginPath();ctx.moveTo(x+i,y+h*.15);ctx.lineTo(x+i,y+h*.65);ctx.stroke();} break;
      case 'exerciseMat':
        ctx.fillStyle='#6e8f99'; ctx.fillRect(x,y,w,h); ctx.strokeStyle='#4f6f78'; ctx.strokeRect(x,y,w,h); break;
      case 'dumbbells':
        ctx.fillStyle='#39414b'; ctx.fillRect(x+w*.2,y+h*.43,w*.6,h*.14); ctx.fillRect(x,y+h*.2,w*.22,h*.6); ctx.fillRect(x+w*.78,y+h*.2,w*.22,h*.6); break;
      case 'easel':
        ctx.strokeStyle='#806044'; ctx.lineWidth=5; ctx.beginPath(); ctx.moveTo(x+w*.5,y);ctx.lineTo(x+w*.15,y+h);ctx.moveTo(x+w*.5,y);ctx.lineTo(x+w*.85,y+h);ctx.stroke();
        ctx.fillStyle='#e7d5ae'; ctx.fillRect(x+w*.18,y+h*.12,w*.64,h*.55); ctx.fillStyle='#b86658'; ctx.fillRect(x+w*.3,y+h*.3,w*.18,h*.18); break;
      case 'keyboard':
        ctx.fillStyle='#343943'; ctx.fillRect(x,y,w,h); for(let i=3;i<w-3;i+=7){ctx.fillStyle='#f2eee4';ctx.fillRect(x+i,y+h*.35,5,h*.55);} break;
      case 'sewingKit':
        ctx.fillStyle='#b77a72'; ctx.fillRect(x,y,w,h); ctx.fillStyle='#f3d7cc'; ctx.fillRect(x+5,y+5,w-10,h-10); break;
      case 'gardenKit':
        ctx.fillStyle='#7d5b43';ctx.fillRect(x,y+h*.55,w,h*.45);ctx.fillStyle='#5d8f58';ctx.beginPath();ctx.arc(x+w*.5,y+h*.35,w*.28,0,Math.PI*2);ctx.fill();break;
      case 'gameConsole':
        ctx.fillStyle='#303640';ctx.fillRect(x,y,w,h);ctx.fillStyle='#7da4b2';ctx.fillRect(x+w*.25,y+h*.3,w*.5,h*.35);break;
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

  drawHouseholdLife() {
    const ctx = this.ctx;
    const home = this.state.household.home;
    const meal = home.meal;
    const table = getFurnitureRects(this.state).find(item => ['diningSet','basicTable'].includes(item.id));
    if (table && ['ready','eating'].includes(meal?.phase)) {
      const servings = Math.max(1, meal.attendees?.length || 3);
      for (let i=0;i<Math.min(servings,6);i+=1) {
        const px = table.x + 13 + (i%3)*Math.max(16,(table.w-26)/3);
        const py = table.y + 10 + Math.floor(i/3)*Math.max(18,table.h-20);
        ctx.fillStyle='#f4eee2'; ctx.beginPath();ctx.arc(px,py,6,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=meal.phase==='ready'||meal.phase==='eating'?'#c98652':'#9b8c72';ctx.beginPath();ctx.arc(px,py,3.5,0,Math.PI*2);ctx.fill();
      }
    }
    const chores = home.chores || {};
    if ((chores.dirtyDishes||0)>0) {
      const rack=getFurnitureRects(this.state).find(item=>item.id==='dishRack');
      if(rack){ctx.fillStyle='#f0eee5';for(let i=0;i<Math.min(5,chores.dirtyDishes);i++){ctx.beginPath();ctx.arc(rack.x+8+i*7,rack.y+4,4,0,Math.PI*2);ctx.fill();}}
    }
  }


  drawStairs() {
    const home=this.state.household.home;
    if (!home.stairs?.active) return;
    const floor=home.currentFloor || 0;
    const stair=floor===0?home.stairs.ground:home.stairs.upper;
    const ctx=this.ctx; const x=stair.x*TILE-20; const y=stair.y*TILE-22;
    ctx.fillStyle='#806b59'; ctx.fillRect(x,y,40,44);
    for(let i=0;i<5;i+=1){ctx.fillStyle=i%2?'#b49674':'#c5a985';ctx.fillRect(x+4,y+5+i*7,32,5);}
    ctx.fillStyle='#172033';ctx.font='9px ui-monospace, monospace';ctx.fillText(floor===0?'UP':'DOWN',x+8,y+40);
  }

  drawSpeechBubbles(scene) {
    const ctx = this.ctx;
    const stamp = this.state.time.totalDays * 1440 + this.state.time.minute;
    const family = [this.state.player, ...this.state.parents, ...this.state.siblings, this.state.nanny].filter(Boolean);
    const residentViews = getVisibleResidents(this.state, scene);
    const people = new Map([...family, ...residentViews].map(person => [person.id, person]));
    const bubbles = [...(this.state.household.home.speech || []), ...(this.state.social?.speech || [])];
    for (const bubble of bubbles) {
      if (bubble.untilStamp < stamp) continue;
      const person = people.get(bubble.personId);
      if (!person || person.location !== scene) continue;
      const text = String(bubble.text).slice(0, 34);
      ctx.font = '11px system-ui, sans-serif';
      const width = Math.min(190, ctx.measureText(text).width + 18);
      const x = clamp(person.x - width / 2, 6, CANVAS_WIDTH - width - 6);
      const y = Math.max(8, person.y - 58);
      ctx.fillStyle = 'rgba(247,242,231,.96)';
      ctx.fillRect(x, y, width, 25);
      ctx.strokeStyle = '#172033'; ctx.lineWidth = 2; ctx.strokeRect(x, y, width, 25);
      ctx.fillStyle = '#172033'; ctx.fillText(text, x + 9, y + 17);
    }
  }

  drawConstruction() {
    const construction = this.state.household.home.construction;
    if (!construction || (construction.floor ?? 0) !== (this.state.household.home.currentFloor ?? 0)) return;
    const room = this.state.household.home.rooms.find(item => item.id === construction.roomId) || {x:1,y:9,w:8,h:7};
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(226,173,72,.24)';
    ctx.fillRect(room.x*TILE, room.y*TILE, room.w*TILE, room.h*TILE);
    ctx.strokeStyle = '#d68a35'; ctx.lineWidth = 5; ctx.setLineDash([12,8]);
    ctx.strokeRect(room.x*TILE, room.y*TILE, room.w*TILE, room.h*TILE); ctx.setLineDash([]);
    ctx.fillStyle = '#172033'; ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillText(`CONSTRUCTION ${Math.round(construction.progress)}%`, room.x*TILE+12, (room.y+room.h/2)*TILE);
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
    const currentFloor=this.state.household.home.currentFloor || 0;
    const activeResidence = this.state.activeResidenceId || 'familyHome';
    const family = [this.state.player, ...this.state.parents, ...this.state.siblings, this.state.nanny]
      .filter(person => person && person.location === scene && !person.carriedBy && person.alive !== false)
      .filter(person => scene !== 'home' || ((person.currentResidenceId || person.officialResidenceId || 'familyHome') === activeResidence && (person.floor ?? 0) === currentFloor));
    for (const person of family) {
      const isPlayer = person.id === this.state.player.id;
      this.drawPerson(person, isPlayer, true);
    }
    for (const resident of getVisibleResidents(this.state, scene)) this.drawPerson(resident, false, false);
    if (this.state.player.carriedBy) {
      const carrier = [this.state.nanny, ...this.state.parents].find(item => item?.id === this.state.player.carriedBy);
      if (carrier && carrier.location === scene && (scene !== 'home' || (carrier.currentResidenceId || carrier.officialResidenceId || 'familyHome') === (this.state.activeResidenceId || 'familyHome'))) this.drawCarriedBaby(carrier);
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
    const original={x:person.x,y:person.y};
    if (person.location==='home' && person.activity?.type==='sleeping') {
      const pos=assignedSleepPosition(this.state,person); if(pos){person.x=pos.x;person.y=pos.y;}
    } else if (person.location==='home' && ['familyMeal','breakfast','lunch','dinner','eating'].includes(person.activity?.type)) {
      const pos=assignedSeatPosition(this.state,person); if(pos){person.x=pos.x;person.y=pos.y;}
    }
    const sittingActivities = new Set(['breakfast','lunch','dinner','eating','familyMeal','familyTime','conversation','relaxing','retirement','hobby','homework','study','childcare','playing']);
    const pose = person.activity?.type === 'sleeping' ? 'sleeping' : sittingActivities.has(person.activity?.type) ? 'sitting' : 'standing';
    const box = drawTopDownCharacter(this.ctx, person, this.animationClock, { highlight: isPlayer, pose });
    if (person.activity?.type === 'cooking' || (person.activity?.type === 'hobby' && person.activity?.hobbyId === 'cooking')) this.drawActivityBubble(person, '🍳');
    if (person.activity?.type === 'working' || person.activity?.type === 'remoteWork') this.drawActivityBubble(person, '▣');
    if (person.activity?.type === 'school' || person.activity?.type === 'homework') this.drawActivityBubble(person, '✎');
    if (person.activity?.type === 'washDishes') this.drawActivityBubble(person, '◌');
    if (person.activity?.type === 'laundry') this.drawActivityBubble(person, '▧');
    if (person.activity?.type === 'conversation') this.drawActivityBubble(person, '…');
    if (person.activity?.type === 'hobby' && person.activity?.hobbyId === 'painting') this.drawActivityBubble(person, '▤');
    this.drawNameTag(person, box.x, box.y - box.height / 2 - 5, isPlayer);
    this.personHitboxes.push({ id: person.id, x: box.x - box.width / 2, y: box.y - box.height / 2, w: box.width, h: box.height, person, clickable: clickable || !person.id.startsWith('resident-') });
    person.x=original.x; person.y=original.y;
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
      ctx.fillText(`${(this.state.activeResidenceId==='familyHome'?this.state.household.label:(this.state.player.residence||this.state.household.label)).toUpperCase()} · ${(this.state.household.home.currentFloor||0)===0?'GROUND FLOOR':'SECOND FLOOR'} · ${formatTime(this.state.time.minute)}`, 25, 30);
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
