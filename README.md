# Fish of Fortune — QA Automation E2E Test Suite

## Overview
Automated end-to-end test suite for the Fish of Fortune Wheel Spin backend API flow.
Validates reward application, state persistence across sessions, and data integrity.

## Tech Stack
- Node.js + TypeScript
- Playwright (API testing)
- Postman + Newman (API validation collection & CLI runner)
- dotenv (environment configuration)

## Prerequisites
- Node.js >= 18
- npm

## Setup
```bash
npm install
npx playwright install
```

### Environment Variables
Configuration is managed via a `.env` file in the project root (excluded from version control via `.gitignore`).

Create a `.env` file:
```env
BASE_URL=https://fof-devplayground-api.whalosvc.com
LOGIN_SOURCE=test_raz_05022XXXXXXXX
```

Both `playwright.config.ts` and `utils/api-client.ts` load these via `dotenv`. Fallback defaults are coded in `api-client.ts` so tests run even without a `.env` file.

## Project Structure
```
├── .env                         # Environment variables (git-ignored)
├── .gitignore                   # Excludes node_modules, test-results, .env
├── playwright.config.ts         # Playwright config — loads dotenv, sets baseURL
├── package.json                 # Scripts: test, test:list, test:postman
├── tsconfig.json
├── tests/
│   ├── wheel-spin-flow.spec.ts              # Main E2E flow (mandatory)
│   ├── bonus-login-response-validation.spec.ts  # Bonus: deep login validation
│   └── bonus-spin-exhaustion.spec.ts            # Bonus: exhaustion + scripted detection
├── utils/
│   ├── api-client.ts            # API abstraction layer (login, spinWheel)
│   └── types.ts                 # TypeScript interfaces (LoginResult, SpinResult)
└── postman/
    ├── Fish_of_Fortune_E2E.postman_collection.json  # Postman collection
    └── Fish_of_Fortune_Dev.postman_environment.json # Postman environment
```

## Running Tests

### Playwright Tests
```bash
npm test
```

### View HTML Report
After running, open the Playwright HTML report:
```bash
npx playwright show-report
```

### Postman Collection
1. Import `postman/Fish_of_Fortune_E2E.postman_collection.json` into Postman
2. Import `postman/Fish_of_Fortune_Dev.postman_environment.json` into Postman
3. Select the **Fish of Fortune - Dev** environment in the top right corner
4. Run the collection sequentially using Collection Runner (Run order: Login → Spin → Relogin)

**Bonus: Run via Newman (CLI)**
```bash
npm run test:postman
```

## Test Flow (Main — `wheel-spin-flow.spec.ts`)
1. **Create new user** — generate unique DeviceId (uuid v4), call Login API
2. **Store initial balance** — capture Coins, Gems, Energy from `response.LoginResponse.UserBalance`
3. **Spin the wheel** — call Spin API with access token, validate response structure and reward data
4. **Store post-spin balance** — capture updated balance from `response.SpinResult.UserBalance` (source of truth)
5. **Relogin** — call Login API with same DeviceId (new session)
6. **Verify persistence** — assert relogin balance matches post-spin balance exactly

## Key Invariants Validated (Main Flow)
| Invariant | How It's Validated |
|-----------|--------------------|
| Spin reward is applied exactly once | Post-spin coins >= initial; relogin coins === post-spin (not applied again) |
| User state persists across relogin | Relogin Coins, Gems, Energy all === post-spin values |
| No duplicate rewards are granted | Relogin coins <= post-spin coins; energy not refunded |
| No rollback occurs after session change | Relogin coins >= initial; relogin energy === initial - 1 |

---

## Bonus: Extended Login Response Validation (`bonus-login-response-validation.spec.ts`)

A dedicated test file that performs deeper validation on the full login response structure. These validations go beyond the mandatory flow to verify additional fields documented in the API response.

### Test 1: First Login (New User) — Assumptions & Validations
| # | Field | Assertion | Business Logic / Assumption |
|---|-------|-----------|-----------------------------|
| 1 | `AccountCreated` | `=== true` | The system correctly identifies and flags a new `DeviceId` registration. |
| 2 | `ExternalPlayerId` | Non-empty string | A unique backend identity is generated for analytics and tracking. |
| 3 | `Level.LevelId` | `=== 1` | New users are initialized at the base progression level. |
| 4 | `Wheel` & `Cards` | Non-empty arrays | Core game configurations are successfully loaded so the user can play immediately. |
| 5 | Balance Consistency | `*Amount === UserBalance.*` | Top-level summary fields (`CoinsAmount`, `EnergyAmount`, `GemsAmount`) must perfectly match the nested `UserBalance` object to prevent UI/client desyncs. |

### Test 2: Relogin (Existing User) — Assumptions & Validations
| # | Field | Assertion | Business Logic / Assumption |
|---|-------|-----------|-----------------------------|
| 1 | `AccountCreated` | `=== false` | The system recognizes an existing `DeviceId` and resumes the session instead of overwriting the account. |
| 2 | `ExternalPlayerId` | Matches first login | The core player identity is immutable and persists across sessions. |
| 3 | Balance Consistency | `*Amount === UserBalance.*` | Internal data consistency between summary fields and the `UserBalance` object is maintained upon session resumption. |

