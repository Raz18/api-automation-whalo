# Fish of Fortune — QA Automation E2E Test Suite Prompt

## Context

I need to build an E2E automated test suite for a mobile game backend API (Fish of Fortune). The assignment tests a **Wheel Spin flow** — login, spin the wheel, validate rewards, relogin, and verify state persistence. I need to deliver: automated tests, a Postman collection, and a README. Implement ONLY mandatory requirements — no bonus features.

## Tech Stack

- **Runtime**: Node.js (latest LTS)
- **Framework**: Playwright (`@playwright/test`) for API-level E2E testing
- **Language**: TypeScript
- **Postman**: Exported JSON collection (v2.1 format)

## Project Structure

```
fish-of-fortune-tests/
├── package.json
├── playwright.config.ts
├── tsconfig.json
├── README.md
├── postman/
│   └── Fish_of_Fortune_E2E.postman_collection.json
├── tests/
│   └── wheel-spin-flow.spec.ts
└── utils/
    ├── api-client.ts       # API helper functions
    └── types.ts            # TypeScript interfaces for API responses
```

---

## API Details (EXACT paths from real responses)

### Base URL
```
https://fof-devplayground-api.whalosvc.com
```

### 1. Login API

- **Endpoint**: `POST /api/frontend/login/v4/login`
- **Headers**: `Content-Type: application/json`
- **Body**:
```json
{
  "DeviceId": "candidate_test_{uuid}",
  "LoginSource": "test_raz_0523XXXXXXXX"
}
```

- `DeviceId`: Unique per user. New ID → creates account. Existing ID → reconnects. Format: `candidate_test_<uuid-v4>`
- `LoginSource`: Constant value `test_raz_0523XXXXXXXX`

**EXACT Response Structure** (paths confirmed from real API):
```
response.LoginResponse.AccessToken          → string (Base64-encoded token)
response.LoginResponse.UserBalance.Coins    → number (e.g., 109500)
response.LoginResponse.UserBalance.Gems     → number (e.g., 10)
response.LoginResponse.UserBalance.Energy   → number (e.g., 6)
response.LoginResponse.AccountCreated       → boolean
response.LoginResponse.DisplayName          → string (e.g., "Guest_17571")
response.LoginResponse.ExternalPlayerId     → string
response.LoginResponse.Level.LevelId        → number
response.LoginResponse.Wheel.Wedges         → array of wedge objects
status                                       → number (0 = success)
```

The full path to extract what we need:
```typescript
const body = await response.json();
const accessToken = body.response.LoginResponse.AccessToken;
const userBalance = body.response.LoginResponse.UserBalance;
// userBalance = { Coins, Gems, Energy, EnergyExpirationTS, EnergyExpirationSeconds, ShieldsAmount, Shields, MaxEnergyCapacity }
```

### 2. Wheel Spin API

- **Endpoint**: `POST /api/frontend/wheel//v1` ← DOUBLE SLASH is intentional, do NOT fix it
- **Headers**:
  - `Content-Type: application/json`
  - `accessToken: <token>` ← custom header name (camelCase), NOT `Authorization`
- **Body**:
```json
{
  "multiplier": 1
}
```

**EXACT Response Structure** (paths confirmed from real API):

For a **direct coin reward** (RewardDefinitionType=1, RewardResourceType=1):
```json
{
  "status": 0,
  "response": {
    "SelectedIndex": 0,
    "SpinResult": {
      "Rewards": [
        {
          "RewardDefinitionType": 1,
          "TrackingId": "323eaa3a-2dfb-420d-ae06-27483b507154",
          "RewardResourceType": 1,
          "Amount": 5000,
          "Multiplier": 1
        }
      ],
      "UserBalance": {
        "Coins": 114500,
        "Gems": 10,
        "Energy": 5,
        "EnergyExpirationTS": 1771857883549,
        "EnergyExpirationSeconds": 3134,
        "LastUpdateTS": 1771854748715,
        "ShieldsAmount": 0,
        "Shields": [],
        "MaxEnergyCapacity": 50
      },
      "PointCollectingSummary": { "tournaments": [] }
    },
    "Metus_Rate": true,
    "Metuzm_Zam": false,
    "Metuzm_Zam_Data": "",
    "Metuzm_Zam_Data_Hadash": "{...}"
  },
  "messages": []
}
```

