import { Mixer, clamp } from './model.mjs';
import { keySvg, dialSvg, outputSvg, dataUri } from './render.mjs';
import { APP_OUTPUT, SYSTEM_OUTPUT, isRouting, outputOptions } from './routing.mjs';

export const UUID = 'local.tux.appmixer';
export const KEY = `${UUID}.app`;
export const DIAL = `${UUID}.dial`;
const encoders = [DIAL, APP_OUTPUT, SYSTEM_OUTPUT];
const appEncoders = [DIAL, APP_OUTPUT];

export class Controller {
  constructor({ send, audio, log = () => {}, now = Date.now }) {
    this.send = send;
    this.audio = audio;
    this.log = log;
    this.now = now;
    this.mixer = new Mixer();
    this.actions = new Map();
    this.down = new Map();
    this.images = new Map();
    this.error = null;
    this.ready = false;
    this.queue = Promise.resolve();
    this.warningSignature = '';
    this.notices = new Map();
    this.launching = new Map();
    this.routing = { outputs: [], systemOutputId: null, appRoutingSupported: false };
    this.outputCandidates = new Map();
  }
  command(event, context, payload) { this.send({ event, context, ...(payload === undefined ? {} : { payload }) }); }
  save() {
    if (this.ready) this.command('setGlobalSettings', this.uuid, this.mixer.snapshot());
  }
  reject(action, context, message) {
    this.notices.set(action.device, { message, until: this.now() + 10000 });
    this.log(message);
    this.command('showAlert', context);
    this.inspector(context);
  }
  ingest(result) {
    this.error = null;
    this.mixer.update(result.apps);
    if (Array.isArray(result.outputs)) this.routing = { outputs: result.outputs, systemOutputId: result.systemOutputId,
      appRoutingSupported: result.appRoutingSupported, error: result.routingError };
    const warnings = (result.warnings ?? []).join('\n');
    if (warnings && warnings !== this.warningSignature) this.log(warnings);
    this.warningSignature = warnings;
    this.render();
  }
  async refresh() {
    // All bridge operations are serialized so an older scan cannot overwrite a newer adjustment.
    return this.operation('list');
  }
  operation(op, payload = {}, context) {
    const task = this.queue.then(async () => {
      try {
        const result = await this.audio.request(op, payload);
        if (Array.isArray(result.apps)) this.ingest(result);
        return result;
      }
      catch (error) {
        this.log(error.message);
        if (op === 'list') {
          this.error = error.message;
          this.mixer.update([]);
        }
        if (context) {
          const action = this.actions.get(context);
          if (action) this.reject(action, context, error.message);
          else this.command('showAlert', context);
        }
        this.render();
      }
    });
    this.queue = task.catch(error => this.log(error.message));
    return this.queue;
  }
  pageFor(device) {
    const keys = [...this.actions.values()].filter(a => a.device === device && a.action === KEY);
    const automatic = keys.filter(a => !a.settings?.application?.key)
      .sort((a, b) => a.row - b.row || a.column - b.column);
    const excluded = keys.flatMap(a => a.settings?.application?.key ? [a.settings.application.key] : []);
    return { ...this.mixer.page(device, automatic.length, excluded), automatic, excluded };
  }
  turnPage(device, delta) {
    const page = this.pageFor(device);
    this.mixer.turnPage(device, delta, page.automatic.length, page.excluded);
  }
  appFor(action) {
    if (action.action === SYSTEM_OUTPUT) return null;
    if (appEncoders.includes(action.action)) return this.mixer.app(this.mixer.device(action.device).dials[action.column]?.key);
    const bound = action.settings?.application;
    if (bound?.key) return this.mixer.app(bound.key) ?? { ...bound, online: false, volume: 0 };
    const page = this.pageFor(action.device);
    return page.apps[page.automatic.indexOf(action)] ?? null;
  }
  outputState(context, action) {
    const app = this.appFor(action), options = outputOptions(action.action, this.routing);
    let candidate = this.outputCandidates.get(context);
    if (candidate && (candidate.key !== app?.key || !options.some(d => d.id === candidate.id))) {
      this.outputCandidates.delete(context); candidate = null;
    }
    const current = action.action === SYSTEM_OUTPUT ? this.routing.systemOutputId : app?.policyOutputId ?? null;
    const chosen = options.find(d => d.id === (candidate ? candidate.id : current));
    return { options, chosen, pending: !!candidate, supported: action.action === SYSTEM_OUTPUT || this.routing.appRoutingSupported };
  }
  previewOutput(context, action, id) {
    if (!outputOptions(action.action, this.routing).some(d => d.id === id)) return;
    this.outputCandidates.set(context, { id, key: this.appFor(action)?.key });
  }
  async applyOutput(context, action) {
    const state = this.outputState(context, action), app = this.appFor(action);
    if (!state.chosen) { this.reject(action, context, 'Нет доступного устройства вывода.'); return; }
    if (!state.supported) { this.reject(action, context, this.routing.error ?? 'Эта версия Windows не поддерживает переключение выхода приложения.'); return; }
    if (action.action === APP_OUTPUT && (!app || app.online === false)) {
      this.reject(action, context, 'Выберите приложение кнопкой и начните воспроизведение звука.'); return;
    }
    const result = await this.operation(action.action === SYSTEM_OUTPUT ? 'set-system-output' : 'set-app-output', {
      ...(action.action === APP_OUTPUT ? { key: app.key } : {}), deviceId: state.chosen.id
    }, context);
    if (result) {
      this.outputCandidates.delete(context);
      this.notices.set(action.device, { message: `Выбран выход «${state.chosen.name}». Некоторые приложения требуют перезапуска воспроизведения.`, until: this.now() + 10000 });
      this.render(); this.inspector(context);
    }
  }
  render() {
    if (!this.ready) return;
    for (const [context, action] of this.actions) {
      const d = this.mixer.device(action.device), page = this.pageFor(action.device);
      const app = this.appFor(action);
      const routing = isRouting(action.action) ? this.outputState(context, action) : null;
      const source = routing
        ? outputSvg(app, { system: action.action === SYSTEM_OUTPUT, slot: action.column, selected: d.selected === action.column,
          output: routing.chosen, pending: routing.pending, supported: routing.supported })
        : action.action === DIAL
        ? dialSvg(app, { slot: action.column, selected: d.selected === action.column, locked: d.dials[action.column].locked,
          page: page.index, count: page.count, error: !!this.error })
        : keySvg(app, { pinned: d.pins.includes(app?.key), dials: d.dials.flatMap((dial, i) => dial.key && dial.key === app?.key ? [i] : []), error: !!this.error });
      if (this.images.get(context) === source) continue;
      this.images.set(context, source);
      if (encoders.includes(action.action)) this.command('setFeedback', context, { canvas: dataUri(source) });
      else this.command('setImage', context, { image: dataUri(source), target: 0 });
    }
  }
  inspector(context) {
    const action = this.actions.get(context);
    if (!action) return;
    const d = this.mixer.device(action.device), page = this.pageFor(action.device);
    this.command('sendToPropertyInspector', context, {
      type: 'status', apps: this.mixer.apps.map(({ key, name }) => ({ key, name })),
      pins: d.pins.map(key => this.mixer.app(key)), dials: d.dials, page: page.index + 1, pages: page.count,
      error: this.error, warnings: this.warningSignature, selected: d.selected,
      notice: this.notices.get(action.device)?.until > this.now() ? this.notices.get(action.device).message : null,
      channels: d.dials.map((dial, slot) => ({ slot, name: this.mixer.app(dial.key)?.name ?? 'Не назначен', locked: dial.locked,
        available: [...this.actions.values()].some(a => a.device === action.device && appEncoders.includes(a.action) && a.column === slot) })),
      boundApplication: action.settings?.application ?? null,
      currentApplication: this.appFor(action)?.key ?? null,
      actionSettings: action.settings,
      excludedApps: this.mixer.excludedKeys.map(key => this.mixer.app(key) ?? { key, name: key }),
      routing: isRouting(action.action) ? this.outputState(context, action) : null
    });
  }
  async handle(ev) {
    const { event, context, payload = {}, device } = ev;
    if (event === 'didReceiveGlobalSettings') {
      // Global settings arrive asynchronously after registration. Do not overwrite them with defaults.
      const transient = this.ready ? Object.entries(this.mixer.devices).map(([id, d]) => [id, { selected: d.selected, page: d.page }]) : [];
      this.mixer.restore(payload.settings ?? {});
      for (const [id, state] of transient) Object.assign(this.mixer.device(id), state);
      this.mixer.update(this.mixer.apps);
      this.ready = true;
      this.render();
      return;
    }
    if (event === 'willAppear') {
      if (![KEY, ...encoders].includes(ev.action) || payload.isInMultiAction) return;
      const column = payload.coordinates?.column ?? 0, row = payload.coordinates?.row ?? 0;
      if (column > 3 || (ev.action === KEY && row > 1)) { this.command('showAlert', context); return; }
      this.actions.set(context, { action: ev.action, device, column, row, settings: payload.settings ?? {} });
      if (encoders.includes(ev.action)) this.command('setFeedbackLayout', context, { layout: 'layouts/mixer.json' });
      this.command('setTitle', context, { title: '', target: 0 });
      this.images.delete(context);
      this.render();
      return;
    }
    if (event === 'willDisappear') {
      this.actions.delete(context); this.images.delete(context); this.down.delete(context); this.outputCandidates.delete(context); this.render(); return;
    }
    if (event === 'deviceDidDisconnect') {
      for (const [id, a] of this.actions) if (a.device === device) {
        this.actions.delete(id); this.images.delete(id); this.down.delete(id);
      }
      return;
    }
    if (!this.ready) return;
    const action = this.actions.get(context);
    if (!action) return;
    const d = this.mixer.device(action.device);
    const app = this.appFor(action);
    const alert = (message = 'Действие отклонено: приложение или канал недоступны.') => this.reject(action, context, message);
    const lockedMessage = () => `Валкодер ${d.selected + 1} закреплён (LOCK) за «${this.mixer.app(d.dials[d.selected].key)?.name ?? 'приложением'}». Нажмите «Разблокировать выбранный валкодер» в настройках кнопки.`;
    if (event === 'keyDown' || event === 'dialDown') {
      // Capture key at press time: a page change or new session must not retarget keyUp.
      this.down.set(context, { time: this.now(), key: app?.key, name: app?.name, rotated: false });
    } else if (event === 'keyUp') {
      const press = this.down.get(context);
      this.down.delete(context);
      if (!press?.key) return;
      this.mixer.catalog[press.key] ??= { key: press.key, name: press.name ?? press.key };
      if (this.now() - press.time >= 650) {
        if (!this.mixer.togglePin(action.device, press.key)) alert('Уже закреплено 7 приложений. Сначала открепите одно из них.');
      } else {
        const available = [...this.actions.values()].filter(a => a.device === action.device && appEncoders.includes(a.action)).map(a => a.column);
        if (!available.length) { alert('На этой странице нет «Канала микшера». Добавьте его на валкодер.'); return; }
        if (!available.includes(d.selected)) d.selected = available[0];
        if (!this.mixer.assign(action.device, press.key)) alert(lockedMessage());
        else {
          this.notices.delete(action.device);
          this.log(`Выбрано «${press.name}» для валкодера ${d.selected + 1}.`);
          const target = this.mixer.app(press.key) ?? (action.settings?.application?.key === press.key ? { ...action.settings.application, online: false } : null);
          const pinned = action.settings?.application?.key === press.key || d.pins.includes(press.key);
          if (pinned && target?.online === false && /\.exe$/i.test(press.key)) {
            if ((this.launching.get(press.key) ?? 0) <= this.now()) {
              this.launching.set(press.key, this.now() + 8000);
              const result = await this.operation('launch', { key: press.key }, context);
              if (result?.launch) {
                const message = result.launch.status === 'already-running'
                  ? `«${press.name}» уже работает. Начните воспроизведение звука, чтобы появился регулятор громкости.`
                  : `«${press.name}» запускается. Громкость станет доступна после появления аудиосессии.`;
                this.notices.set(action.device, { message, until: this.now() + 10000 });
                this.inspector(context);
              } else this.launching.delete(press.key);
            }
          }
        }
      }
      this.save();
    } else if (event === 'dialRotate') {
      if (payload.pressed) {
        const press = this.down.get(context);
        if (press) press.rotated = true;
        this.turnPage(action.device, Math.sign(payload.ticks));
      } else if (isRouting(action.action)) {
        const state = this.outputState(context, action);
        if (state.options.length && payload.ticks) {
          const current = Math.max(0, state.options.findIndex(d => d.id === state.chosen?.id));
          const next = ((current + payload.ticks) % state.options.length + state.options.length) % state.options.length;
          this.previewOutput(context, action, state.options[next].id);
        }
      } else if (app?.online !== false && app) {
        const step = clamp(Number(action.settings.step) || 10, 1, 10);
        await this.operation('adjust', { key: app.key, delta: clamp(payload.ticks * step, -100, 100) }, context);
      } else alert();
    } else if (event === 'dialUp') {
      const press = this.down.get(context);
      this.down.delete(context);
      if (press && !press.rotated) {
        if (action.action === APP_OUTPUT && press.key !== this.appFor(action)?.key) alert('Приложение изменилось во время нажатия. Подтвердите выход заново.');
        else if (isRouting(action.action)) await this.applyOutput(context, action);
        else {
          const target = this.mixer.app(press.key);
          if (target && target.online !== false) await this.operation('mute', { key: target.key }, context);
          else alert();
        }
      }
    } else if (event === 'touchTap') {
      d.selected = action.column;
      if (payload.hold && action.action === SYSTEM_OUTPUT) this.outputCandidates.delete(context);
      else if (payload.hold && d.dials[action.column].key) {
        d.dials[action.column].locked = !d.dials[action.column].locked;
        this.save();
      }
    } else if (event === 'didReceiveSettings') {
      action.settings = payload.settings ?? {};
    } else if (event === 'propertyInspectorDidAppear') {
      this.inspector(context);
    } else if (event === 'sendToPlugin') {
      const key = payload.key;
      if (payload.command === 'status') this.inspector(context);
      if (payload.command === 'selectDial') d.selected = clamp(Number(payload.slot) || 0, 0, 3);
      if (payload.command === 'previewOutput' && isRouting(action.action)) this.previewOutput(context, action, payload.deviceId);
      if (payload.command === 'applyOutput' && isRouting(action.action)) await this.applyOutput(context, action);
      if (payload.command === 'cancelOutput' && isRouting(action.action)) this.outputCandidates.delete(context);
      if (payload.command === 'exclude' && this.mixer.app(key)) {
        this.mixer.exclude(key); this.save();
      }
      if (payload.command === 'include' && this.mixer.excludedKeys.includes(key)) {
        this.mixer.include(key); this.save();
      }
      if (payload.command === 'bindKey' && action.action === KEY) {
        const target = this.mixer.app(key);
        if (!key || target) {
          // Per-action settings bind THIS physical key, independently of dial selection and pages.
          action.settings = { ...action.settings, application: target ? { key: target.key, name: target.name, icon: target.icon ?? null } : null };
          this.command('setSettings', context, action.settings);
        } else alert();
      }
      if (payload.command === 'page') this.turnPage(action.device, Math.sign(payload.delta));
      if (payload.command === 'pin' && this.mixer.app(key)) {
        if (!this.mixer.togglePin(action.device, key)) alert();
        this.save();
      }
      if (payload.command === 'movePin' && d.pins.includes(key)) {
        this.mixer.movePin(action.device, key, Math.sign(payload.delta)); this.save();
      }
      if (payload.command === 'assign' && this.mixer.app(key)) {
        d.selected = clamp(Number(payload.slot) || 0, 0, 3);
        if (!this.mixer.assign(action.device, key)) alert(lockedMessage());
        this.save();
      }
      if (payload.command === 'unlock') {
        const index = clamp(Number(payload.slot) || 0, 0, 3);
        d.dials[index].locked = false;
        this.notices.delete(action.device);
        this.save();
      }
      this.inspector(context);
    }
    this.render();
  }
}
