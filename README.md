# BerreX

BerreX is an iOS-inspired forex market intelligence PWA: a market desk for prices, charts, macro events, news, watchlists, alerts, conversion tools and AI explanations.

## Current product surface

- Animated Telegram-style launch splash
- Liquid-glass floating navigation
- Home market desk with focus pair, watchlist and movers
- Full market terminal with animated candlesticks, 1m/5m/15m/1h/4h/1D timeframes, SMA/EMA/RSI/MACD readouts, currency strength and session status
- Pair intelligence with chart, high/low, bias, AI explanation and quick tools
- Search / quick-find popup
- Currency converter popup
- Local price-alert list
- Economic calendar popup
- Notifications center
- Market Lab: screener, currency heatmap, derived sentiment, correlation matrix, risk/position sizing, pip tools, macro radar, news-to-price reaction cards, local portfolio exposure, trade journal, saved screens and market ideas
- Newsroom with featured story + article reader
- Light/dark appearance
- Responsive desktop/mobile layout
- Installable PWA shell
- GitHub Pages deployment

## Market-data providers

BerreX now has provider adapters for:

- Financial Modeling Prep (FMP): batch forex quotes, forex news and economic calendar.
- Twelve Data: historical forex time series and currency conversion.
- Optional Cloudflare Worker proxy: worker/ keeps provider keys server-side and adds short shared caches.
- Optional Supabase workspace/social layer: supabase/schema.sql provides RLS-protected workspace and community-idea tables.

FMP documents real-time forex quotes, batch forex quotes, forex news and economic-calendar endpoints. Twelve Data documents forex time series and currency-conversion endpoints.

Provider references:
- https://site.financialmodelingprep.com/developer/docs
- https://twelvedata.com/docs

### Configure locally

Copy `.env.example` to `.env.local` and set:

```text
VITE_FMP_API_KEY=
VITE_TWELVEDATA_API_KEY=
VITE_MARKET_API_URL=
VITE_AI_ENDPOINT=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SOCIAL_API_URL=
VITE_EXNESS_REFERRAL_URL=
```

**Security:** Vite `VITE_*` variables are embedded into the browser bundle. Do not treat them as server-side secrets. For a public production deployment, put FMP/Twelve Data requests behind a Cloudflare Worker or another backend and expose only your own API endpoint to the browser.

If no provider key is configured, BerreX intentionally falls back to a local preview stream so the UI remains usable.

## API usage

The FMP allowance supplied for this project is limited, so BerreX avoids aggressive client polling. Provider data is loaded on startup and refreshed periodically when a provider/proxy is configured; when no provider key is configured the local preview stream is used. A production backend should cache shared provider responses so multiple visitors do not multiply API calls.

## Cloudflare data proxy

For a public Pages deployment, deploy `worker/` as a separate Cloudflare Worker and add the secrets `FMP_API_KEY` and optionally `TWELVE_DATA_API_KEY`. Set the BerreX build variable `VITE_MARKET_API_URL` to the Worker URL. The browser then calls `/quotes`, `/news`, `/calendar`, `/candles` and `/convert` without exposing provider keys. In GitHub, add `VITE_MARKET_API_URL` as a repository variable so the Pages workflow injects the public Worker URL at build time.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## GitHub Pages

The repository includes `.github/workflows/deploy.yml`.

Repository:
https://github.com/squashberry/berrex

Planned public site:
https://squashberry.github.io/berrex/

## Design direction

The interface is inspired by modern Apple platform conventions: floating navigation, translucent materials, rounded sheets, strong hierarchy and restrained glass effects. It is an independent BerreX design, not an Apple clone.

## Exness referral

Set `VITE_EXNESS_REFERRAL_URL` to your partner URL. The default is the public Exness website.

## Disclaimer

BerreX is an informational market tool and referral surface, not a trade-execution platform or licensed financial adviser. Market data, news and AI-generated explanations can be incomplete or delayed.

## Market Lab

Market Lab consolidates the expanded product surface: live-feed-aware screening, currency heatmap, derived sentiment, correlation, risk and position sizing, pip tools, macro countdowns, news-to-price reaction, browser alerts, saved workspace, journal, market ideas, optional cloud sync, manual portfolio exposure, saved screens and source-status checks.

Public production still requires a configured FMP/Twelve Data provider or VITE_MARKET_API_URL. Use the Cloudflare Worker for provider-key protection. Authenticated cloud workspace/community requires a dedicated BerreX Supabase project with VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.