For a **non-coin reward** (e.g., card/feed reward, RewardDefinitionType=6):
```json
{
  "status": 0,
  "response": {
    "SelectedIndex": 21,
    "SpinResult": {
      "Rewards": [
        {
          "RewardDefinitionType": 6,
          "TrackingId": "44ee0a28-...",
          "RewardResourceType": 0,
          "RewardActionType": 9,
          "Multiplier": 1,
          "Amount": 1,
          "FeedResponse": {
            "Rewards": {
              "<foodId>": [
                {
                  "RewardDefinitionType": 1,
                  "RewardResourceType": 1,
                  "Amount": 10000,
                  "Multiplier": 1
                }
              ]
            }
          }
        }
      ],
      "UserBalance": {
        "Coins": 127000,
        "Gems": 10,
        "Energy": 2
      }
    }
  },
  "messages": []
}
```

**CRITICAL REWARD LOGIC**:
- There are TWO types of spin rewards:
  1. **Direct rewards**: `RewardDefinitionType === 1 && RewardResourceType === 1` → coins added directly (Amount field)
  2. **Feed/Card rewards**: `RewardDefinitionType === 6` → these also grant coins INDIRECTLY via nested `FeedResponse.Rewards`
- Because of this complexity, **DO NOT try to manually calculate expected coins from reward Amount**
- Instead, the **authoritative post-spin balance** is always `response.SpinResult.UserBalance` — use THIS as the source of truth
- For validation: compare post-spin `UserBalance` from spin response against relogin `UserBalance`

The paths to extract:
```typescript
const body = await response.json();
const spinResult = body.response.SpinResult;
const rewards = spinResult.Rewards;           // array
const postSpinBalance = spinResult.UserBalance; // { Coins, Gems, Energy, ... }
const selectedIndex = body.response.SelectedIndex;
```

---

## Implementation Instructions

### 1. `utils/types.ts`

```typescript
export interface UserBalance {
  Coins: number;
  Gems: number;
  Energy: number;
  EnergyExpirationTS?: number;
  EnergyExpirationSeconds?: number;
  LastUpdateTS?: number;
  ShieldsAmount?: number;
  Shields?: any[];
  MaxEnergyCapacity?: number;
}

export interface Reward {
  RewardDefinitionType: number;
  TrackingId: string;
  RewardResourceType: number;
  Amount: number;
  Multiplier: number;
  RewardActionType?: number;   // present when RewardDefinitionType === 6
  FeedResponse?: any;          // present when RewardDefinitionType === 6
}

export interface LoginResult {
  accessToken: string;
  userBalance: UserBalance;
  accountCreated: boolean;
  fullResponse: any;           // keep raw response for debugging
}

export interface SpinResult {
  selectedIndex: number;
  rewards: Reward[];
  userBalance: UserBalance;    // post-spin balance (source of truth)
  fullResponse: any;
}
```

### 2. `utils/api-client.ts`

Create a clean helper module:

