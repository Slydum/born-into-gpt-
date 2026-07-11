export const TILE = 32;
export const COLS = 22;
export const ROWS = 18;
export const CANVAS_WIDTH = COLS * TILE;
export const CANVAS_HEIGHT = ROWS * TILE;
export const SAVE_KEY = 'born-into-save-v7';
export const LEGACY_SAVE_KEYS = ['born-into-save-v6', 'born-into-save-v5', 'born-into-save-v4', 'born-into-save-v3', 'born-into-save-v2', 'born-into-save'];
export const SAVE_VERSION = 7;
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
  { id: 'reading', label: 'Reading', location: 'home', mood: 12, energy: -2, cost: 0, trait: 'patience', equipment: 'bookshelf' },
  { id: 'gardening', label: 'Gardening', location: 'home', mood: 14, energy: -5, cost: 5, trait: 'responsibility', equipment: 'gardenKit' },
  { id: 'gaming', label: 'Gaming', location: 'home', mood: 15, energy: -2, cost: 0, trait: 'impulsiveness', equipment: 'gameConsole' },
  { id: 'exercise', label: 'Exercise', location: 'home', mood: 15, energy: -10, cost: 0, trait: 'workEthic', equipment: 'exerciseMat' },
  { id: 'painting', label: 'Painting', location: 'home', mood: 18, energy: -4, cost: 12, trait: 'creativity', equipment: 'easel' },
  { id: 'music', label: 'Music practice', location: 'home', mood: 17, energy: -4, cost: 6, trait: 'sociability', equipment: 'keyboard' },
  { id: 'cooking', label: 'Cooking', location: 'home', mood: 12, energy: -6, cost: 8, trait: 'warmth', equipment: 'stove' },
  { id: 'socializing', label: 'Visiting friends', location: 'community', mood: 20, energy: -5, cost: 10, trait: 'sociability', equipment: null },
  { id: 'walking', label: 'Walking in the park', location: 'park', mood: 13, energy: -7, cost: 0, trait: 'patience', equipment: null },
  { id: 'volunteering', label: 'Volunteering', location: 'community', mood: 14, energy: -8, cost: 0, trait: 'responsibility', equipment: null },
  { id: 'television', label: 'Watching television', location: 'home', mood: 10, energy: 1, cost: 0, trait: 'impulsiveness', equipment: 'television' },
  { id: 'sewing', label: 'Sewing', location: 'home', mood: 13, energy: -3, cost: 4, trait: 'patience', equipment: 'sewingKit' }
];

export const HOUSE_PURCHASES = [
  { id: 'crib', label: 'crib', cost: 120, priority: 95, requiredStage: 'baby', room: 'parentBedroom' },
  { id: 'toddlerBed', label: 'toddler bed', cost: 170, priority: 100, requiredStage: 'toddler', room: 'parentBedroom' },
  { id: 'childBed', label: 'child bed', cost: 260, priority: 95, requiredStage: 'child', room: 'childBedroom' },
  { id: 'studyDesk', label: 'study desk', cost: 220, priority: 82, requiredStage: 'child', room: 'childBedroom' },
  { id: 'teenBedroom', label: 'teen bedroom extension', cost: 1350, priority: 110, requiredStage: 'teen', room: 'teenBedroom', constructionDays: 4 },
  { id: 'siblingBed', label: 'sibling bed', cost: 250, priority: 90, requiredStage: 'sibling', room: 'childBedroom' },
  { id: 'sofa', label: 'sofa', cost: 320, priority: 38, room: 'livingRoom' },
  { id: 'rug', label: 'rug', cost: 95, priority: 24, room: 'livingRoom' },
  { id: 'television', label: 'television', cost: 410, priority: 20, room: 'livingRoom' },
  { id: 'bookshelf', label: 'bookshelf', cost: 180, priority: 35, room: 'livingRoom' },
  { id: 'plant', label: 'house plant', cost: 45, priority: 12, room: 'livingRoom' },
  { id: 'diningSet', label: 'dining set', cost: 360, priority: 65, room: 'diningRoom' },
  { id: 'paint', label: 'fresh wall paint', cost: 230, priority: 30, room: 'wholeHouse' },
  { id: 'washingMachine', label: 'washing machine', cost: 520, priority: 60, room: 'bathroom' },
  { id: 'dishwasher', label: 'dishwasher', cost: 610, priority: 42, room: 'kitchen' },
  { id: 'exerciseMat', label: 'exercise mat', cost: 90, priority: 26, room: 'ownerBedroom', hobby: 'exercise' },
  { id: 'dumbbells', label: 'dumbbells', cost: 220, priority: 22, room: 'ownerBedroom', hobby: 'exercise' },
  { id: 'easel', label: 'painting easel and supplies', cost: 260, priority: 30, room: 'ownerBedroom', hobby: 'painting' },
  { id: 'keyboard', label: 'music keyboard', cost: 480, priority: 22, room: 'ownerBedroom', hobby: 'music' },
  { id: 'sewingKit', label: 'sewing kit', cost: 170, priority: 22, room: 'ownerBedroom', hobby: 'sewing' },
  { id: 'gardenKit', label: 'indoor gardening kit', cost: 150, priority: 20, room: 'ownerBedroom', hobby: 'gardening' },
  { id: 'gameConsole', label: 'game console', cost: 720, priority: 15, room: 'ownerBedroom', hobby: 'gaming' },
  { id: 'secondFloor', label: 'second-floor addition', cost: 4200, priority: 125, requiredStage: 'teen', room: 'upperLanding', constructionDays: 8 },
  { id: 'roomDivider', label: 'bedroom room divider', cost: 180, priority: 78, room: 'childBedroom' },
  { id: 'highChair', label: 'high chair', cost: 115, priority: 88, requiredStage: 'toddler', room: 'diningRoom' }
];