---

## Bonus: Spin Until Exhaustion & Scripted Wheel Detection (`bonus-spin-exhaustion.spec.ts`)

A dedicated test file that spins the wheel until energy is fully depleted across one or two users, tracking coin progression and verifying that the wheel configuration is scripted.

### Test 1: Spin Until Out of Energy — Assumptions & Validations
| # | What's Checked | Assertion | Assumption |
|---|----------------|-----------|------------|
| 1 | Each spin returns HTTP 200 | `spin.httpStatus === 200` | Every spin call succeeds while energy > 0 |
| 2 | Energy reaches 0 | `finalEnergy === 0` | Spinning continues until energy is fully exhausted |
| 3 | Spin count >= initial energy | `spinHistory.length >= initialEnergy` | Each spin costs 1 energy, but rewards can refill energy — extending the session |
| 4 | Coins never decrease | `finalCoins >= initialCoins` | Coins can only increase or stay the same from spins |
| 5 | Coin balance uses SpinResult.UserBalance | Source of truth | Never manually computed — other reward types (RewardDefinitionType 6 / FeedResponse) can change coins indirectly |
| 6 | **Negative test:** spin rejected at 0 energy | `status === -3`, `rawResponse === 'NotEnoughResources'` | Backend returns HTTP 200 but rejects with application-level error when energy is exhausted |
| 7 | Relogin coins match final spin coins | `relogin.Coins === finalCoins` | Coin state persists after full energy exhaustion |
| 8 | Relogin energy stays 0 | `relogin.Energy === 0` | No free energy refill on relogin |

### Test 2: Wheel is Scripted — Assumptions & Validations
| # | What's Checked | Assertion | Assumption |
|---|----------------|-----------|------------|
| 1 | Wedges identical across users | `JSON.stringify(A) === JSON.stringify(B)` | The wheel configuration (wedge layout) is fixed/scripted for all users |
| 2 | Both users have same spin count | `spinsA.length === spinsB.length` | New users start with the same energy, so they take the same number of spins |
| 3 | selectedIndex sequences match | `indicesA === indicesB` | Spin outcomes are predetermined — the same sequence of wedge indices is dealt to every new user |
| 4 | Two independent DeviceIds used | Fresh uuid per user | Users are completely independent — no shared session state |

---

## General Assumptions & Architectural Observations
- **Idempotency via UUIDs:** Each test run generates a fresh `DeviceId` (UUID v4). This ensures complete test isolation, preventing state pollution or flakiness from previous runs.
- **Source of Truth for Balances:** The `UserBalance` object returned in the `SpinResult` is treated as the absolute source of truth. We do *not* manually calculate balances by summing `Reward.Amount` because certain rewards (like `RewardDefinitionType: 6` / Cards) can trigger nested `FeedResponse` events that indirectly alter the coin balance.
- **Session Extension via Rewards:** A user's spin session can exceed their `initialEnergy` count. Because spins can reward energy, the total number of spins before exhaustion is `>= initialEnergy`, not strictly equal.
- **Stateless Relogin:** Calling the Login API with an existing `DeviceId` acts as a session resumption. It must return the exact persisted state without modifying balances or refunding energy.
- **API Quirks Handled:** 
  - The Spin API endpoint contains an intentional double slash (`/wheel//v1`), which was preserved to match the actual server routing.
  - Authentication is handled via a custom `accessToken` header rather than a standard `Authorization: Bearer` token.
  - **HTTP 200 is returned even for error responses.** The server always returns HTTP 200 OK — including for business-logic errors (e.g., `{ "status": -3, "response": "NotEnoughResources" }` when spinning with 0 energy). Therefore, all tests validate **both** `httpStatus === 200` and the inner `response.status === 0` to confirm true success. Relying on HTTP status codes alone would miss API-level failures.

### Energy Boost Behavior

- New users start with **10 energy** (observed consistently across test runs)
- Each spin costs exactly **1 energy**
- The wheel can land on energy reward wedges (`RewardDefinitionType: 1, RewardResourceType: 3`), which **add energy back** to the user's balance
- This means the total number of spins before exhaustion is **≥ initialEnergy**, not strictly equal — the session is extended by energy rewards
- The exhaustion test (`bonus-spin-exhaustion.spec.ts`) accounts for this by using a `while (currentEnergy > 0)` loop instead of a fixed iteration count
- Energy rewards are reflected immediately in `SpinResult.UserBalance.Energy`, maintaining the source-of-truth pattern

### WedgeType Distinction

The wheel configuration distinguishes between wedge types:
- **`WedgeType: 1`** — Standard wedge (coins, cards/feed actions)
- **`WedgeType: 4`** — Special wedge (high-value coins like 100,000, gems, or energy rewards)

This distinction is cosmetic for test validation purposes — the backend applies rewards identically regardless of `WedgeType`. **my tests validate the `UserBalance` after each spin rather than predicting outcomes based on wedge type**.