```typescript
import { APIRequestContext } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';
import { LoginResult, SpinResult } from './types';

const BASE_URL = 'https://fof-devplayground-api.whalosvc.com';
const LOGIN_SOURCE = 'test_raz_0523XXXXXXXX';

export function generateDeviceId(): string {
  return `candidate_test_${uuidv4()}`;
}

export async function login(request: APIRequestContext, deviceId: string): Promise<LoginResult> {
  const response = await request.post(`${BASE_URL}/api/frontend/login/v4/login`, {
    data: {
      DeviceId: deviceId,
      LoginSource: LOGIN_SOURCE,
    },
  });

  const body = await response.json();

  // EXACT paths from real API response:
  const loginResponse = body.response.LoginResponse;

  return {
    accessToken: loginResponse.AccessToken,
    userBalance: loginResponse.UserBalance,
    accountCreated: loginResponse.AccountCreated,
    fullResponse: body,
  };
}

export async function spinWheel(request: APIRequestContext, accessToken: string): Promise<SpinResult> {
  const response = await request.post(`${BASE_URL}/api/frontend/wheel//v1`, {
    headers: {
      accessToken: accessToken,   // custom header, NOT Authorization
    },
    data: {
      multiplier: 1,
    },
  });

  const body = await response.json();
  const spinResult = body.response.SpinResult;

  return {
    selectedIndex: body.response.SelectedIndex,
    rewards: spinResult.Rewards,
    userBalance: spinResult.UserBalance,
    fullResponse: body,
  };
}
```

### 3. `tests/wheel-spin-flow.spec.ts`

One test file, one primary test, using `test.step()` for clear reporting:

```
test.describe('Wheel Spin E2E Flow', () => {

  test('reward persistence across sessions', async ({ request }) => {
    const deviceId = generateDeviceId();

    // STEP 1: Create new user & login
    await test.step('Login with new user', async () => {
      - Call login(request, deviceId)
      - Assert: fullResponse.status === 0
      - Store: accessToken, initialBalance (Coins, Gems, Energy)
      - Assert: Energy > 0 (needed for spin)
      - Log: initial balance for debugging
    });

    // STEP 2: Spin the wheel
    await test.step('Spin the wheel', async () => {
      - Call spinWheel(request, accessToken)
      - Assert: fullResponse.status === 0
      - Assert: rewards is a non-empty array
      - Assert: each reward has RewardDefinitionType (number), RewardResourceType (number), Amount (number), TrackingId (string)
      - Assert: selectedIndex is a number >= 0
      - Store: postSpinBalance from spinResult.userBalance (this is the SOURCE OF TRUTH)
      - Assert: postSpinBalance.Coins >= initialBalance.Coins (coins should not decrease from a spin)
      - Assert: postSpinBalance.Energy === initialBalance.Energy - 1 (spin costs 1 energy)
      - Log: reward details, selectedIndex, post-spin balance
    });

    // STEP 3: Relogin with same DeviceId
    await test.step('Relogin to verify persistence', async () => {
      - Call login(request, deviceId) again (same DeviceId = same account, new session)
      - Store: reloginBalance
    });

    // STEP 4: Validate state persistence
    await test.step('Validate balance persistence', async () => {
      - Assert: reloginBalance.Coins === postSpinBalance.Coins
        → message: 'Coins should persist across sessions — reward applied exactly once'
      - Assert: reloginBalance.Gems === postSpinBalance.Gems
        → message: 'Gems should remain unchanged across sessions'
      - Assert: reloginBalance.Energy === postSpinBalance.Energy
        → message: 'Energy should persist across sessions — no rollback'
    });
  });
});
```

**Important design decisions**:
- Use a **fresh DeviceId per test run** → test isolation, idempotent
- **DO NOT calculate expected coins manually** from reward Amount — use `postSpinBalance` from spin response as source of truth, then compare against relogin balance
- **Why?** Because `RewardDefinitionType === 6` rewards grant coins indirectly via nested `FeedResponse.Rewards`, making manual calculation unreliable without parsing deep nested structures
- Assert `Coins >= initialCoins` (not strict addition) because the reward type might be non-coins but feed rewards can still add coins indirectly
- Use meaningful assertion messages that map to the assignment's "Key Invariants"

### 4. `playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  reporter: [['html'], ['list']],
  use: {
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
});
```

Note: Do NOT set `baseURL` here since we're using full URLs in the api-client.

### 5. `package.json`

```json
{
  "name": "fish-of-fortune-tests",
  "version": "1.0.0",
  "description": "E2E test suite for Fish of Fortune Wheel Spin API",
  "scripts": {
    "test": "npx playwright test",
    "test:list": "npx playwright test --reporter=list"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "typescript": "^5.3.0",
    "@types/uuid": "^10.0.0"
  },
  "dependencies": {
    "uuid": "^11.0.0"
  }
}
```

### 6. `tsconfig.json`

Standard TypeScript config for Node.js + Playwright.

---

### 7. Postman Collection — `postman/Fish_of_Fortune_E2E.postman_collection.json`

Create a Postman Collection v2.1 JSON file. It must be **runnable sequentially** (Login → Spin → Relogin).

#### Collection Variables:
| Variable | Initial Value |
|----------|--------------|
| `baseUrl` | `https://fof-devplayground-api.whalosvc.com` |
| `deviceId` | _(empty, set by pre-request script)_ |
| `accessToken` | _(empty, set after login)_ |
| `postSpinCoins` | _(empty, set after spin)_ |
| `postSpinGems` | _(empty, set after spin)_ |
| `postSpinEnergy` | _(empty, set after spin)_ |

#### Request 1: Login

