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
    └── Fish_of_Fortune_E2E.postman_collection.json  # Postman collection
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
2. Run the collection sequentially using Collection Runner (Run order: Login → Spin → Relogin)

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
| # | Field | Assertion | Assumption |
|---|-------|-----------|------------|
| 1 | `AccountCreated` | `=== true` | Must be `true` on the very first login with a new DeviceId |
| 2 | `ExternalPlayerId` | Non-empty string | Every user is assigned a unique external player ID upon creation |
| 3 | `DisplayName` | Non-empty string | New users are auto-assigned a guest display name (e.g. "Guest_17571") |
| 4 | `Avatar` | Number >= 0 | A default avatar ID is assigned to new users |
| 5 | `Level.LevelId` | `=== 1` | New users always start at level 1 |
| 6 | `Wheel.Wedges` | Non-empty array | The wheel must contain wedges for spinning |
| 7 | `Cards` | Non-empty array | New users receive a set of starter cards |
| 8 | `CoinsAmount` | `=== UserBalance.Coins` | Top-level CoinsAmount must match nested UserBalance.Coins |
| 9 | `GemsAmount` | `=== UserBalance.Gems` | Top-level GemsAmount must match nested UserBalance.Gems |
| 10 | `EnergyAmount` | `=== UserBalance.Energy` | Top-level EnergyAmount must match nested UserBalance.Energy |

### Test 2: Relogin (Existing User) — Assumptions & Validations
| # | Field | Assertion | Assumption |
|---|-------|-----------|------------|
| 1 | `AccountCreated` | `=== false` | Must be `false` on relogin — account already exists |
| 2 | `ExternalPlayerId` | Matches first login | Player ID is immutable across sessions |
| 3 | `DisplayName` | Matches first login | Display name persists across sessions |
| 4 | `Avatar` | Matches first login | Avatar persists across sessions |
| 5 | `Level.LevelId` | Matches first login | Level does not change between login and immediate relogin |
| 6 | `CoinsAmount === UserBalance.Coins` | Internal consistency | Coin amounts remain consistent on relogin |
| 7 | `GemsAmount === UserBalance.Gems` | Internal consistency | Gem amounts remain consistent on relogin |
| 8 | `EnergyAmount === UserBalance.Energy` | Internal consistency | Energy amounts remain consistent on relogin |

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
| 6 | Relogin coins match final spin coins | `relogin.Coins === finalCoins` | Coin state persists after full energy exhaustion |
| 7 | Relogin energy stays 0 | `relogin.Energy === 0` | No free energy refill on relogin |

### Test 2: Wheel is Scripted — Assumptions & Validations
| # | What's Checked | Assertion | Assumption |
|---|----------------|-----------|------------|
| 1 | Wedges identical across users | `JSON.stringify(A) === JSON.stringify(B)` | The wheel configuration (wedge layout) is fixed/scripted for all users |
| 2 | Both users have same spin count | `spinsA.length === spinsB.length` | New users start with the same energy, so they take the same number of spins |
| 3 | selectedIndex sequences match | `indicesA === indicesB` | Spin outcomes are predetermined — the same sequence of wedge indices is dealt to every new user |
| 4 | Two independent DeviceIds used | Fresh uuid per user | Users are completely independent — no shared session state |

---

## General Assumptions
- Each test run uses a fresh DeviceId (uuid v4) ensuring test isolation and idempotency
- A newly created account has sufficient Energy (>0) for at least one spin
- `status: 0` in API responses indicates success
- Coin rewards: `RewardDefinitionType === 1 && RewardResourceType === 1`. Feed/card rewards (`RewardDefinitionType === 6`) may also grant coins indirectly via nested `FeedResponse.Rewards`
- The post-spin `UserBalance` from the spin response is used as the authoritative balance (not manual calculation from reward amounts)
- Each spin costs exactly 1 Energy
- `accessToken` is a custom header (not Authorization/Bearer)
- The Spin API endpoint has an intentional double slash (`/wheel//v1`)
- `UserBalance` in the spin response reflects the fully updated state after the spin
- Relogin with the same DeviceId returns persisted state without modification
