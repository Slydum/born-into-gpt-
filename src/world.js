import { TILE, CANVAS_WIDTH, CANVAS_HEIGHT, SCENE_ENTRY, LOCATION_LABELS, HOME_ACTIVITY_POINTS } from './config.js';
import { getFurnitureAnchor, getActiveRooms, hasFurniture } from './state.js';
export { getActiveRooms } from './state.js';
import { clamp, seededPhase, stageForAge } from './utils.js';

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
  return getAllFamily(state).find(person => person.id === id) || state.town.residents.find(person => person.id === id) || null;
}

export function getDependents(state) {
  const dependents = [state.player, ...state.siblings].filter(person => ['baby', 'toddler', 'child'].includes(person.stage) && person.alive !== false);
  return dependents;
}

export function getFurnitureRects(state) {
  return state.household.home.furniture
    .filter(item => item.delivered !== false)
    .map(item => {
      const anchor = getFurnitureAnchor(item);
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
        parentBed: 'Rest in bed', crib: 'Check the crib', toddlerBed: 'Rest in your toddler bed', childBed: 'Rest in your bed', siblingBed: 'Sibling bed',
        fridge: 'Get something to eat', stove: 'Use the stove', basicTable: 'Sit at the table', diningSet: 'Sit at the dining table',
        sofa: 'Relax on the sofa', television: 'Watch television', bookshelf: 'Read a book', studyDesk: 'Study at your desk', plant: 'Water the plant', rug: 'Sit on the rug', toilet: 'Use the bathroom', sink: 'Wash up', shower: 'Take a shower'
      };
      const types = {
        parentBed: 'bed', crib: 'crib', toddlerBed: 'bed', childBed: 'bed', siblingBed: 'bed', fridge: 'fridge', stove: 'stove',
        basicTable: 'table', diningSet: 'table', sofa: 'sofa', television: 'television', bookshelf: 'book', studyDesk: 'study', plant: 'plant', rug: 'rug', toilet: 'bathroom', sink: 'bathroom', shower: 'bathroom'
      };
      return { id: item.id, type: types[item.id] || 'furniture', label: labels[item.id] || item.id, x: item.x + item.w / 2, y: item.y + item.h / 2, w: item.w, h: item.h, solid: !['rug', 'plant'].includes(item.id) };
    });
    items.push({ id: 'home-exit', type: 'exit', label: 'Go into town', x: 11.5 * TILE, y: 16.6 * TILE, w: TILE, h: TILE, solid: false });
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
  const point = key => {
    const raw = HOME_ACTIVITY_POINTS[key] || HOME_ACTIVITY_POINTS.livingCenter;
    const fixed = ['parentBed','crib','childBed','siblingBed','toddlerBed','fridge','stove','studyDesk','bathroom','entry'].includes(key);
    const phase = seededPhase(person.id || 'person');
    const spread = fixed ? 0 : 9;
    return { x: raw.x * TILE + Math.cos(phase) * spread, y: raw.y * TILE + Math.sin(phase) * spread };
  };
  if (person.location !== 'home') {
    const objectType = {
      school: 'study', homework: 'study', study: 'study', working: 'work', remoteWork: 'work',
      shopping: 'checkout', furnitureShopping: 'furnitureShop', park: 'play', hobby: 'community',
      visiting: 'socialize', community: 'community', hospital: 'doctor'
    }[activityType];
    const object = getSceneObjects(state, person.location).find(item => item.type === objectType);
    return object ? findSafePoint(state, person.location, { x: object.x, y: object.y + Math.max(24, object.h / 2 + 14) }) : getSceneEntryPoint(person.location);
  }
  if (['feeding', 'changing', 'comforting', 'playing'].includes(activityType) && goal.targetId) {
    const target = getPersonById(state, goal.targetId);
    if (target?.location === 'home') return findSafePoint(state, 'home', { x: target.x + 28, y: target.y + 8 });
  }
  if (activityType === 'sleeping') {
    if (person.role === 'Nanny') return point(person.liveIn ? 'sofa' : 'livingCenter');
    if (person.role === 'Parent') {
      const parentIndex = state.parents.findIndex(item => item.id === person.id);
      const base = point('parentBed');
      return { x: base.x + (parentIndex === 0 ? -15 : 15), y: base.y };
    }
    if (person.id === state.player.id && person.stage === 'baby') return point('crib');
    const siblingIndex = state.siblings.findIndex(item => item.id === person.id);
    return point(siblingIndex % 2 === 0 ? 'childBed' : 'siblingBed');
  }
  if (['breakfast', 'lunch', 'dinner', 'eating'].includes(activityType)) return point('dining');
  if (activityType === 'shopping') return point('fridge');
  if (activityType === 'cleaning') {
    const options = ['kitchen', 'livingCenter', 'bathroom', 'studyDesk'];
    return point(options[Math.abs(String(person.id).length + Math.floor(state.time.minute / 30)) % options.length]);
  }
  if (activityType === 'repairing') return point('kitchen');
  if (['homework', 'study', 'remoteWork'].includes(activityType)) return point('studyDesk');
  if (activityType === 'familyTime') return point('livingCenter');
  if (activityType === 'hobby') {
    if (goal.hobbyId === 'cooking') return point('stove');
    if (goal.hobbyId === 'reading' || goal.hobbyId === 'sewing') return point('bookshelf');
    if (goal.hobbyId === 'television' || goal.hobbyId === 'gaming') return point('sofa');
    return point('livingCenter');
  }
  if (activityType === 'exploring') {
    const spots = ['nursery', 'livingCenter', 'bookshelf', 'dining', 'bathroom', 'studyDesk'];
    const index = Math.abs(Math.floor((state.time.minute + String(person.id).length * 17) / 20)) % spots.length;
    return point(spots[index]);
  }
  if (activityType === 'relaxing' || activityType === 'retirement' || activityType === 'waiting') return point('sofa');
  return point('livingCenter');
}

const HOME_ROOM_DOORS = {
  parentBedroom: { x: 4.5 * TILE, y: 7.15 * TILE },
  childBedroom: { x: 12 * TILE, y: 7.15 * TILE },
  teenBedroom: { x: 12 * TILE, y: 7.15 * TILE },
  kitchen: { x: 18.5 * TILE, y: 7.15 * TILE },
  livingRoom: { x: 5 * TILE, y: 7.85 * TILE },
  diningRoom: { x: 13 * TILE, y: 7.85 * TILE },
  bathroom: { x: 19 * TILE, y: 7.85 * TILE }
};

export function getIndoorWaypoints(state, person, target) {
  if (person.location !== 'home') return [target];
  const currentRoom = getHomeRoomAt(state, person.x, person.y);
  const targetRoom = getHomeRoomAt(state, target.x, target.y);
  if (!targetRoom || currentRoom?.id === targetRoom.id) return [target];
  const points = [];
  if (currentRoom && HOME_ROOM_DOORS[currentRoom.id]) points.push(HOME_ROOM_DOORS[currentRoom.id]);
  const targetDoor = HOME_ROOM_DOORS[targetRoom.id];
  if (targetDoor) {
    const corridorY = 7.5 * TILE;
    const fromX = points.at(-1)?.x ?? person.x;
    points.push({ x: fromX, y: corridorY });
    points.push({ x: targetDoor.x, y: corridorY });
    points.push(targetDoor);
  }
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
