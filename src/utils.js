import { DAYS, STAGES } from './config.js';

export const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
export const lerp = (a, b, t) => a + (b - a) * t;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const titleCase = (value = '') => String(value).replace(/\b\w/g, c => c.toUpperCase());
export const formatTime = minute => `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(Math.floor(minute % 60)).padStart(2, '0')}`;
export const formatAge = age => age < 1 ? `${Math.max(0, Math.floor(age * 12))} months` : `${Math.floor(age)} years`;
export const peso = amount => `₱${Math.round(Number(amount) || 0).toLocaleString('en-PH')}`;
export const dayName = totalDays => DAYS[((Math.floor(totalDays) % 7) + 7) % 7];
export const isWeekend = totalDays => (Math.floor(totalDays) % 7) >= 5;
export const isWeekday = totalDays => !isWeekend(totalDays);
export const stageForAge = age => STAGES.find(stage => age >= stage.min && age < stage.max)?.id || 'elder';
export const nowGameStamp = state => state.time.totalDays * 1440 + state.time.minute;
export const minutesBetween = (a, b) => Math.abs(a - b);
export const randomId = prefix => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e7)}`;
export const deepClone = value => JSON.parse(JSON.stringify(value));
export const storageGet = key => { try { return localStorage.getItem(key); } catch { return null; } };
export const storageSet = (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } };
export const storageRemove = key => { try { localStorage.removeItem(key); } catch {} };

export class RNG {
  constructor(seed, state = null) {
    this.seed = String(seed || 'born-into');
    this.state = state ?? RNG.hash(this.seed);
  }

  static hash(text) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  next() {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.state >>>= 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  float(min, max) {
    return min + this.next() * (max - min);
  }

  chance(probability) {
    return this.next() < probability;
  }

  pick(list) {
    if (!list?.length) return null;
    return list[Math.floor(this.next() * list.length)];
  }

  weighted(items, weightFn = item => item.weight ?? 1) {
    const weighted = items.filter(Boolean).map(item => ({ item, weight: Math.max(0, Number(weightFn(item)) || 0) }));
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    if (!total) return weighted[0]?.item ?? null;
    let cursor = this.next() * total;
    for (const entry of weighted) {
      cursor -= entry.weight;
      if (cursor <= 0) return entry.item;
    }
    return weighted.at(-1)?.item ?? null;
  }

  shuffle(list) {
    const copy = [...list];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = this.int(0, index);
      [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
  }
}

export function moveToward(entity, target, amount) {
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const length = Math.hypot(dx, dy);
  if (length <= amount || length < 0.001) {
    entity.x = target.x;
    entity.y = target.y;
    return true;
  }
  entity.x += (dx / length) * amount;
  entity.y += (dy / length) * amount;
  entity.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  return false;
}

export function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

export function rectsOverlap(a, b, padding = 0) {
  return a.x < b.x + b.w + padding && a.x + a.w + padding > b.x && a.y < b.y + b.h + padding && a.y + a.h + padding > b.y;
}

export function safeText(value, fallback = '') {
  const text = String(value ?? fallback).trim();
  return text || fallback;
}

export function hashNumber(value) {
  return RNG.hash(String(value));
}

export function seededPhase(id, max = Math.PI * 2) {
  return (hashNumber(id) / 4294967296) * max;
}

export function getWeekIndex(totalDays) {
  return Math.floor(totalDays / 7);
}

export function getDayIndex(totalDays) {
  return Math.floor(totalDays) % 7;
}

export function gameDateLabel(state) {
  const week = getWeekIndex(state.time.totalDays) + 1;
  return `${dayName(state.time.totalDays).slice(0, 3)} · D${Math.floor(state.time.totalDays)+1} · W${week} · ${formatTime(state.time.minute)}`;
}

export function compactList(items, max = 3) {
  if (items.length <= max) return items.join(', ');
  return `${items.slice(0, max).join(', ')} +${items.length - max}`;
}
