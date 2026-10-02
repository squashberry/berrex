# BerreX

BerreX is an iOS-inspired forex market intelligence PWA.

The first build focuses on the product shell and interaction model:

- Liquid Glass-inspired floating navigation
- Live-preview market ticker with simulated streaming ticks
- Watchlist
- Pair detail view with chart and indicator summaries
- AI market insight surface
- Economic/news cards
- Light/dark appearance
- Installable PWA shell
- GitHub Pages deployment
- Safe frontend configuration points for a future market-data backend and AI endpoint

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Live data

The current UI uses a local simulated tick stream so the public demo works without exposing a market-data API key in the browser.

For production, connect the frontend to a backend or WebSocket provider through the service layer in `src/services/market.ts`.

## AI

The AI insight panel supports a backend endpoint through:

```text
VITE_AI_ENDPOINT
```

Do not put private provider API keys in frontend environment variables. Keep those keys server-side in a Cloudflare Worker or another backend.

## Exness referral

Set:

```text
VITE_EXNESS_REFERRAL_URL
```

to your partner URL. Until then the CTA falls back to the public Exness site.

## GitHub Pages

The repository includes a GitHub Actions workflow at:

```text
.github/workflows/deploy.yml
```

After Pages is enabled for GitHub Actions, pushes to `main` build and deploy the PWA automatically.

Repository:

https://github.com/squashberry/berrex

## Design direction

The interface follows current Apple platform conventions as visual inspiration: floating navigation, translucent materials, rounded sheets, strong hierarchy, and restrained use of glass effects.

Primary references are collected in `DESIGN_REFERENCE.md`.

BerreX is an independent product and is not affiliated with Apple.

## Disclaimer

BerreX provides market information and educational analysis surfaces. It is not a licensed financial adviser or a trade-execution platform. Market data and AI-generated analysis can be incomplete or delayed.
