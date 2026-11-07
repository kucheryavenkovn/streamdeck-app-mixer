# App Mixer · Stream Deck + (Windows)

A local Windows audio-session mixer: eight application keys and four encoders.
No Voicemeeter, no audio recording, no administrator rights, no network server.

> Since 2026-11-07 the code lives in its own repository. The "Yandex Music" plugin
> was split out into [`streamdeck-yamusic`](https://github.com/). The original
> monolithic repo `D:\git\streamdeck` now hosts MiniFuse Desk research only.

## Layout

- `src/` — Node.js plugin logic: `plugin.mjs` (entry), `controller.mjs`, `model.mjs`,
  `render.mjs`, `routing.mjs`, `bridge.mjs` (JSON-protocol client for the native bridge).
- `native/AudioBridge/` — self-contained .NET bridge to the Windows Audio Sessions API
  (single-file; end users do not need the .NET Runtime). Supports `--self-test`.
- `native/LaunchProbe/` — development tool for verifying app launch (not shipped in the package).
- `plugin/` — manifest, generated icons, encoder layout, property-inspector UI, licenses.
- `scripts/` — build, profile generation, checks.
- `tests/` — unit tests (`node --test`).

## Build & install

1. Backup: `pwsh -File scripts/backup.ps1`. Copies `%APPDATA%\Elgato\StreamDeck` data and
   the HKCU StreamDeck registry branch; profile files are verified with SHA-256. The backup
   may contain private settings — do not publish it.
2. `npm ci`, `npm test`, `npm run build` (.NET SDK 10, Node.js 20+).
3. `npx streamdeck validate dist/local.tux.appmixer.sdPlugin`.
4. `npx streamdeck pack dist/local.tux.appmixer.sdPlugin -o dist`, open
   `dist/local.tux.appmixer.streamDeckPlugin` and confirm the plugin install.
   Developer mode is not required.
5. Open `dist/AppMixer.streamDeckProfile` and import the **new** profile
   **App Mixer - Windows**. The package has its own profile/page/action UUIDs;
   existing profiles are never edited.

`npm run build` keeps an already-created new-profile package so rebuilds do not create
duplicate profiles. The build never deletes or replaces user profiles.

## Controls

| Gesture | Effect |
|---|---|
| Touch a dial section | Select the encoder for assignment; a colored frame appears |
| Press an app key | Assign the app to the selected encoder; launch it if a pinned app is closed |
| Hold a key ≥650 ms | Pin/unpin the key at the front of the list |
| Rotate an encoder | Change volume (10% per step by default) |
| Press & release an encoder without rotating | Mute/unmute |
| Press & rotate an encoder | Previous/next application page |
| Hold a dial section | LOCK/unlock the encoder assignment |

Actions: "App (slot)" (key), "Mixer channel" (encoder), "System audio output" and
"App audio output" (encoders, output routing). Explicit key bindings, auto-list
exclusions and pins are persisted per device by Stream Deck itself.

## Windows specifics

- An app appears after its audio session is created (usually after sound playback starts).
- Binding is by full EXE path, not PID; all sessions of one EXE are merged.
- Sessions of protected/elevated processes may be unavailable; no admin elevation is requested.
- Per-app routing uses an undocumented Windows API — see "Technical debt".
- Level updates are polled every 200 ms; session/device discovery runs in the background (2 s pause).

## Checks

```powershell
npm test
pwsh -File scripts/check-profile.ps1
node scripts/smoke.mjs
node scripts/latency.mjs
node scripts/check-launch.mjs
node scripts/check-routing.mjs
./dist/local.tux.appmixer.sdPlugin/bin/native/AudioBridge.exe --self-test
```

The smoke test runs the packaged plugin against a mock Stream Deck host and the real
read-only audio bridge. The self-test creates its own **silent** audio session and
exercises volume/mute/unmute only inside it; user apps and master volume are untouched.

`npm run preview` — interactive demo with dummy data at `http://127.0.0.1:18081`.

## Technical debt

1. **Mandatory migration to `@elgato/streamdeck` v2+.** The Stream Deck WebSocket
   protocol is currently implemented manually with the `ws` package (`src/plugin.mjs`).
   This is a hard Elgato requirement for DRM and Marketplace publishing: Node.js plugins
   must use the official SDK. Bump `SDKVersion` to **3** and `Software.MinimumVersion`
   to **6.9+** as well (currently 2 / 6.6).
2. **UUID with the `local.` prefix** (`local.tux.appmixer`). Move to a vendor namespace
   (e.g. `com.tux.appmixer`) before store submission. Changing the UUID is a new plugin
   identity: users would have to reinstall it and re-import their profile. Decide before
   the first Maker Console submission.
3. **Code duplication** with the `streamdeck-yamusic` repo (`bridge.mjs`, render helpers,
   bridge protocol). Consider a shared library (git submodule / npm package) once both
   plugins stabilize.
4. **DRM file requirements**: distributed files must be immutable at runtime and the
   manifest must not be read at runtime. Verify before submission that the plugin writes
   nothing into its own folder and never opens `manifest.json`.
5. **Per-app routing** (`set-app-output`) relies on an undocumented Windows API.
   Compatibility with all future Windows builds is not guaranteed; on error the previous
   assignments are rolled back and a message is shown.
6. **No CI.** Tests, smoke and self-test are run manually on the dev machine; add
   GitHub Actions (at least `npm test` on every push).
7. **Localization**: UI and action texts are Russian-only. The store needs an English
   version (SDK i18n) or at least English names/tooltips.
8. **Icons are generated programmatically** (`scripts/build-icons.ps1`). Proper artwork
   (144×144 and 288×288) and gallery screenshots are needed for the store listing.
9. **`LaunchProbe`** is a dev tool; it is not version-pinned and not covered by package tests.
