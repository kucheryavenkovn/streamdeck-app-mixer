export const COLORS = ['#4cc9f0', '#b78aff', '#ffbc59', '#5ee3a1'];
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export class Mixer {
  constructor(settings = {}) {
    this.apps = [];
    this.catalog = {};
    this.devices = {};
    this.restore(settings);
  }
  restore(settings) {
    this.catalog = settings.catalog ?? {};
    this.devices = settings.devices ?? {};
    this.excludedKeys = Array.isArray(settings.excludedKeys) ? [...new Set(settings.excludedKeys.filter(key => typeof key === 'string'))] : [];
  }
  device(id) {
    const d = this.devices[id] ??= {};
    d.page = Number.isInteger(d.page) ? Math.max(0, d.page) : 0;
    d.selected = Number.isInteger(d.selected) ? clamp(d.selected, 0, 3) : 0;
    d.pins = Array.isArray(d.pins) ? [...new Set(d.pins)].slice(0, 7) : [];
    d.dials = Array.from({ length: 4 }, (_, i) => d.dials?.[i] ?? { key: null, locked: false });
    return d;
  }
  update(apps) {
    this.apps = apps;
    for (const app of apps) this.catalog[app.key] = { key: app.key, name: app.name };
    // Retain metadata only for current, pinned or assigned applications.
    const retained = new Set(apps.map(a => a.key));
    for (const key of this.excludedKeys) retained.add(key);
    for (const id of Object.keys(this.devices)) {
      const d = this.device(id);
      for (const key of [...d.pins, ...d.dials.map(a => a.key)]) if (key) retained.add(key);
    }
    for (const key of Object.keys(this.catalog)) if (!retained.has(key)) delete this.catalog[key];
  }
  app(key) {
    return this.apps.find(a => a.key === key) ?? (this.catalog[key] ? { ...this.catalog[key], online: false, volume: 0 } : null);
  }
  page(id, capacity = 8, excludedKeys = []) {
    const d = this.device(id);
    if (capacity <= 0) { d.page = 0; return { apps: [], count: 1, index: 0 }; }
    const excluded = new Set([...this.excludedKeys, ...excludedKeys]);
    const pins = d.pins.map(key => this.app(key)).filter(a => a && !excluded.has(a.key)).slice(0, capacity - 1);
    const rest = this.apps.filter(a => !excluded.has(a.key) && !pins.some(p => p.key === a.key));
    const size = capacity - pins.length;
    const count = Math.max(1, Math.ceil(rest.length / size));
    d.page = clamp(d.page, 0, count - 1);
    return { apps: [...pins, ...rest.slice(d.page * size, (d.page + 1) * size)], count, index: d.page };
  }
  turnPage(id, delta, capacity = 8, excludedKeys = []) {
    const { count } = this.page(id, capacity, excludedKeys);
    const d = this.device(id);
    d.page = ((d.page + delta) % count + count) % count;
  }
  togglePin(id, key) {
    const d = this.device(id);
    if (d.pins.includes(key)) d.pins = d.pins.filter(k => k !== key);
    else {
      if (d.pins.length >= 7) return false;
      d.pins.push(key);
    }
    d.page = 0;
    return true;
  }
  movePin(id, key, delta) {
    const pins = this.device(id).pins;
    const from = pins.indexOf(key), to = from + delta;
    if (from < 0 || to < 0 || to >= pins.length) return;
    [pins[from], pins[to]] = [pins[to], pins[from]];
  }
  assign(id, key) {
    const d = this.device(id), target = d.dials[d.selected];
    if (target.locked && target.key !== key) return false;
    target.key = key;
    return true;
  }
  exclude(key) {
    if (!this.excludedKeys.includes(key)) this.excludedKeys.push(key);
  }
  include(key) { this.excludedKeys = this.excludedKeys.filter(k => k !== key); }
  snapshot() {
    // Page and selected dial are transient. Assignments and pins persist per device.
    return { catalog: this.catalog, excludedKeys: this.excludedKeys, devices: Object.fromEntries(Object.keys(this.devices).map(id => {
      const d = this.device(id);
      return [id, { pins: d.pins, dials: d.dials }];
    })) };
  }
}
