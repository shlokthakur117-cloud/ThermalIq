<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ThermalIQ — Project Engineering Rules

## Application Root
The sole application root is `thermaliq/`. All commands, dependency installations, and source code files must reside within `thermaliq/`. The parent directory is the workspace root.

## Stack & Versions
- **Framework**: Next.js 16.4.6 (App Router)
- **UI Runtime**: React 19.3.0
- **Language**: TypeScript strict mode
- **Styling**: Tailwind CSS v4 (`@tailwindcss/turbopack`)
- **Database & Auth**: Supabase via `@supabase/ssr`
- **Geospatial Visualization**: Leaflet via `react-leaflet`
- **AI Rationale & Policy**: Google Gemini API (model configurable, default: `gemini-2.5-flash`)

## Catalyst Hackathon Core Rules
1. **Working MVP First**: Build one module at a time; prioritize working functionality, security, AI integration, performance, and UI/UX.
2. **Context Documentation**: Check current official documentation via Context7 before implementing framework integrations.
3. **Review Before Overwrite**: Never overwrite working code without reviewing it first.
4. **Security & Secrets**: Never expose API keys or service role secrets in client-side code. Use environment variables. Validate all inputs and enforce Supabase Row Level Security (RLS).
5. **Testing & Verification**: Test critical user journeys, inspect server logs/browser console, and run production builds (`npm run build`) before declaring tasks complete.
6. **Communication**: Explain changes, list modified files, and report verification results transparently.

## Non-Negotiable Technical Rules
- **Supabase Only**: Do NOT use Firebase. All database operations must target Supabase.
- **Server vs Client Architecture & Supabase Access**:
  - All ordinary application data fetching must happen strictly through Server Components or API route handlers.
  - Client Components (`"use client"`) are strictly for interactive UI state and browser APIs.
  - Server-side Supabase client must always use the `@supabase/ssr` `createServerClient` pattern.
  - The browser Supabase client (`src/lib/supabase/client.ts`) should only be used for explicitly justified client-side operations, such as user authentication state or authorized realtime subscriptions.
- **AI Integration**:
  - Model selection is configurable via environment variable `GEMINI_MODEL` (fallback default: `gemini-2.5-flash`).
  - API key must be accessed strictly server-side via `GEMINI_API_KEY` (never `NEXT_PUBLIC_`).
- **Typing Integrity**:
  - Strict TypeScript mode. No `any` types. No `@ts-ignore`.
- **Geospatial Mapping (Leaflet)**:
  - All Leaflet and `react-leaflet` components must be loaded dynamically with `{ ssr: false }`.
  - Include `leaflet/dist/leaflet.css` in map wrapper or `globals.css`.
- **Next 16 Conventions**:
  - Dynamic route parameters (`params`, `searchParams`) and headers/cookies (`cookies()`) are asynchronous and must be awaited.

## Scoring Integrity Rules
To guarantee mathematical explainability, safety, and transparency:
- **Universal Input Normalization**: Every scoring input variable must be explicitly normalized to the bounded closed interval $[0, 1]$.
- **Strict Input Validation**: All zone inputs must be validated for missing, `null`, `undefined`, non-numeric, `NaN`, and out-of-range values before scoring.
- **No Silent Substitutions**: Never silently substitute missing or corrupted data with arbitrary default values; throw explicit validation errors or handle through documented, audited fallback strategies.
- **Explicit Documentation**: Every normalization formula, scale, and transformation method must be explicitly documented in the codebase.
- **Consistent 0–100 Reporting Scale**: For user-facing display, dashboard cards, and reporting, raw $[0, 1]$ indices (HRS, PVS, EGS, and CPS) must be consistently converted to a 0–100 scale: $\text{Score}_{100} = \text{round}(\text{Score}_{\text{raw}} \times 100, 1)$.
- **Synthetic Data Transparency**: All synthetic demonstration datasets and simulated values must be explicitly marked and labeled in the UI, code comments, and documentation.

## Target File Structure
Files will be built incrementally on demand (do not create stubs in advance):
- `src/lib/scoring.ts` — Pure deterministic scoring functions, input validation, and normalization
- `src/lib/optimizer.ts` — Greedy budget & intervention allocation algorithm
- `src/lib/gemini.ts` — Configurable Gemini API client (server-side only)
- `src/lib/mock-data.ts` — Synthetic municipal demonstration data
- `src/lib/supabase/server.ts` — SSR server client
- `src/lib/supabase/client.ts` — Browser client (auth and realtime only)
- `src/types/zone.ts` — ZoneRaw, ZoneScored, InterventionType interfaces
- `src/app/api/optimize/route.ts` — Allocation optimization endpoint
- `src/app/api/justify/route.ts` — Gemini policy justification endpoint
- `src/app/api/scores/route.ts` — Zone scoring endpoint
- `supabase/schema.sql` — Database DDL for zones, intervention types, allocations, and overrides

---

## Scoring Framework & Variable Documentation

> [!WARNING]
> **Heuristic Demonstration Notice**: The HRS, PVS, EGS, and CPS formulas are heuristic decision-support indices developed for hackathon demonstration and prioritization prototyping. They are **not** peer-reviewed epidemiological or meteorological models and must not be represented as scientifically validated predictions.

