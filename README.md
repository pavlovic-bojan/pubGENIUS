# Content Publisher Playwright Suite

This workspace contains an automated smoke-test that validates the **publish flow** for the Pantheon Content Publisher Google Docs add-on. The implementation uses the Playwright Test runner with TypeScript.

> ⚠️ **Heads-up:** Automating Google Workspace flows requires a dedicated automation account with two-factor authentication disabled. The scenarios also assume that the Content Publisher add-on is already installed and whitelisted for the domain.

## Prerequisites

- Node.js 18+
- A Google Workspace automation user with access to Google Docs and the Content Publisher add-on
- Pantheon credentials that are already connected in the add-on sidebar (the test only verifies the publish flow)

## Project Setup

```bash
npm install
```

Copy `env.example` to `.env` (or any other filename you'd like to use) and populate it with account-specific details:

```bash
cp env.example .env
```

### Required environment variables

| Name | Description |
| ---- | ----------- |
| `GOOGLE_EMAIL` | Google Workspace email used for running the automation |
| `GOOGLE_PASSWORD` | Password for the automation account (must not enforce 2FA) |
| `PANTHEON_CONTENT_PUBLISHER_URL` | Base URL for the Pantheon Content Publisher instance, e.g. `https://content.pantheon.io` |

Optional overrides let you tweak selectors if your tenant renders different markup (for example, branded deployments). See `env.example` for the available keys.

## Running the test

```bash
npm test
```

### Code structure

- `tests/publish-flow.spec.ts` – high-level Playwright spec that orchestrates the scenario
- `tests/pom/ContentPublisherFlow.ts` – page-object helper encapsulating Google Docs + Content Publisher interactions

Helpful alternatives:

- `npm run test:headed` – executes the test in headed mode for easier debugging
- `npm run test:ui` – runs Playwright's UI mode
- `npm run codegen` – launches Playwright Codegen to capture selectors for your tenant

## What the test does

1. Signs into Google Workspace with the provided credentials
2. Creates a new Google Document with a generated title and body text
3. Opens the **Content Publisher** add-on from the `Extensions` menu
4. Connects to the configured Pantheon Playground (if not already connected)
5. Triggers the publish flow and captures the resulting URL
6. Opens the published page and asserts that the body contains the generated snippet

## Limitations & troubleshooting

- Two-factor authentication (including security keys and OTP prompts) cannot be automated. Use a delegated or automation-only account without 2FA.
- The test assumes the add-on is already installed. Playwright cannot install Marketplace apps.
- UI markup can vary between tenants or over time. If selectors change, override them via the environment variables documented above and/or use `npm run codegen` to refresh them.
- Popup blockers can interfere with the publish confirmation dialog. Ensure that popups are allowed for Google Docs in the test environment.
- The script intentionally runs only in Chromium by default. Set `PW_INCLUDE_ALL_BROWSERS=1` to exercise Firefox and WebKit as well (selectors may need extra tuning).

## Next steps

- Integrate the suite into CI once a non-interactive testing account (without CAPTCHA/2FA) is available.
- Extend coverage for error handling (e.g., failed publishes) and add screenshot/video artefacts for easier debugging.
- Implement credential management (e.g., using 1Password Connect or Google Secret Manager) before running in shared pipelines.

