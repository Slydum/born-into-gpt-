export const NAMES = {
  first: [
    'Maya','Lia','Nico','Sam','Alex','Bea','Noah','Mika','Iris','Theo','June','Rafi','Tala','Ari','Elio','Cora','Dani','Luna','Kai','Sage',
    'Amara','Jules','Milo','Nina','Eli','Sofia','Marco','Jade','Rina','Leo','Mara','Enzo','Aya','Lio','Tessa','Mina','Luis','Ana','Paolo','Grace'
  ],
  adult: [
    'Marisol','Elena','Paolo','Ramon','Teresa','Daniel','Ana','Luis','Carmen','Marco','Rina','Joel','Nadia','Victor','Grace','Emil',
    'Lourdes','Miguel','Isabel','Renato','Celina','Arturo','Diana','Jose','Mila','Ben','Carla','Anton','Rosa','Gabe','Luz','Mateo'
  ],
  family: ['Reyes','Santos','Dela Cruz','Garcia','Mendoza','Torres','Flores','Ramos','Navarro','Castillo','Cruz','Bautista','Aquino','Villanueva','Mercado','Domingo'],
  towns: ['San Amihan','Mabini Grove','Luntian','Santa Tala','Bayani Hills','Malaya','Hiraya','Mapleford','Liwayway','Pandan Heights'],
  schools: ['Hiraya Elementary','Mabini Community School','Starlight Academy','Luntian Integrated School','Bayani Learning Center'],
  stores: ['Daily Basket','Suki Market','Town Pantry','Fresh Corner','Mabini Mart'],
  workplaces: ['Northline Office','Town Works','Civic Center','Mabini Textiles','Harbor Services'],
  furniture: ['Cozy Corner Furniture','Bahay Home Store','Town Furnishings','New Room Depot'],
  community: ['Hiraya Community Hall','Mabini Activity Center','Town Commons','Liwayway Center']
};

export const TRAIT_LABELS = {
  patience: 'Patience',
  impulsiveness: 'Impulsiveness',
  warmth: 'Warmth',
  workEthic: 'Work ethic',
  strictness: 'Strictness',
  responsibility: 'Responsibility',
  sociability: 'Sociability',
  creativity: 'Creativity',
  frugality: 'Frugality',
  familyFocus: 'Family focus'
};

export const STAGE_TRAITS = {
  toddler: [
    { id: 'secure', label: 'Secure', condition: p => p.development.bonding >= 62 },
    { id: 'watchful', label: 'Watchful', condition: p => p.development.stressExposure >= 45 },
    { id: 'sensitive', label: 'Sensitive', condition: () => true }
  ],
  child: [
    { id: 'curious', label: 'Curious', condition: p => p.development.curiosity >= 55 },
    { id: 'imaginative', label: 'Imaginative', condition: p => p.development.stimulation >= 58 },
    { id: 'cautious', label: 'Cautious', condition: () => true }
  ],
  teen: [
    { id: 'resilient', label: 'Resilient', condition: p => p.development.resilience >= 60 },
    { id: 'anxious', label: 'Anxious', condition: p => p.development.stressExposure >= 62 },
    { id: 'independent', label: 'Independent', condition: () => true }
  ],
  adult: [
    { id: 'disciplined', label: 'Disciplined', condition: p => p.development.grades >= 70 },
    { id: 'compassionate', label: 'Compassionate', condition: p => p.development.bonding >= 66 },
    { id: 'pragmatic', label: 'Pragmatic', condition: () => true }
  ]
};

export const ACTIVITY_LABELS = {
  sleeping: 'Sleeping',
  breakfast: 'Eating breakfast',
  lunch: 'Eating lunch',
  dinner: 'Eating dinner',
  eating: 'Eating',
  working: 'Working',
  remoteWork: 'Working from home',
  school: 'Attending school',
  homework: 'Doing homework',
  childcare: 'Caring for the child',
  feeding: 'Preparing a meal',
  comforting: 'Comforting the child',
  changing: 'Changing the baby',
  playing: 'Playing together',
  shopping: 'Buying groceries',
  furnitureShopping: 'Shopping for furniture',
  cleaning: 'Cleaning the house',
  repairing: 'Repairing the house',
  relaxing: 'Relaxing',
  familyTime: 'Family time',
  hobby: 'Enjoying a hobby',
  visiting: 'Visiting friends',
  commuting: 'Walking through town',
  hospital: 'At the hospital',
  socialServices: 'At Family Services',
  construction: 'Working on the house',
  waiting: 'Waiting',
  exploring: 'Exploring',
  park: 'Spending time at the park',
  community: 'At the community center',
  study: 'Studying',
  partTimeWork: 'Working a part-time shift',
  jobHunting: 'Looking for work',
  retirement: 'Enjoying retirement'
};

