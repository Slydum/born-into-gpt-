import { TILE, CANVAS_WIDTH, CANVAS_HEIGHT, SCENE_ENTRY, LOCATION_LABELS } from './config.js';
import { getFurnitureAnchor, getActiveRooms, hasFurniture } from './state.js';
export { getActiveRooms } from './state.js';
import { clamp, seededPhase, stageForAge } from './utils.js';
import { assignedSleepPosition, assignedSeatPosition, preferredHobbyRoom, v7PersonById } from './v7.js';

export function getLocation(state, type) {
  return state.town.locations.find(location => location.type === type) || null;
}

export function locationLabel(state, type) {
  if (type === 'town') return state.town.name;
  return getLocation(state, type)?.name || LOCATION_LABELS[type] || type;
}

export function getTownDoorPoint(state, type) {
  const location = getLocation(state, type);
  if (!location) return { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
  return { x: (location.doorX + 0.5) * TILE, y: Math.min(CANVAS_HEIGHT - 16, (location.doorY + 0.55) * TILE) };
}

export function getSceneExitPoint(scene) {
  if (scene === 'town') return { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
  return { x: 11.5 * TILE, y: 16.65 * TILE };
}

export function getSceneEntryPoint(scene) {
  return SCENE_ENTRY[scene] || { x: 11.5 * TILE, y: 16.2 * TILE };
}

export function getAllFamily(state) {
  return [state.player, ...state.parents, ...state.siblings, state.nanny].filter(Boolean);
}

export function getCaregivers(state) {
  return [...state.parents, state.nanny].filter(person => person && person.alive !== false);
}

export function getYoungestChild(state) {
  return [state.player, ...state.siblings].filter(person => person?.alive !== false).sort((a, b) => a.age - b.age)[0] || null;
}

export function getPersonById(state, id) {
  return v7PersonById(state, id);
}

export function getDependents(state) {
  const dependents = [state.player, ...state.siblings].filter(person => ['baby', 'toddler', 'child'].includes(person.stage) && person.alive !== false);
  return dependents;
}

export function getFurnitureRects(state) {
  return state.household.home.furniture
    .filter(item => item.delivered !== false && (item.floor ?? 0) === (state.household.home.currentFloor ?? 0))
    .map(item => {
      const anchor = getFurnitureAnchor(state, item);
      return {
        ...item,
        x: anchor.x * TILE,
        y: anchor.y * TILE,
        w: anchor.w * TILE,
        h: anchor.h * TILE,
        facing: anchor.facing
      };
    });
}

export function getHomeRoomAt(state, x, y) {
  const tileX = x / TILE;
  const tileY = y / TILE;
  return getActiveRooms(state).find(room => tileX >= room.x && tileX <= room.x + room.w && tileY >= room.y && tileY <= room.y + room.h) || null;
}

export function getSceneObjects(state, scene = state.scene) {
  if (scene === 'home') {
    const items = getFurnitureRects(state).map(item => {
      const labels = {
        parentBed: 'Rest in bed', crib: 'Check the crib', toddlerBed: 'Rest in your toddler bed', childBed: 'Rest in your bed', siblingBed: 'Sibling bed', teenBed:'Rest in your bed', upperBedA:'Rest in your bed', upperBedB:'Rest in your bed', nannyBed:'Rest in bed',
        fridge: 'Check ingredients', stove: 'Cook a meal', basicTable: 'Sit at the table', diningSet: 'Sit at the dining table',
        sofa: 'Relax on the sofa', television: 'Watch television', bookshelf: 'Read a book', studyDesk: 'Study at your desk', plant: 'Water the plant', rug: 'Sit on the rug', toilet: 'Use the bathroom', sink: 'Wash up', shower: 'Take a shower', laundryBasket: 'Sort laundry', washingMachine: 'Wash laundry', dishRack: 'Wash dishes', dishwasher: 'Run the dishwasher', exerciseMat: 'Exercise', dumbbells: 'Lift weights', easel: 'Paint', keyboard: 'Practice music', sewingKit: 'Sew', gardenKit: 'Garden', gameConsole: 'Play games'
      };
      const types = {
        parentBed: 'bed', crib: 'crib', toddlerBed: 'bed', childBed: 'bed', siblingBed: 'bed', teenBed:'bed', upperBedA:'bed', upperBedB:'bed', nannyBed:'bed', fridge: 'fridge', stove: 'stove',
        basicTable: 'table', diningSet: 'table', sofa: 'sofa', television: 'television', bookshelf: 'book', studyDesk: 'study', plant: 'plant', rug: 'rug', toilet: 'bathroom', sink: 'bathroom', shower: 'bathroom', laundryBasket: 'laundry', washingMachine: 'laundry', dishRack: 'dishes', dishwasher: 'dishes', exerciseMat: 'exercise', dumbbells: 'exercise', easel: 'painting', keyboard: 'music', sewingKit: 'sewing', gardenKit: 'gardening', gameConsole: 'gaming'
      };
      return { id: item.id, type: types[item.id] || 'furniture', label: labels[item.id] || item.id, x: item.x + item.w / 2, y: item.y + item.h / 2, w: item.w, h: item.h, solid: !['rug', 'plant'].includes(item.id) };
    });
    if (state.household.home.stairs?.active) {
      const floor = state.household.home.currentFloor || 0;
      const stair = floor === 0 ? state.household.home.stairs.ground : state.household.home.stairs.upper;
      items.push({ id:'stairs', type:'stairs', targetFloor:floor===0?1:0, label:floor===0?'Go upstairs':'Go downstairs', x:stair.x*TILE, y:stair.y*TILE, w:TILE, h:TILE, solid:false });
    }
    if ((state.household.home.currentFloor || 0) === 0) items.push({ id: 'home-exit', type: 'exit', label: 'Go into town', x: 11.5 * TILE, y: 16.6 * TILE, w: TILE, h: TILE, solid: false });
    return items;
  }

  if (scene === 'town') {
    return state.town.locations.map(location => ({
      id: `enter-${location.type}`,
      type: 'enter',
      target: location.type,
      label: `Enter ${location.name}`,
      x: (location.doorX + 0.5) * TILE,
      y: (location.doorY + 0.5) * TILE,
      w: TILE,
      h: TILE,
      solid: false
    }));
  }

  const base = [{ id: `${scene}-exit`, type: 'exitTown', label: 'Return to town', x: 11.5 * TILE, y: 16.6 * TILE, w: TILE, h: TILE, solid: false }];
  const extras = {
    school: [
      { id: 'school-desk', type: 'study', label: 'Attend class', x: 11 * TILE, y: 7 * TILE, w: 3 * TILE, h: TILE, solid: true },
      { id: 'teacher', type: 'personAction', label: 'Talk to the teacher', x: 11.5 * TILE, y: 3.5 * TILE, w: TILE, h: TILE, solid: false }
    ],
    workplace: [
      { id: 'work-desk', type: 'work', label: 'Work your shift', x: 11 * TILE, y: 7 * TILE, w: 3 * TILE, h: TILE, solid: true }
    ],
    grocery: [
      { id: 'checkout', type: 'checkout', label: 'Buy groceries', x: 17 * TILE, y: 13 * TILE, w: 2 * TILE, h: TILE, solid: true },
      ...[4, 8, 12, 16].map((x, index) => ({ id: `shelf-${index}`, type: 'shelf', label: 'Browse groceries', x: x * TILE, y: 7 * TILE, w: 2 * TILE, h: TILE, solid: true }))
    ],
    furniture: [
      { id: 'furniture-desk', type: 'furnitureShop', label: 'Browse furniture', x: 11 * TILE, y: 7 * TILE, w: 4 * TILE, h: TILE, solid: true },
      ...[4, 8, 14, 18].map((x, index) => ({ id: `display-${index}`, type: 'display', label: 'Look at furniture', x: x * TILE, y: 11 * TILE, w: 2 * TILE, h: 2 * TILE, solid: true }))
    ],
    park: [
      { id: 'park-bench', type: 'bench', label: 'Sit on a bench', x: 6 * TILE, y: 9 * TILE, w: 2 * TILE, h: TILE, solid: true },
      { id: 'park-play', type: 'play', label: 'Play in the park', x: 15 * TILE, y: 8 * TILE, w: 2 * TILE, h: TILE, solid: false }
    ],
    hospital: [{ id: 'doctor', type: 'doctor', label: 'See a doctor', x: 11.5 * TILE, y: 6 * TILE, w: TILE, h: TILE, solid: false }],
    social: [{ id: 'caseworker', type: 'caseworker', label: 'Talk to a case worker', x: 11.5 * TILE, y: 6 * TILE, w: TILE, h: TILE, solid: false }],
    community: [
      { id: 'community-stage', type: 'community', label: 'Join a community activity', x: 11 * TILE, y: 5 * TILE, w: 4 * TILE, h: 2 * TILE, solid: true },
      { id: 'community-table', type: 'socialize', label: 'Talk with neighbors', x: 6 * TILE, y: 11 * TILE, w: 2 * TILE, h: 2 * TILE, solid: true }
    ]
  };
  return [...base, ...(extras[scene] || [])];
}

export function getActivityPoint(state, person, activityType, goal = {}) {
  const roomCenter = roomId => {
    const room = getActiveRooms(state).find(item => item.id === roomId) || getActiveRooms(state)[0];
    return room ? { x: (room.x + room.w / 2) * TILE, y: (room.y + room.h / 2) * TILE } : getSceneEntryPoint('home');
  };
  const furniturePoint = (ids, fallbackRoom = 'livingRoom', offset = 20) => {
    const list = Array.isArray(ids) ? ids : [ids];
    const object = getSceneObjects(state, 'home').find(item => list.includes(item.id));
    if (!object) return roomCenter(fallbackRoom);
    const phase = seededPhase(person.id || 'person');
    return findSafePoint(state, 'home', { x: object.x + Math.cos(phase) * offset, y: object.y + object.h / 2 + 14 + Math.sin(phase) * 6 });
  };
  if (person.location !== 'home') {
    const objectType = {
      school: 'study', homework: 'study', study: 'study', working: 'work', remoteWork: 'work',
      shopping: 'checkout', furnitureShopping: 'furnitureShop', park: 'play', exercise: 'play', hobby: 'community',
      visiting: 'socialize', socializing: 'socialize', community: 'community', hospital: 'doctor', conversation: 'socialize'
    }[activityType];
    const object = getSceneObjects(state, person.location).find(item => item.type === objectType);
    return object ? findSafePoint(state, person.location, { x: object.x, y: object.y + Math.max(24, object.h / 2 + 14) }) : getSceneEntryPoint(person.location);
  }
  if (['feeding','changing','comforting','playing','conversation'].includes(activityType) && goal.targetId) {
    const target = getPersonById(state, goal.targetId);
    if (target?.location === 'home') return findSafePoint(state, 'home', { x: target.x + 28, y: target.y + 8 });
  }
  if (activityType === 'sleeping') {
    const assigned = assignedSleepPosition(state, person);
    if (assigned) return assigned;
    return furniturePoint(['parentBed','childBed','siblingBed','sofa'],'livingRoom');
  }
  if (['breakfast','lunch','dinner','eating','familyMeal'].includes(activityType)) {
    return assignedSeatPosition(state, person) || furniturePoint(['diningSet','basicTable'],'diningRoom',28);
  }
  if (activityType === 'cooking') return furniturePoint('stove','kitchen');
  if (activityType === 'shopping') return furniturePoint('fridge','kitchen');
  if (activityType === 'washDishes') return furniturePoint(['dishwasher','dishRack','sink'],'kitchen');
  if (activityType === 'laundry') return furniturePoint(['washingMachine','laundryBasket'],'bathroom');
  if (activityType === 'takeTrash') return roomCenter('kitchen');
  if (activityType === 'cleanBathroom') return furniturePoint('sink','bathroom');
  if (activityType === 'cleaning') return roomCenter(goal.roomId || 'livingRoom');
  if (activityType === 'repairing') return roomCenter('kitchen');
  if (['homework','study','remoteWork'].includes(activityType)) return furniturePoint('studyDesk',person.assignedRoomId || 'childBedroom');
  if (activityType === 'familyTime' || activityType === 'conversation') return furniturePoint(['sofa','rug'],'livingRoom',28);
  if (activityType === 'hobby') {
    const map = { cooking:'stove', reading:'bookshelf', sewing:'sewingKit', television:'television', gaming:'gameConsole', exercise:['exerciseMat','dumbbells'], painting:'easel', music:'keyboard', gardening:['gardenKit','plant'] };
    const room = preferredHobbyRoom(state,person,goal.hobbyId);
    const owned = getSceneObjects(state,'home').find(item => {
      if (!([].concat(map[goal.hobbyId] || [])).includes(item.id)) return false;
      const furniture = state.household.home.furniture.find(entry => entry.id === item.id && entry.room === room && (entry.ownerId === person.id || !entry.ownerId));
      return Boolean(furniture);
    });
    if (owned) return findSafePoint(state,'home',{x:owned.x,y:owned.y+Math.max(20,owned.h/2+10)});
    return furniturePoint(map[goal.hobbyId] || ['sofa','rug'],room,25);
  }
  if (activityType === 'exploring') {
    const rooms = getActiveRooms(state).filter(room => room.id !== 'bathroom' || person.stage !== 'baby');
    const room = rooms[Math.abs(Math.floor((state.time.minute + String(person.id).length * 17) / 20)) % rooms.length];
    return roomCenter(room?.id || 'livingRoom');
  }
  if (activityType === 'relaxing' || activityType === 'retirement' || activityType === 'waiting') return furniturePoint(['sofa','rug'],'livingRoom');
  return roomCenter('livingRoom');
}

export function getIndoorWaypoints(state, person, target) {
  if (person.location !== 'home') return [target];
  const currentRoom = getHomeRoomAt(state, person.x, person.y);
  const targetRoom = getHomeRoomAt(state, target.x, target.y);
  if (!targetRoom || currentRoom?.id === targetRoom.id) return [target];
  const points = [];
  const currentDoor = currentRoom?.door;
  const targetDoor = targetRoom?.door;
  if (currentDoor) points.push({ x: currentDoor.x * TILE, y: currentDoor.y * TILE });
  if (targetDoor) points.push({ x: targetDoor.x * TILE, y: targetDoor.y * TILE });
  points.push(target);
  return points;
}

export function getCollisionRects(state, scene = state.scene) {
  const boundary = [
    { x: 0, y: 0, w: CANVAS_WIDTH, h: 12 },
    { x: 0, y: CANVAS_HEIGHT - 12, w: CANVAS_WIDTH, h: 12 },
    { x: 0, y: 0, w: 12, h: CANVAS_HEIGHT },
    { x: CANVAS_WIDTH - 12, y: 0, w: 12, h: CANVAS_HEIGHT }
  ];
  if (scene === 'town') {
    return [...boundary, ...state.town.locations.filter(location => location.type !== 'park').map(location => ({ x: location.x * TILE, y: location.y * TILE, w: location.w * TILE, h: location.h * TILE }))];
  }
  return [...boundary, ...getSceneObjects(state, scene).filter(item => item.solid).map(item => ({ x: item.x - item.w / 2, y: item.y - item.h / 2, w: item.w, h: item.h }))];
}

export function collides(state, x, y, radius = 9, scene = state.scene) {
  return getCollisionRects(state, scene).some(rect => x + radius > rect.x && x - radius < rect.x + rect.w && y + radius > rect.y && y - radius < rect.y + rect.h);
}

export function nearestObject(state, person = state.player, maxDistance = 52) {
  let nearest = null;
  let best = maxDistance;
  for (const object of getSceneObjects(state, person.location)) {
    const current = Math.hypot(person.x - object.x, person.y - object.y);
    if (current < best) {
      best = current;
      nearest = object;
    }
  }
  return nearest;
}

export function residentScheduleLocation(resident, state) {
  const dayIndex = Math.floor(state.time.totalDays) % 7;
  const hour = state.time.minute / 60;
  const weekend = dayIndex >= 5;
  const stage = stageForAge(resident.age);
  const transition = (start, end) => hour >= start && hour < end;

  if (stage === 'baby' || stage === 'toddler') {
    if (weekend && hour >= 10 && hour < 12.5) return 'park';
    if (!weekend && hour >= 15.5 && hour < 17.5) return 'park';
    return 'home';
  }

  if (stage === 'child' || stage === 'teen') {
    if (!weekend && transition(7.3, 8)) return 'town';
    if (!weekend && hour >= 8 && hour < 15) return 'school';
    if (!weekend && transition(15, 15.6)) return 'town';
    if (!weekend && hour >= 15.6 && hour < 18 && resident.hobbies.some(id => ['walking', 'exercise', 'socializing'].includes(id))) return 'park';
    if (weekend && hour >= 10 && hour < 14) return resident.hobbies.includes('socializing') ? 'community' : 'park';
    return 'home';
  }

  if (stage === 'elder') {
    if (hour >= 9 && hour < 11) return weekend ? 'community' : 'park';
    if (hour >= 14 && hour < 16 && dayIndex % 2 === 0) return 'grocery';
    return 'home';
  }

  const schedule = resident.job?.schedule || 'weekday';
  const workLocation = resident.job?.workplace || 'workplace';
  const workday = (() => {
    if (schedule === 'retail') return dayIndex >= 1 && dayIndex <= 5;
    if (schedule === 'shift') return [0, 2, 4, 5].includes(dayIndex);
    if (schedule === 'parttime') return [1, 3, 5].includes(dayIndex);
    if (schedule === 'night') return dayIndex < 5;
    if (schedule === 'caregiver') return false;
    return dayIndex < 5;
  })();

  if (schedule === 'night' && workday) {
    if (hour >= 21.3 && hour < 22) return 'town';
    if (hour >= 22 || hour < 6) return workLocation;
    if (hour >= 6 && hour < 6.6) return 'town';
  } else if (workday) {
    const start = schedule === 'parttime' ? 10 : schedule === 'shift' ? 7 : 9;
    const end = schedule === 'parttime' ? 14 : schedule === 'shift' ? 15 : 17;
    if (transition(start - 0.7, start)) return 'town';
    if (hour >= start && hour < end) return workLocation;
    if (transition(end, end + 0.7)) return 'town';
  }

  if (hour >= 17 && hour < 19 && dayIndex % 3 === 0) return 'grocery';
  if (weekend && hour >= 10 && hour < 14) return resident.hobbies.includes('socializing') ? 'community' : 'park';
  if (hour >= 18 && hour < 21 && resident.hobbies.some(id => ['painting', 'music', 'volunteering', 'socializing'].includes(id))) return 'community';
  return 'home';
}

export function getVisibleResidents(state, scene = state.scene) {
  const hour = state.time.minute / 60;
  return state.town.residents
    .map(resident => ({ ...resident, computedLocation: residentScheduleLocation(resident, state) }))
    .filter(resident => {
      if (scene === 'town') {
        const ambient = hour >= 8 && hour < 21 && ((resident.id.charCodeAt(resident.id.length - 1) + Math.floor(state.time.totalDays)) % 5 === 0);
        return resident.computedLocation === 'town' || ambient;
      }
      if (scene === 'home') return false;
      return resident.computedLocation === scene;
    })
    .slice(0, scene === 'school' ? 16 : scene === 'park' || scene === 'community' ? 12 : 8)
    .map((resident, index) => {
      const phase = resident.phase + state.time.minute * 0.012;
      if (scene === 'town') {
        const origin = resident.job?.workplace ? getTownDoorPoint(state, resident.job.workplace) : getTownDoorPoint(state, 'home');
        const destination = hour < 12 ? getTownDoorPoint(state, resident.job?.workplace || 'school') : getTownDoorPoint(state, 'home');
        const progress = (Math.sin(phase) + 1) / 2;
        return { ...resident, x: origin.x + (destination.x - origin.x) * progress, y: origin.y + (destination.y - origin.y) * progress };
      }
      const columns = scene === 'school' ? 5 : 4;
      const baseX = 4 * TILE + (index % columns) * 3.2 * TILE;
      const baseY = 4 * TILE + Math.floor(index / columns) * 3 * TILE;
      return { ...resident, x: clamp(baseX + Math.sin(phase) * 10, 40, CANVAS_WIDTH - 40), y: clamp(baseY + Math.cos(phase * 0.8) * 8, 40, CANVAS_HEIGHT - 55) };
    });
}

export function findSafePoint(state, scene, preferred) {
  if (!collides(state, preferred.x, preferred.y, 10, scene)) return preferred;
  for (let radius = TILE; radius < 8 * TILE; radius += TILE) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const candidate = { x: preferred.x + Math.cos(angle) * radius, y: preferred.y + Math.sin(angle) * radius };
      if (!collides(state, candidate.x, candidate.y, 10, scene)) return candidate;
    }
  }
  return { x: 11.5 * TILE, y: 15.5 * TILE };
}

export function furnitureNeededForStage(state, stage = state.player.stage) {
  if (stage === 'baby') return !hasFurniture(state, 'crib') ? 'crib' : null;
  if (stage === 'toddler') return !hasFurniture(state, 'toddlerBed') ? 'toddlerBed' : null;
  if (stage === 'child') return !hasFurniture(state, 'childBed') ? 'childBed' : !hasFurniture(state, 'studyDesk') ? 'studyDesk' : null;
  if (stage === 'teen') return !state.household.home.rooms.some(room => room.id === 'teenBedroom' && room.active) ? 'teenBedroom' : null;
  return null;
}
