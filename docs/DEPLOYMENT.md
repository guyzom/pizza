# GitHub Pages deployment

`.github/workflows/deploy-pizza-game-pages.yml` publishes the contents of `game/` when started manually. Publication requires GitHub Pages to be available for the repository and its Pages source to be configured as **GitHub Actions**. No hosted instance is assumed by the local application.

## Configure and publish

1. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.
2. In **Actions**, open the Pages deployment workflow and select **Run workflow** on `main`.
3. The workflow's deployment output provides the resulting site URL after a successful run.

Repository visibility and account plan can affect Pages availability. Local development and the quality workflow do not require Pages.

## Publication gate

1. A manual workflow run on `main` starts deployment.
2. A read-only `quality` job calls `./.github/workflows/quality.yml` from the same commit. Node tests, campaign and interaction simulations, and both browser engines must pass.
3. `deploy` runs only after `quality` succeeds and only on `main`. Failure, cancellation or skipping of the gate prevents publication.
4. Deployment checks out `github.sha`. Only this job receives `pages: write` and `id-token: write`; checkout does not persist credentials.

The standalone `Game quality` workflow runs on `main` pushes and pull requests. Deployment performs the same checks as a publication prerequisite. Their concurrency groups include the calling workflow name, so a standalone run cannot cancel the deployment gate. Pages deployments are serialized.

Pushes run standalone quality checks without deploying the site. Static workflow tests check the declared gate and permissions; they do not emulate GitHub's scheduler or create branch-protection rules.

## Offline updates

`sw.js` caches the complete app shell under a scope-specific release key. Its `VERSION` must change whenever shipped application assets change. A new worker waits for existing clients to close; it does not force an active game to reload. Activation removes only older caches with the same scope prefix and claims its clients.

The worker handles same-origin, in-scope shell requests. It serves the matching cached release, with network fallback when an entry is unavailable. Save data stays in localStorage and is not cleared during an update.

Automated publication is independent of physical-device validation. Safari/Home Screen installation, audio interruptions, safe areas, touch interaction and actual airplane-mode behavior are covered by the device checklist in [QA.md](../QA.md).
