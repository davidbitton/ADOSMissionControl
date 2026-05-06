# Changelog

All notable changes to ADOS Mission Control are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the project follows [Semantic Versioning](https://semver.org/).

## [0.10.6] - 2026-05-07

### Added

- Fleet drone card now surfaces a small amber "auto" pill when the agent
  reports that its profile was picked by hardware auto-detection rather
  than an operator. Three values trigger the pill: `detected` (clean
  fingerprint match), `tiebreaker` (auto with ambiguous signals), and
  `default` (no detect signals, fell back). Profiles set by an operator
  in the setup webapp or forced via `/etc/ados/board_override` render
  no pill, matching the prior layout for legacy heartbeats.
- Cloud heartbeat schema accepts two new optional fields, `setupState`
  and `profileSource`, so the universal setup contract on the agent
  side has a place to land in the cloud relay. Both flow into the
  per-drone capability store. `profileSource` also syncs into the
  `cmd_drones` row alongside `runtimeMode` and `attachedDisplayType`
  so the fleet card renders the pill without an extra per-drone query.

## [0.10.5] - 2026-05-06

### Fixed

- Desktop release pipeline now builds the macOS DMG. The `@xmldom/xmldom`
  override pinned the package to `^0.9.10`, whose strict-mode parser
  rejects `parseFromString(content)` calls without a mime type. That
  broke `electron-builder`'s plist parser end of `app-builder-lib`,
  which relies on the older lenient API. Override relaxed to `^0.8.10`
  so the security-patched `0.8.x` line ships and the build pipeline
  succeeds. No source code imports `@xmldom/xmldom` directly; this
  override only affected transitive consumers.

## [0.10.4] - 2026-05-06

Headline fix: the desktop app no longer hangs as a hidden process when the
embedded server fails to start. Plus a wide pass on the firmware tab, plugin
host foundation, fleet overview, and the Hardware tab.

### Fixed

- Desktop app now opens its window reliably on macOS and Windows. Previously,
  if the embedded Next.js standalone server failed to start within the
  startup timeout, the window-creation path was never reached and the app
  sat as a hidden process with no way to recover. Three changes close this:
  - `app.whenReady()` is wrapped so any startup failure surfaces an error
    dialog and the app exits cleanly instead of leaving a windowless process.
  - The window force-shows on `did-finish-load` and `did-fail-load` so a
    renderer that loads but never emits `ready-to-show`, or a page that
    fails to load, no longer leaves the user staring at a dock icon.
  - Server-startup wait reduced from 30s to 15s so genuine failures surface
    quickly instead of feeling like the app is frozen.
- Single-instance lock now hard-exits the secondary process instead of
  letting initialization continue past `app.quit()`.
- Windows installer events (`--squirrel-install`, `--squirrel-updated`,
  `--squirrel-uninstall`, `--squirrel-obsolete`) exit the app immediately
  so installer-spawned processes do not linger as windowless background apps.

### Added

- **ADOS agent stack support in the firmware tab.** Flash the agent
  software stack alongside flight-controller firmware, with a Rockchip
  bootrom flasher for ADOS-class companion computers. The agent manifest
  is signed with minisign and verified at install time; an offline catalog
  UI lets operators pick a build without a live network connection. Schema
  versioning on the manifest keeps older clients compatible.
- **Fleet overview** with live video and telemetry on the Command page.
  Multiple drones at a glance, with each card pulling its own status,
  battery, GPS fix, runtime mode, and live preview.
- **Plugin host foundation** for ADOS plugins. Settings page exposes a
  Plugins tab with an installed-plugins list and a registry browser. The
  slot orchestrator mounts each plugin contribution into a sandboxed
  iframe gated on a `ui.slot.*` capability. Two-stage install dialog
  parses the manifest and shows the permission set before commit, with
  partial-grant failure surfaces and pinned required permissions.
- **Hardware tab** surfaces attached SPI displays at the fleet level and
  on individual drone cards. The tab populates from the agent's
  `profile` and `hardware-check` payloads, and `runtimeMode` propagates
  through the capability inference fallback path so older agents without
  an explicit field still gate features correctly.
- **Setup-and-access integration** end-to-end with the agent. The Command
  page consumes the universal setup contract (status, access URLs,
  remote-access state) and surfaces it with cloud-relay enhancements.
- **CLI service-management and production-deployment wizard** for
  self-hosted Convex backends.
- `/pair` deep link now accepts a pre-filled pairing code, simplifying
  field setup from a printed sticker or QR.
- Camera-trigger toggle on simulation drones, with sync-performance
  improvements while the toggle runs.
- Conditional planner UI render based on whether a plan is active, idle,
  loaded, or dirty.

### Changed

- **Capability inference** now covers BCM2710A1 (Pi Zero 2 W), BCM2711
  (Pi 4B), BCM2712 (Pi 5), RV1106G3 (Luckfox class), and RV1103 SoCs,
  with NPU TOPS lookup for each.
- **Runtime-mode propagation:** `runtimeMode` flows from the agent
  heartbeat through `cmd_droneStatus` and `cmd_drones` into the
  capability store. The fleet card renders a small "Lite" pill for
  drones running the constrained backend; Smart Modes, ROS, and Scripts
  tabs hide on lite-mode drones.
- **Cloud-relay HTTP routes** moved behind internal Convex functions,
  with input validation, response size limits, and safety overrides on
  every command-path entry.
- **Cloud-command gating:** the GCS no longer enqueues cloud commands
  when the user is not authenticated.
- **Convex skip-guards** added across the Command page so reactive
  queries no longer crash when auth or runtime context is absent.
- **Locale-aware number rendering** for currency, percent, and decimal
  values; telemetry freshness now flags stale data older than 45s.
- **Zustand store hardening:** added version + migrate handlers across
  persisted stores; previously `any`-typed surfaces now use Zod schemas
  for runtime validation.
- iNav mock protocol corrections and roadmap-copy refresh in locales.

## [0.10.1] - 2026-05-05

Companion release for the lightweight Rust agent backend. Surfaces a
"Lite" pill on the fleet card and hides UI surfaces the lite backend
does not ship.

### Added
- Fleet card renders a small "Lite" badge next to the drone name when
  the agent reports `runtimeMode: "lite"`. Visible at a glance so
  operators know the drone is running the constrained backend.
- `runtimeMode` field on the `cmd_droneStatus` table and on the
  `cmd_drones` table. The status push handler propagates the value
  from heartbeats into the paired-drone row so reactive consumers
  pick it up without a second query. Schema additions are
  optional / backward-compatible; existing clients see `undefined`
  and default to "full".
- `runtimeMode` field on the `AgentCapabilities` interface and the
  `agent-capabilities-store`. The capability normalizer accepts
  either `runtimeMode` or `runtime_mode` from agent payloads.
- SoC-to-NPU table entries for BCM2710A1 (Pi Zero 2 W), BCM2711
  (Pi 4B / CM4), BCM2712 (Pi 5), RV1106G3 (Luckfox Pico Zero),
  and RV1103 (Luckfox Pico) so capability inference does not return
  null for those targets.

### Changed
- `useVisibleTabs` excludes the Smart Modes, ROS, and Scripts
  Command-page sub-tabs when `runtimeMode === "lite"`. The lite
  backend does not ship the plugin host, peripheral manager,
  scripting tier, or ROS integration; offering those tabs would lead
  to broken handlers.
- `FleetDrone` and `CloudDroneBridge` carry the `runtimeMode`
  field through to the fleet store so the drone card can read it
  without subscribing to a per-drone status query.
- The Calibrate, Parameters, and Configure tabs on the drone-detail
  panel are intentionally NOT gated. They serve all backend variants
  including lite (FC connection works on lite) and stay visible.

### Notes
- The lite Rust agent codebase lives at `agents/lite-rs/` in the
  ADOSDroneAgent repository. CI publishes prebuilt signed binaries
  to GitHub Releases. Operators install the lite backend with
  `ADOS_PROFILE=lite-rs` set as an environment variable on the
  install.sh invocation.

## [0.9.11] - 2026-05-04

This release lands universal-setup integration on the GCS side and
a security + reliability sweep on the cloud-relay surface.

### Added

- **Setup-and-access card.** New shared component at
  `src/components/hardware/SetupAccessCard.tsx`. Reads the agent's
  `/api/v1/setup/status` (or, when no agent is connected locally,
  the most recent cloud-relay snapshot) and shows completion
  percent, the next-action sentence, MAVLink / video / remote-access
  state, and direct links to the agent's setup webapp and any
  advertised tunnel URL.
- **Disconnected-state setup handoff.** The Hardware Overview empty
  state now surfaces "Open setup" when the cloud relay carries an
  advertised setup URL for any drone the operator has paired,
  alongside the existing "Connect ground station" action.
- **Agent client `getSetupStatus()`** at `src/lib/agent/client.ts`
  with a `SetupStatusSchema` zod schema validating the full
  response tree (`SetupStep`, `SetupAccessUrl`, `MavlinkAccess`,
  `VideoAccess`, `RemoteAccessStatus`, `NetworkStatus`).
- **Cloud-relay schema** carries absolute URLs from the agent:
  `setupUrl`, `apiUrl`, `missionControlUrl`, `videoWhepUrl`,
  `mavlinkWsUrl`, and `remoteAccess`. Both `convex/schema.ts` and
  `convex/cmdDroneStatus.ts` accept the new fields, and
  `convex/http.ts` ingests them. The Command fleet store, the
  CloudStatusBridge mapper, and the agent video-session hook
  prefer the absolute URLs over rebuilding from `lastIp + port`.
- **`feat(command)`**: fleet overview tile with live video and
  telemetry. `CommandFleetOverview.tsx` now renders an inline
  WHEP video preview alongside the per-drone telemetry chips,
  driven by the new absolute-URL plumbing on the agent side.
- **`feat(simulation)`**: camera-trigger toggle. Sim drones now
  publish trigger events the planner consumes, with sync-perf
  improvements on the playback path.
- **`feat(planner)`**: conditional UI render based on the active
  plan. Idle / loaded / dirty states diverge cleanly so the
  planner does not animate empty panels on cold start.
- **`feat(cli)`**: production-deployment wizard and service-
  management subcommands on the `altnautica-command` CLI. Prompts
  walk through TLS, MQTT, video-relay, and Convex bindings; the
  service subcommand wraps `systemctl` for the standard units.
  Public-docs entry at `docs/cli-reference.md` and self-hosting
  guide updated.
- **`AGENTS.md`** with agentic-coding instructions for AI contributors.

### Changed

- **Hardware Overview poll on `/api/v1/setup/status`** gained a
  visibility guard so it pauses while the tab is hidden, matching
  the ground-station poll on the same page.
- **CommandFleetOverview** prefers absolute `videoWhepUrl` and
  `mavlinkWsUrl` advertised by the agent before falling back to
  the previous `lastIp + port` reconstruction.

### Fixed

- **`fix(cloud-relay)`**: agent-facing HTTP routes are now backed
  by Convex internal mutations only. External callers can no
  longer reach the heartbeat write path directly.
- **`fix(CloudStatusBridge)`**: the bridge no longer enqueues
  cloud commands when the user is unauthenticated; previously a
  silent failure path could fire commands during sign-out.
- **`fix(use-agent-video-session)`**: null-check before assigning
  `srcObject` to the video element. Closes a TypeError on disconnect.
- **`fix`**: prevent connection attempt when `whepUrl` is missing.
  The video pipeline used to fire WebRTC negotiation against
  `undefined` after a partial cloud-status snapshot.
- **`fix(ui)`**: escape quotes in UI text and clean up test mocks
  flagged by the linter.
- **`fix`**: input validation, response limits, and safety overrides
  on the agent-facing surface. Bounds requests that previously
  could wedge the relay on malformed payloads.

### Notes

- Pairs with ADOS Drone Agent v0.10.0 (universal setup contract).
- Mission Control still consumes `lastIp + port` as a fallback so
  older agents continue to work without re-pairing.
- Convex schema is in sync with the website's `convex/schema.ts`
  per the dual-Convex convention.