### 1. Heat Risk Score (HRS)
Captures physical hazard intensity and built-environment thermal retention.
- **Formula (Raw $[0, 1]$)**:
  $$\text{HRS}_{\text{raw}} = 0.35 \times \text{lst\_index} + 0.25 \times \text{isf} + 0.20 \times \text{vci\_deficit} + 0.10 \times \text{albedo\_deficit} + 0.10 \times \text{ncd}$$
- **Presentation Scale**: $\text{HRS} = \text{round}(\text{HRS}_{\text{raw}} \times 100, 1)$ (Range: $0 - 100$)
- **Input Variables & Normalization Methods**:
  - `lst_index`: Normalized Land Surface Temperature index from thermal observations. Normalized via min-max scaling to $[0, 1]$ across representative urban temperature bounds ($30^\circ\text{C} - 50^\circ\text{C}$): $\text{clamp}\left(\frac{\text{LST} - 30}{50 - 30}, 0, 1\right)$.
  - `isf`: Impervious Surface Fraction (proportion of land covered by sealed surfaces/concrete/asphalt, $[0.0, 1.0]$).
  - `vci_deficit`: Vegetation Condition Deficit index. **Simplified demonstration normalization**:
    $$\text{NDVI\_norm} = \text{clamp}\left(\frac{\text{NDVI} + 1}{2}, 0, 1\right)$$
    $$\text{vci\_deficit} = 1 - \text{NDVI\_norm}$$
    *(Linearly shifts raw NDVI $[-1, 1]$ into $[0, 1]$ space, then inverts to measure vegetation deficit).*
  - `albedo_deficit`: Surface solar absorption factor ($1.0 - \text{albedo}$, where low-reflectance dark roofing/asphalt scores high, $[0.0, 1.0]$).
  - `ncd`: Night Cooling Deficit index ($[0.0, 1.0]$, measuring inability of the built environment to shed heat nocturnal hours due to thermal mass).

### 2. Population Vulnerability Score (PVS)
Captures human sensitivity and socio-demographic exposure risk.
- **Formula (Raw $[0, 1]$)**:
  $$\text{PVS}_{\text{raw}} = 0.25 \times \text{epf} + 0.25 \times \text{owf} + 0.20 \times \text{lif} + 0.20 \times (1 - \text{hca}) + 0.10 \times \text{dcc\_normalized}$$
- **Presentation Scale**: $\text{PVS} = \text{round}(\text{PVS}_{\text{raw}} \times 100, 1)$ (Range: $0 - 100$)
- **Input Variables & Normalization Methods**:
  - `epf`: Elderly Population Fraction (proportion of residents aged $\ge 65$ years, $[0.0, 1.0]$).
  - `owf`: Outdoor Worker Fraction (proportion of workforce in high-exposure jobs: construction, delivery, sanitation, agriculture, $[0.0, 1.0]$).
  - `lif`: Low Income Fraction (socio-economic vulnerability indicator, households below poverty line, $[0.0, 1.0]$).
  - `hca`: Healthcare Accessibility metric (normalized proximity/capacity to cooling shelters and emergency centers, $[0.0, 1.0]$; $1 - \text{hca}$ represents accessibility deficit).
  - `dcc_normalized`: District Cooling Capacity deficit (normalized lack of air-conditioned civic refuge space, $[0.0, 1.0]$).

### 3. Equity & Governance Score (EGS)
Captures historical underinvestment and infrastructure equity needs.
- **Formula (Raw $[0, 1]$)**:
  $$\text{EGS}_{\text{raw}} = 0.40 \times \text{gid} + 0.35 \times \text{cid\_inverted} + 0.25 \times \text{hii\_inverted}$$
- **Presentation Scale**: $\text{EGS} = \text{round}(\text{EGS}_{\text{raw}} \times 100, 1)$ (Range: $0 - 100$)
- **Input Variables & Normalization Methods**:
  - `gid`: Green Investment Deficit (historical deficit of municipal parks, shade trees, and green corridors, $[0.0, 1.0]$).
  - `cid_inverted`: Community Infrastructure Deficit (inverted per-capita public water points and shading structures, $[0.0, 1.0]$).
  - `hii_inverted`: Heat Intervention Inverted index (lack of prior cooling infrastructure subsidies in the district, $[0.0, 1.0]$).

### 4. Composite Priority Score (CPS)
Aggregates risk, vulnerability, and equity to prioritize municipal budget allocation.
- **Formula (Raw $[0, 1]$)**:
  $$\text{CPS}_{\text{raw}} = \alpha \times \text{HRS}_{\text{raw}} + \beta \times \text{PVS}_{\text{raw}} + \gamma \times \text{EGS}_{\text{raw}}$$
- **Presentation Scale**: $\text{CPS} = \text{round}(\text{CPS}_{\text{raw}} \times 100, 1)$ (Range: $0 - 100$)
- **Policy Weights**:
  - Default weights: $\alpha = 0.40$, $\beta = 0.35$, $\gamma = 0.25$ ($\alpha + \beta + \gamma = 1.0$).
  - Configurable in the municipal dashboard via interactive policy preference sliders.
- **Demonstration Assumptions**:
  - All sub-index inputs are normalized to the closed interval $[0, 1]$.
  - Weights are linear and additive.
  - Initial calculations use synthetic representative municipal zone records.