export const HOME_ANCHORS = {
  parentBedroom: {
    bed: { x: 1.7, y: 2.1, w: 2.8, h: 1.4, facing: 'down' },
    crib: { x: 5.8, y: 2.1, w: 1.2, h: 1.3, facing: 'down' },
    toddlerBed: { x: 5.0, y: 4.4, w: 2.2, h: 1.1, facing: 'up' },
    dresser: { x: 1.7, y: 5.0, w: 1.1, h: 1.2, facing: 'right' }
  },
  childBedroom: {
    childBed: { x: 9.5, y: 2.1, w: 2.2, h: 1.1, facing: 'down' },
    siblingBed: { x: 9.5, y: 4.6, w: 2.2, h: 1.1, facing: 'up' },
    studyDesk: { x: 13.1, y: 2.2, w: 1.5, h: 1.0, facing: 'down' },
    dresser: { x: 13.5, y: 4.7, w: 1.0, h: 1.2, facing: 'left' }
  },
  teenBedroom: {
    childBed: { x: 9.4, y: 2.1, w: 2.4, h: 1.2, facing: 'down' },
    studyDesk: { x: 13.0, y: 2.1, w: 1.7, h: 1.1, facing: 'down' },
    bookshelf: { x: 13.7, y: 4.6, w: 0.8, h: 1.5, facing: 'left' }
  },
  kitchen: {
    fridge: { x: 19.7, y: 2.0, w: 0.9, h: 1.3, facing: 'left' },
    stove: { x: 19.7, y: 4.1, w: 0.9, h: 1.0, facing: 'left' },
    counter: { x: 16.6, y: 1.7, w: 2.2, h: 0.75, facing: 'down' }
  },
  livingRoom: {
    sofa: { x: 2.1, y: 13.4, w: 3.0, h: 1.2, facing: 'up' },
    television: { x: 3.0, y: 9.2, w: 2.0, h: 0.75, facing: 'down' },
    rug: { x: 2.2, y: 10.6, w: 4.5, h: 2.2, facing: 'down' },
    bookshelf: { x: 7.3, y: 9.5, w: 0.9, h: 2.0, facing: 'left' },
    plant: { x: 7.5, y: 15.4, w: 0.7, h: 0.7, facing: 'up' }
  },
  diningRoom: {
    diningSet: { x: 11.5, y: 10.5, w: 3.2, h: 2.0, facing: 'down' }
  },
  bathroom: {
    toilet: { x: 17.7, y: 9.5, w: 0.8, h: 1.0, facing: 'down' },
    sink: { x: 19.6, y: 9.5, w: 0.9, h: 0.8, facing: 'down' },
    shower: { x: 17.6, y: 13.3, w: 2.6, h: 2.5, facing: 'down' }
  }
};

export const HOME_ACTIVITY_POINTS = {
  parentBed: { x: 4.8, y: 3.1 },
  crib: { x: 5.4, y: 3.3 },
  childBed: { x: 12.0, y: 2.8 },
  siblingBed: { x: 12.0, y: 5.0 },
  toddlerBed: { x: 4.7, y: 5.1 },
  dining: { x: 14.8, y: 11.5 },
  fridge: { x: 18.9, y: 2.7 },
  stove: { x: 18.9, y: 4.6 },
  sofa: { x: 3.7, y: 12.8 },
  television: { x: 4.0, y: 10.4 },
  bookshelf: { x: 6.8, y: 10.7 },
  studyDesk: { x: 12.8, y: 3.7 },
  bathroom: { x: 18.8, y: 12.0 },
  nursery: { x: 6.1, y: 3.8 },
  livingCenter: { x: 5.2, y: 13.2 },
  entry: { x: 11.5, y: 16.0 }
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