- **POST** `{{baseUrl}}/api/frontend/login/v4/login`
- **Pre-request Script**:
```javascript
const uuid = pm.variables.replaceIn('{{$guid}}');
pm.collectionVariables.set('deviceId', uuid);
```
- **Body** (raw JSON):
```json
{
  "DeviceId": "candidate_test_{{deviceId}}",
  "LoginSource": "test_raz_0523XXXXXXXX"
}
```
- **Tests Script** (use EXACT paths):
```javascript
pm.test('Status code is 200', function () {
    pm.response.to.have.status(200);
});

const body = pm.response.json();

pm.test('Response status is 0 (success)', function () {
    pm.expect(body.status).to.eql(0);
});

const loginResponse = body.response.LoginResponse;

pm.test('AccessToken is present', function () {
    pm.expect(loginResponse.AccessToken).to.be.a('string').and.not.empty;
});

pm.test('UserBalance exists with required fields', function () {
    pm.expect(loginResponse.UserBalance).to.have.property('Coins');
    pm.expect(loginResponse.UserBalance).to.have.property('Gems');
    pm.expect(loginResponse.UserBalance).to.have.property('Energy');
});

pm.test('Energy is greater than 0', function () {
    pm.expect(loginResponse.UserBalance.Energy).to.be.above(0);
});

// Store variables for next requests
pm.collectionVariables.set('accessToken', loginResponse.AccessToken);
pm.collectionVariables.set('initialCoins', loginResponse.UserBalance.Coins);
pm.collectionVariables.set('initialEnergy', loginResponse.UserBalance.Energy);

console.log('Initial Balance:', JSON.stringify(loginResponse.UserBalance));
```

#### Request 2: Spin Wheel

- **POST** `{{baseUrl}}/api/frontend/wheel//v1`
- **Headers**:
  - `Content-Type: application/json`
  - `accessToken: {{accessToken}}`
- **Body** (raw JSON):
```json
{
  "multiplier": 1
}
```
- **Tests Script**:
```javascript
pm.test('Status code is 200', function () {
    pm.response.to.have.status(200);
});

const body = pm.response.json();

pm.test('Response status is 0 (success)', function () {
    pm.expect(body.status).to.eql(0);
});

pm.test('SpinResult exists', function () {
    pm.expect(body.response).to.have.property('SpinResult');
});

const spinResult = body.response.SpinResult;

pm.test('Rewards is a non-empty array', function () {
    pm.expect(spinResult.Rewards).to.be.an('array').that.is.not.empty;
});

pm.test('Reward has required fields', function () {
    const reward = spinResult.Rewards[0];
    pm.expect(reward).to.have.property('RewardDefinitionType');
    pm.expect(reward).to.have.property('RewardResourceType');
    pm.expect(reward).to.have.property('Amount');
    pm.expect(reward).to.have.property('TrackingId');
});

pm.test('UserBalance exists in spin response', function () {
    pm.expect(spinResult.UserBalance).to.have.property('Coins');
    pm.expect(spinResult.UserBalance).to.have.property('Gems');
    pm.expect(spinResult.UserBalance).to.have.property('Energy');
});

pm.test('Energy decreased by 1', function () {
    const initialEnergy = parseInt(pm.collectionVariables.get('initialEnergy'));
    pm.expect(spinResult.UserBalance.Energy).to.eql(initialEnergy - 1);
});

// Store post-spin balance for relogin verification
pm.collectionVariables.set('postSpinCoins', spinResult.UserBalance.Coins);
pm.collectionVariables.set('postSpinGems', spinResult.UserBalance.Gems);
pm.collectionVariables.set('postSpinEnergy', spinResult.UserBalance.Energy);

console.log('Reward:', JSON.stringify(spinResult.Rewards[0]));
console.log('Post-Spin Balance:', JSON.stringify(spinResult.UserBalance));
```

#### Request 3: Relogin (Verify Persistence)

