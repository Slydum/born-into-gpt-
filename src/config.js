export const TILE = 32;
export const COLS = 22;
export const ROWS = 18;
export const CANVAS_WIDTH = COLS * TILE;
export const CANVAS_HEIGHT = ROWS * TILE;
export const SAVE_KEY = 'born-into-save-v4';
export const LEGACY_SAVE_KEYS = ['born-into-save-v3', 'born-into-save-v2', 'born-into-save'];
export const SAVE_VERSION = 4;
export const SPEEDS = [1, 3, 8];
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WEEKDAY_COUNT = 5;
export const AGE_SECONDS = 180;

export const STAGES = [
  { id: 'baby', min: 0, max: 2 },
  { id: 'toddler', min: 2, max: 5 },
  { id: 'child', min: 5, max: 13 },
  { id: 'teen', min: 13, max: 18 },
  { id: 'adult', min: 18, max: 65 },
  { id: 'elder', min: 65, max: Infinity }
];

export const LOCATION_TYPES = [
  'home', 'school', 'workplace', 'grocery', 'park', 'hospital', 'social', 'furniture', 'community'
];

export const LOCATION_LABELS = {
  home: 'Family Home',
  school: 'School',
  workplace: 'Workplace',
  grocery: 'Grocery Store',
  park: 'Town Park',
  hospital: 'Hospital',
  social: 'Family Services',
  furniture: 'Furniture Store',
  community: 'Community Center',
  town: 'Town'
};

export const LOCATION_COLORS = {
  home: '#c97d60',
  school: '#d9a857',
  workplace: '#7296a6',
  grocery: '#a97ca2',
  park: '#7aa176',
  hospital: '#9fc4b5',
  social: '#d28768',
  furniture: '#a58a6a',
  community: '#789b72'
};

export const TOWN_SLOTS = [
  { x: 1, y: 1, w: 5, h: 4 },
  { x: 8, y: 1, w: 5, h: 4 },
  { x: 16, y: 1, w: 5, h: 4 },
  { x: 1, y: 7, w: 5, h: 4 },
  { x: 8, y: 7, w: 5, h: 4 },
  { x: 16, y: 7, w: 5, h: 4 },
  { x: 1, y: 13, w: 5, h: 4 },
  { x: 8, y: 13, w: 5, h: 4 },
  { x: 16, y: 13, w: 5, h: 4 }
];

export const SCENE_ENTRY = {
  home: { x: 11.5 * TILE, y: 16.3 * TILE },
  school: { x: 11.5 * TILE, y: 16.2 * TILE },
  workplace: { x: 11.5 * TILE, y: 16.2 * TILE },
  grocery: { x: 11.5 * TILE, y: 16.2 * TILE },
  park: { x: 11.5 * TILE, y: 16.2 * TILE },
  hospital: { x: 11.5 * TILE, y: 16.2 * TILE },
  social: { x: 11.5 * TILE, y: 16.2 * TILE },
  furniture: { x: 11.5 * TILE, y: 16.2 * TILE },
  community: { x: 11.5 * TILE, y: 16.2 * TILE }
};

export const JOBS = [
  { id: 'office', label: 'Office assistant', schedule: 'weekday', workplace: 'workplace', pay: [420, 620], education: 45 },
  { id: 'teacher', label: 'Teacher aide', schedule: 'schoolday', workplace: 'school', pay: [400, 580], education: 55 },
  { id: 'retail', label: 'Shop clerk', schedule: 'retail', workplace: 'grocery', pay: [320, 480], education: 25 },
  { id: 'warehouse', label: 'Warehouse staff', schedule: 'shift', workplace: 'workplace', pay: [390, 560], education: 20 },
  { id: 'care', label: 'Care worker', schedule: 'shift', workplace: 'hospital', pay: [430, 610], education: 45 },
  { id: 'driver', label: 'Delivery driver', schedule: 'weekday', workplace: 'workplace', pay: [360, 530], education: 20 },
  { id: 'remote', label: 'Remote support worker', schedule: 'remote', workplace: 'home', pay: [420, 650], education: 50 },
  { id: 'parttime', label: 'Part-time cashier', schedule: 'parttime', workplace: 'grocery', pay: [180, 280], education: 15 },
  { id: 'night', label: 'Night-shift attendant', schedule: 'night', workplace: 'hospital', pay: [450, 650], education: 30 },
  { id: 'caregiver', label: 'Stay-at-home caregiver', schedule: 'caregiver', workplace: 'home', pay: [0, 0], education: 20 }
];

export const HOBBIES = [
  { id: 'reading', label: 'Reading', location: 'home', mood: 12, energy: -2, cost: 0, trait: 'patience' },
  { id: 'gardening', label: 'Gardening', location: 'home', mood: 14, energy: -5, cost: 5, trait: 'responsibility' },
  { id: 'gaming', label: 'Gaming', location: 'home', mood: 15, energy: -2, cost: 0, trait: 'impulsiveness' },
  { id: 'exercise', label: 'Exercise', location: 'park', mood: 15, energy: -10, cost: 0, trait: 'workEthic' },
  { id: 'painting', label: 'Painting', location: 'community', mood: 18, energy: -4, cost: 12, trait: 'warmth' },
  { id: 'music', label: 'Music practice', location: 'community', mood: 17, energy: -4, cost: 6, trait: 'sociability' },
  { id: 'cooking', label: 'Cooking', location: 'home', mood: 12, energy: -6, cost: 8, trait: 'warmth' },
  { id: 'socializing', label: 'Visiting friends', location: 'community', mood: 20, energy: -5, cost: 10, trait: 'sociability' },
  { id: 'walking', label: 'Walking in the park', location: 'park', mood: 13, energy: -7, cost: 0, trait: 'patience' },
  { id: 'volunteering', label: 'Volunteering', location: 'community', mood: 14, energy: -8, cost: 0, trait: 'responsibility' },
  { id: 'television', label: 'Watching television', location: 'home', mood: 10, energy: 1, cost: 0, trait: 'impulsiveness' },
  { id: 'sewing', label: 'Sewing', location: 'home', mood: 13, energy: -3, cost: 4, trait: 'patience' }
];