export const LIFE_EVENTS = [
  {
    id: 'raise',
    title: 'A small raise',
    body: 'A caregiver has been recognized for dependable work. Their next shifts will pay a little more.',
    eligible: state => state.parents.some(parent => parent.job && parent.job.id !== 'caregiver'),
    apply: state => {
      const parent = state.parents.find(item => item.job && item.job.id !== 'caregiver');
      if (parent) parent.payBonus = Math.min(180, (parent.payBonus || 0) + 35);
    }
  },
  {
    id: 'broken-appliance',
    title: 'The refrigerator struggles',
    body: 'The refrigerator needs a repair. The household can pay now or risk losing some food.',
    eligible: state => state.household.home.condition > 20,
    choices: [
      { label: 'Repair it', condition: state => state.household.money >= 180, apply: state => { state.household.money -= 180; state.household.home.condition = Math.min(100, state.household.home.condition + 18); } },
      { label: 'Wait and hope', apply: state => { state.household.food = Math.max(0, state.household.food - 4); state.household.home.condition -= 8; } }
    ]
  },
  {
    id: 'school-friend',
    title: 'A familiar face',
    body: 'A classmate keeps saving a seat nearby. A friendship could grow from small daily choices.',
    eligible: state => ['child','teen'].includes(state.player.stage),
    apply: state => {
      if (!state.player.relationships.some(rel => rel.type === 'friend')) {
        const candidate = state.town.residents.find(resident => resident.stage === state.player.stage || (resident.stage === 'child' && state.player.stage === 'teen'));
        if (candidate) state.player.relationships.push({ id: candidate.id, name: candidate.name, type: 'friend', affection: 28, conflict: 0 });
      }
    }
  },
  {
    id: 'weekend-festival',
    title: 'Town festival',
    body: 'The community center is hosting a small weekend festival with food, music, and neighbors.',
    eligible: state => state.time.totalDays % 7 >= 5,
    choices: [
      { label: 'Go as a family', apply: state => { state.household.money = Math.max(0, state.household.money - 35); state.player.needs.mood = Math.min(100, state.player.needs.mood + 24); state.parents.forEach(parent => parent.needs.mood = Math.min(100, parent.needs.mood + 18)); } },
      { label: 'Stay home and save', apply: state => { state.player.needs.comfort = Math.min(100, state.player.needs.comfort + 8); } }
    ]
  },
  {
    id: 'medical-expense',
    title: 'An unexpected clinic visit',
    body: 'A minor illness needs attention. The cost is inconvenient, but delaying care carries risk.',
    eligible: state => state.player.needs.health < 70,
    choices: [
      { label: 'Visit the clinic', condition: state => state.household.money >= 120, apply: state => { state.household.money -= 120; state.player.needs.health = Math.min(100, state.player.needs.health + 28); } },
      { label: 'Rest at home', apply: state => { state.player.needs.health = Math.min(100, state.player.needs.health + 9); state.player.needs.energy = Math.min(100, state.player.needs.energy + 12); } }
    ]
  },
  {
    id: 'neighbor-visit',
    title: 'A neighbor stops by',
    body: 'A nearby family brings snacks and stays to talk. The house feels busier and warmer for a while.',
    eligible: () => true,
    apply: state => { state.player.needs.mood = Math.min(100, state.player.needs.mood + 10); state.parents.forEach(parent => parent.needs.mood = Math.min(100, parent.needs.mood + 8)); }
  }
];

export const ROOM_LABELS = {
  parentBedroom: 'Parent bedroom',
  kitchen: 'Kitchen',
  diningRoom: 'Dining area',
  livingRoom: 'Living room',
  childBedroom: 'Shared child bedroom',
  teenBedroom: 'Teen bedroom',
  bathroom: 'Bathroom',
  hallway: 'Hallway'
};