- **POST** `{{baseUrl}}/api/frontend/login/v4/login`
- **Body** (raw JSON):
```json
{
  "DeviceId": "candidate_test_{{deviceId}}",
  "LoginSource": "test_raz_0523XXXXXXXX"
}
```
- **Tests Script**:
```javascript
pm.test('Status code is 200', function () {
    pm.response.to.have.status(200);
});

const body = pm.response.json();
const balance = body.response.LoginResponse.UserBalance;

pm.test('Coins persisted correctly (no duplication or rollback)', function () {
    const expectedCoins = parseInt(pm.collectionVariables.get('postSpinCoins'));
    pm.expect(balance.Coins).to.eql(expectedCoins);
});

pm.test('Gems persisted correctly', function () {
    const expectedGems = parseInt(pm.collectionVariables.get('postSpinGems'));
    pm.expect(balance.Gems).to.eql(expectedGems);
});

pm.test('Energy persisted correctly', function () {
    const expectedEnergy = parseInt(pm.collectionVariables.get('postSpinEnergy'));
    pm.expect(balance.Energy).to.eql(expectedEnergy);
});

console.log('Relogin Balance:', JSON.stringify(balance));
```

---

### 8. `README.md`

Write a professional, concise README with these exact sections:

```markdown
# Fish of Fortune — QA Automation E2E Test Suite

## Overview
Automated end-to-end test suite for the Fish of Fortune Wheel Spin backend API flow.
Validates reward application, state persistence across sessions, and data integrity.

## Tech Stack
- Node.js + TypeScript
- Playwright (API testing)
- Postman (API validation collection)

## Prerequisites
- Node.js >= 18
- npm

## Setup
npm install
npx playwright install

## Running Tests

### Playwright Tests
npm test

### Postman Collection
1. Import postman/Fish_of_Fortune_E2E.postman_collection.json into Postman
2. Run the collection sequentially using Collection Runner (Run order: Login → Spin → Relogin)

## Test Flow

1. **Create new user** — generate unique DeviceId (uuid v4), call Login API
2. **Store initial balance** — capture Coins, Gems, Energy from response.LoginResponse.UserBalance
3. **Spin the wheel** — call Spin API with access token, validate response structure and reward data
4. **Store post-spin balance** — capture updated UserBalance from response.SpinResult.UserBalance (source of truth)
5. **Relogin** — call Login API with same DeviceId (new session)
6. **Verify persistence** — assert relogin balance matches post-spin balance exactly

## Key Invariants Validated
- Spin reward is applied exactly once
- User state persists across relogin (new session)
- No duplicate rewards are granted
- No rollback occurs after session change

## Assumptions
- Each test run uses a fresh DeviceId (uuid v4) ensuring test isolation and idempotency
- A newly created account starts with sufficient Energy (>0) to perform at least one spin
- status: 0 in API responses indicates a successful operation
- Coin rewards are identified by RewardDefinitionType === 1 AND RewardResourceType === 1, but the wheel can also return RewardDefinitionType === 6 (feed/card rewards) which may indirectly grant coins via nested FeedResponse.Rewards
- Due to the above, the post-spin UserBalance from the spin response is used as the authoritative balance rather than manually computing expected coins from reward amounts
- Each spin costs exactly 1 Energy
- The accessToken header is a custom header (not standard Authorization/Bearer)
- The Spin API endpoint path contains an intentional double slash (/wheel//v1)
- UserBalance in the spin response reflects the fully updated state immediately after the spin
- Relogin with the same DeviceId returns the persisted state without modification
- The LoginSource parameter remains constant across all requests; only DeviceId varies per user
```

---

## Critical Rules — DO NOT Violate

1. **JSON paths are EXACT** — `body.response.LoginResponse.AccessToken` and `body.response.LoginResponse.UserBalance` for login; `body.response.SpinResult.Rewards` and `body.response.SpinResult.UserBalance` for spin. Do NOT guess different paths.
2. **Double slash in spin URL**: `/api/frontend/wheel//v1` — this is correct, do NOT "fix" it.
3. **Access token header is `accessToken`** (camelCase) — NOT `Authorization`, NOT `Bearer`.
4. **DO NOT manually calculate expected coins** from reward Amount. Use `SpinResult.UserBalance` as the source of truth and compare against relogin balance. This is because `RewardDefinitionType === 6` rewards grant coins indirectly through nested `FeedResponse.Rewards`.
5. **Each test uses a NEW DeviceId** — never reuse across test runs.
6. **LoginSource is constant** — only DeviceId changes.
7. **Keep it simple** — no bonus features, no multi-spin loops, no extra validations beyond what's specified.
8. **Postman collection must be valid JSON** (v2.1 schema) importable directly into Postman.
