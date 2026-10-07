# Validation

## Automated coverage

The `Game quality` workflow runs JavaScript syntax checks and Node tests, followed by Chromium and WebKit browser jobs. The Chromium job also runs the controlled-clock campaign and interaction suites. A workflow result applies to its tested commit; screenshots and JSON reports are attached as artifacts.

| Suite | Coverage | Boundary |
| --- | --- | --- |
| `tests/*.test.cjs` | Four-legged dog meshes and animation, portrait/asset consistency, save normalization and recovery, monotonic progress, scoring, lanes, pixel budgets, audio cleanup, bounded timing and deployment configuration | Mesh checks inspect geometry and resources; audio uses a mocked graph; workflow assertions inspect configuration rather than emulate the Actions scheduler |
| `tests/simulation.py` | All nine stages, all twelve stickers, input cancellation, shield pause duration, 100/250/500 ms frame cadences and pause/resume clock reset | Real DOM and Three.js objects with a null renderer and controlled clock; no graphics or device-performance measurement |
| `tests/family_flows.py` | Native controls, keyboard focus, modal navigation, replay scores, save-failure messages and control bounds at five viewport sizes | Null renderer; layout measurements do not certify physical touch or assistive hardware |
| `tests/browser.py` | Actual WebGL, touch/RTL direction, pause/resume, settings, stage completion, save recovery, repeated-stage graphics-resource counts and offline reload | Chromium and Linux WebKit; no physical iPad certification |

Reproduction commands are in [README.md](README.md). The real-render suite writes engine-specific screenshots and reports under `test-results/`. `tests/family_browser.py` is called by that suite and does not need a separate invocation.

## Offline checks

The browser suite serves responses with `Cache-Control: no-store`, waits for the service worker, then stops the real origin server. A fresh context with service workers blocked must fail to navigate; the installed context must reload successfully with its saved state. This distinguishes the release cache from a running server or ordinary HTTP caching.

Both engines use this method. Playwright's WebKit offline emulation has a known limitation with service-worker responses ([microsoft/playwright#42775](https://github.com/microsoft/playwright/issues/42775)). Physical airplane-mode and Home Screen behavior require device checks.

## Physical-device checks

Record device model, operating-system version, Safari/standalone mode and graphics quality alongside any observations.

- Load in Safari, add to the Home Screen and reopen in airplane mode after the offline-ready message. With two game windows open, verify that an update waits for closure and saved progress survives reopening.
- Check portrait/landscape rotation, browser-toolbar changes and split view. Map, settings and completion controls must remain reachable without horizontal scrolling or cropped actions.
- Exercise tap, drag, two fingers, edge gestures and releasing outside the input pad. Pointer cancellation must not jump; gestures must not scroll the page.
- Pause during an active shield, switch apps and lock/unlock. The game must remain paused on return and resume only after an explicit action; shield time must remain unchanged during the pause.
- Check mute/unmute, hardware audio interruptions and repeated resumes for stuck notes, catch-up bursts and uncaught errors.
- Replay all worlds during an extended session. Observe heat, smoothness and memory pressure; compare graphics settings and test the WebGL context-loss fallback.
- Complete the campaign, reopen the app and verify best scores and stickers. With storage denied, play must remain available and save-failure status must be visible.
- Check keyboard navigation, VoiceOver and any switch-access hardware required by the intended use. Native controls and modal focus handling do not establish complete accessibility compliance.

No hardware frame-rate, battery-life or full accessibility result is established by the automated suites.

## Release consistency

Application asset changes require a new service-worker `VERSION`. The shell must cache a coherent release; new workers wait for existing clients to close. An update must not clear progress storage. [Deployment](docs/DEPLOYMENT.md) describes the quality gate, while [controls and saves](docs/CONTROLS_AND_SAVES.md) describes local recovery limits.