export const HOUSE_PURCHASES = [
  { id: 'crib', label: 'crib', cost: 120, priority: 95, requiredStage: 'baby', room: 'parentBedroom' },
  { id: 'toddlerBed', label: 'toddler bed', cost: 170, priority: 100, requiredStage: 'toddler', room: 'parentBedroom' },
  { id: 'childBed', label: 'child bed', cost: 260, priority: 95, requiredStage: 'child', room: 'childBedroom' },
  { id: 'studyDesk', label: 'study desk', cost: 220, priority: 82, requiredStage: 'child', room: 'childBedroom' },
  { id: 'teenBedroom', label: 'teen bedroom extension', cost: 1350, priority: 110, requiredStage: 'teen', room: 'teenBedroom', constructionDays: 3 },
  { id: 'siblingBed', label: 'sibling bed', cost: 250, priority: 90, requiredStage: 'sibling', room: 'childBedroom' },
  { id: 'sofa', label: 'sofa', cost: 320, priority: 38, room: 'livingRoom' },
  { id: 'rug', label: 'rug', cost: 95, priority: 24, room: 'livingRoom' },
  { id: 'television', label: 'television', cost: 410, priority: 20, room: 'livingRoom' },
  { id: 'bookshelf', label: 'bookshelf', cost: 180, priority: 35, room: 'livingRoom' },
  { id: 'plant', label: 'house plant', cost: 45, priority: 12, room: 'livingRoom' },
  { id: 'diningSet', label: 'dining set', cost: 360, priority: 45, room: 'diningRoom' },
  { id: 'paint', label: 'fresh wall paint', cost: 230, priority: 30, room: 'wholeHouse' }
];

export const HOME_ANCHORS = {
  parentBedroom: {
    bed: { x: 3.4, y: 3.4, w: 2.7, h: 1.2, facing: 'down' },
    crib: { x: 10.1, y: 3.5, w: 1.2, h: 1.2, facing: 'down' },
    toddlerBed: { x: 7.1, y: 3.4, w: 2.1, h: 1.1, facing: 'down' },
    dresser: { x: 2.2, y: 6.0, w: 1.1, h: 1.6, facing: 'right' }
  },
  kitchen: {
    fridge: { x: 18.8, y: 3.1, w: 1.0, h: 1.2, facing: 'left' },
    stove: { x: 20.0, y: 5.0, w: 1.0, h: 1.0, facing: 'left' },
    counter: { x: 16.2, y: 2.2, w: 2.0, h: 0.8, facing: 'down' }
  },
  diningRoom: {
    diningSet: { x: 17.0, y: 11.2, w: 3.1, h: 2.0, facing: 'down' }
  },
  livingRoom: {
    sofa: { x: 12.0, y: 13.2, w: 3.1, h: 1.3, facing: 'up' },
    television: { x: 12.2, y: 9.8, w: 2.0, h: 0.8, facing: 'down' },
    rug: { x: 11.6, y: 11.2, w: 4.0, h: 2.7, facing: 'down' },
    bookshelf: { x: 2.2, y: 10.4, w: 1.1, h: 2.2, facing: 'right' },
    plant: { x: 15.7, y: 15.0, w: 0.8, h: 0.8, facing: 'up' }
  },
  childBedroom: {
    childBed: { x: 3.2, y: 12.0, w: 2.5, h: 1.2, facing: 'down' },
    siblingBed: { x: 3.2, y: 15.0, w: 2.5, h: 1.2, facing: 'up' },
    studyDesk: { x: 8.0, y: 12.0, w: 2.0, h: 1.2, facing: 'down' },
    dresser: { x: 8.7, y: 15.0, w: 1.2, h: 1.4, facing: 'left' }
  },
  teenBedroom: {
    childBed: { x: 3.2, y: 12.2, w: 2.6, h: 1.2, facing: 'down' },
    studyDesk: { x: 8.0, y: 12.0, w: 2.0, h: 1.2, facing: 'down' },
    bookshelf: { x: 9.0, y: 15.0, w: 1.0, h: 1.7, facing: 'left' }
  }
};

export const NEED_DECAY = {
  baby: { satiety: 0.55, energy: 0.14, hygiene: 0.14, comfort: 0.18 },
  toddler: { satiety: 0.27, energy: 0.18, hygiene: 0.10, comfort: 0.10 },
  child: { satiety: 0.17, energy: 0.14, hygiene: 0.075, comfort: 0.06 },
  teen: { satiety: 0.16, energy: 0.15, hygiene: 0.065, comfort: 0.05 },
  adult: { satiety: 0.14, energy: 0.13, hygiene: 0.055, comfort: 0.045 },
  elder: { satiety: 0.16, energy: 0.15, hygiene: 0.065, comfort: 0.06 }
};

export const EXPENSES = {
  groceriesBase: 55,
  utilitiesByTier: [0, 70, 105, 155, 220, 320],
  rentByTier: [0, 180, 320, 520, 820, 1300],
  schoolSupplies: 85,
  medicalBase: 120
};

export const ROUTINE_TOAST_COOLDOWN_MS = 4500;
export const MAX_TOASTS = 2;
export const FAST_SUMMARY_INTERVAL_MINUTES = 720;
