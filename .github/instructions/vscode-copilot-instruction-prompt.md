Create a complete E2E API test suite project for a mobile game backend called "Fish of Fortune". The project tests a Wheel Spin flow. Generate ALL files listed below — every file must be complete, production-ready, and working out of the box.

## Project Structure — create all of these files:

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
    ├── api-client.ts
    └── types.ts
```

---

## FILE 1: `utils/types.ts`

Define these TypeScript interfaces:

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
  RewardActionType?: number;
  FeedResponse?: any;
}

export interface LoginResult {
  accessToken: string;
  userBalance: UserBalance;
  accountCreated: boolean;
  fullResponse: any;
}

export interface SpinResult {
  selectedIndex: number;
  rewards: Reward[];
  userBalance: UserBalance;
  fullResponse: any;
}
```

---

## FILE 2: `utils/api-client.ts`

Two API functions + a device ID generator. FOLLOW THESE EXACT SPECS:

**Base URL**: `https://fof-devplayground-api.whalosvc.com`
**LoginSource constant**: `test_raz_05022XXXXXXXX`

### `generateDeviceId()`
- Returns `candidate_test_<uuid-v4>` using the `uuid` package

### `login(request: APIRequestContext, deviceId: string): Promise<LoginResult>`
- `POST /api/frontend/login/v4/login`
- Header: `Content-Type: application/json`
- Body: `{ "DeviceId": deviceId, "LoginSource": "test_raz_05022XXXXXXXX" }`
- EXACT response extraction paths (these are confirmed from the real API, do NOT change them):
```typescript
const body = await response.json();
const loginResponse = body.response.LoginResponse;
// accessToken = loginResponse.AccessToken
// userBalance = loginResponse.UserBalance  (has .Coins, .Gems, .Energy)
// accountCreated = loginResponse.AccountCreated
```

### `spinWheel(request: APIRequestContext, accessToken: string): Promise<SpinResult>`
- `POST /api/frontend/wheel//v1` ← DOUBLE SLASH IS INTENTIONAL, DO NOT REMOVE IT
- Headers:
  - `Content-Type: application/json`
  - `accessToken: <token>` ← this is a CUSTOM HEADER called `accessToken` (camelCase). It is NOT `Authorization` and NOT `Bearer`. The header key is literally `accessToken`.
- Body: `{ "multiplier": 1 }`
- EXACT response extraction paths:
```typescript
const body = await response.json();
const spinResult = body.response.SpinResult;
// selectedIndex = body.response.SelectedIndex
// rewards = spinResult.Rewards  (array)
// userBalance = spinResult.UserBalance  (has .Coins, .Gems, .Energy — this is the post-spin balance)
```

Do NOT put `expect` assertions inside the api-client. Keep it as a pure data-fetching utility. Return the HTTP response status alongside the parsed data so the test can assert on it, OR return the full response object. Either approach is fine, just make sure the test file can assert on HTTP status.

---

## FILE 3: `tests/wheel-spin-flow.spec.ts`

One test file with one `test.describe` block containing one test. Use `test.step()` for each logical phase.

```typescript
import { test, expect } from '@playwright/test';
import { generateDeviceId, login, spinWheel } from '../utils/api-client';
import { UserBalance } from '../utils/types';

test.describe('Wheel Spin E2E Flow', () => {

  test('reward persistence across sessions', async ({ request }) => {
    const deviceId = generateDeviceId();
    let accessToken: string;
    let initialBalance: UserBalance;
    let postSpinBalance: UserBalance;

    await test.step('Step 1: Create new user and login', async () => {
      // Call login with fresh deviceId
      // Assert: HTTP 200 and body.status === 0
      // Assert: accessToken is a non-empty string
      // Assert: Energy > 0 (required for spin)
      // Store: accessToken, initialBalance
      // console.log the initial balance
    });

    await test.step('Step 2: Spin the wheel', async () => {
      // Call spinWheel with accessToken
      // Assert: HTTP 200 and body.status === 0
      // Assert: rewards array exists and is not empty
      // Assert: first reward has these fields as numbers: RewardDefinitionType, RewardResourceType, Amount
      // Assert: first reward has TrackingId as a non-empty string
      // Assert: selectedIndex is a number >= 0
      // Assert: postSpinBalance.Coins >= initialBalance.Coins (coins never decrease from spinning)
      // Assert: postSpinBalance.Energy === initialBalance.Energy - 1 (each spin costs 1 energy)
      // Store: postSpinBalance from spinResult.userBalance (THIS IS THE SOURCE OF TRUTH)
      // console.log the reward and post-spin balance
    });

    await test.step('Step 3: Relogin with same DeviceId', async () => {
      // Call login again with the SAME deviceId (new session, same account)
      // Assert: HTTP 200
      // Store: reloginBalance
    });

    await test.step('Step 4: Validate state persistence across sessions', async () => {
      // Assert: reloginBalance.Coins === postSpinBalance.Coins
      //   with message: 'Coins must persist — reward applied exactly once, no duplication or rollback'
      // Assert: reloginBalance.Gems === postSpinBalance.Gems
      //   with message: 'Gems must remain consistent across sessions'
      // Assert: reloginBalance.Energy === postSpinBalance.Energy
      //   with message: 'Energy must persist — no rollback after session change'
    });
  });
});
```

**IMPORTANT**: Do NOT try to manually calculate expected coins by adding `reward.Amount` to `initialBalance.Coins`. The reason: the wheel has two reward types. Type 1 (`RewardDefinitionType===1, RewardResourceType===1`) adds coins directly. Type 6 (`RewardDefinitionType===6`) is a feed/card reward that ALSO adds coins indirectly via a nested `FeedResponse.Rewards` object. Manual calculation would be unreliable. Instead, trust `SpinResult.UserBalance` as the authoritative post-spin state and compare it against the relogin balance.

---

## FILE 4: `playwright.config.ts`

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

---

## FILE 5: `package.json`

```json
{
  "name": "fish-of-fortune-tests",
  "version": "1.0.0",
  "description": "E2E API test suite for Fish of Fortune Wheel Spin flow",
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

---

## FILE 6: `tsconfig.json`

Standard config: target ES2020, module commonjs, strict true, esModuleInterop true, resolveJsonModule true, outDir dist, include `["tests/**/*", "utils/**/*"]`.

---

## FILE 7: `postman/Fish_of_Fortune_E2E.postman_collection.json`

Generate a valid Postman Collection v2.1 JSON file with 3 requests that run sequentially. This must be directly importable into Postman.

### Collection variables:
- `baseUrl` = `https://fof-devplayground-api.whalosvc.com`
- `deviceId` = `` (empty)
- `accessToken` = `` (empty)
- `initialCoins` = `` (empty)
- `initialEnergy` = `` (empty)
- `postSpinCoins` = `` (empty)
- `postSpinGems` = `` (empty)
- `postSpinEnergy` = `` (empty)

### Request 1: "Login — Create New User"
- POST `{{baseUrl}}/api/frontend/login/v4/login`
- Pre-request script: generate UUID, set `deviceId` variable
```javascript
const uuid = pm.variables.replaceIn('{{$guid}}');
pm.collectionVariables.set('deviceId', uuid);
```
- Body:
```json
{ "DeviceId": "candidate_test_{{deviceId}}", "LoginSource": "test_raz_05022XXXXXXXX" }
```
- Tests:
```javascript
pm.test('Status code is 200', function () {
    pm.response.to.have.status(200);
});
const body = pm.response.json();
pm.test('Response status is 0', function () {
    pm.expect(body.status).to.eql(0);
});
const loginResp = body.response.LoginResponse;
pm.test('AccessToken exists', function () {
    pm.expect(loginResp.AccessToken).to.be.a('string').and.not.empty;
});
pm.test('UserBalance has required fields', function () {
    pm.expect(loginResp.UserBalance).to.have.property('Coins');
    pm.expect(loginResp.UserBalance).to.have.property('Gems');
    pm.expect(loginResp.UserBalance).to.have.property('Energy');
});
pm.test('Energy > 0', function () {
    pm.expect(loginResp.UserBalance.Energy).to.be.above(0);
});
pm.collectionVariables.set('accessToken', loginResp.AccessToken);
pm.collectionVariables.set('initialCoins', loginResp.UserBalance.Coins);
pm.collectionVariables.set('initialEnergy', loginResp.UserBalance.Energy);
console.log('Initial Balance:', JSON.stringify(loginResp.UserBalance));
```

### Request 2: "Spin Wheel"
- POST `{{baseUrl}}/api/frontend/wheel//v1`  ← DOUBLE SLASH
- Headers: `Content-Type: application/json` AND `accessToken: {{accessToken}}`
- Body: `{ "multiplier": 1 }`
- Tests:
```javascript
pm.test('Status code is 200', function () {
    pm.response.to.have.status(200);
});
const body = pm.response.json();
pm.test('Response status is 0', function () {
    pm.expect(body.status).to.eql(0);
});
pm.test('SpinResult exists', function () {
    pm.expect(body.response).to.have.property('SpinResult');
});
const spinResult = body.response.SpinResult;
pm.test('Rewards is non-empty array', function () {
    pm.expect(spinResult.Rewards).to.be.an('array').that.is.not.empty;
});
pm.test('Reward has required fields', function () {
    const r = spinResult.Rewards[0];
    pm.expect(r).to.have.property('RewardDefinitionType');
    pm.expect(r).to.have.property('RewardResourceType');
    pm.expect(r).to.have.property('Amount');
    pm.expect(r).to.have.property('TrackingId');
});
pm.test('Post-spin UserBalance exists', function () {
    pm.expect(spinResult.UserBalance).to.have.property('Coins');
    pm.expect(spinResult.UserBalance).to.have.property('Gems');
    pm.expect(spinResult.UserBalance).to.have.property('Energy');
});
pm.test('Energy decreased by 1', function () {
    const initEnergy = parseInt(pm.collectionVariables.get('initialEnergy'));
    pm.expect(spinResult.UserBalance.Energy).to.eql(initEnergy - 1);
});
pm.collectionVariables.set('postSpinCoins', spinResult.UserBalance.Coins);
pm.collectionVariables.set('postSpinGems', spinResult.UserBalance.Gems);
pm.collectionVariables.set('postSpinEnergy', spinResult.UserBalance.Energy);
console.log('Reward:', JSON.stringify(spinResult.Rewards[0]));
console.log('Post-Spin Balance:', JSON.stringify(spinResult.UserBalance));
```

### Request 3: "Relogin — Verify Persistence"
- POST `{{baseUrl}}/api/frontend/login/v4/login`
- Body:
```json
{ "DeviceId": "candidate_test_{{deviceId}}", "LoginSource": "test_raz_05022XXXXXXXX" }
```
- Tests:
```javascript
pm.test('Status code is 200', function () {
    pm.response.to.have.status(200);
});
const body = pm.response.json();
const balance = body.response.LoginResponse.UserBalance;
pm.test('Coins persisted (no duplication/rollback)', function () {
    pm.expect(balance.Coins).to.eql(parseInt(pm.collectionVariables.get('postSpinCoins')));
});
pm.test('Gems persisted', function () {
    pm.expect(balance.Gems).to.eql(parseInt(pm.collectionVariables.get('postSpinGems')));
});
pm.test('Energy persisted', function () {
    pm.expect(balance.Energy).to.eql(parseInt(pm.collectionVariables.get('postSpinEnergy')));
});
console.log('Relogin Balance:', JSON.stringify(balance));
```

---

## FILE 8: `README.md`

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
```bash
npm install
npx playwright install
```

## Running Tests

### Playwright Tests
```bash
npm test
```

### Postman Collection
1. Import `postman/Fish_of_Fortune_E2E.postman_collection.json` into Postman
2. Run the collection sequentially using Collection Runner (Run order: Login → Spin → Relogin)

## Test Flow
1. **Create new user** — generate unique DeviceId (uuid v4), call Login API
2. **Store initial balance** — capture Coins, Gems, Energy from `response.LoginResponse.UserBalance`
3. **Spin the wheel** — call Spin API with access token, validate response structure and reward data
4. **Store post-spin balance** — capture updated balance from `response.SpinResult.UserBalance` (source of truth)
5. **Relogin** — call Login API with same DeviceId (new session)
6. **Verify persistence** — assert relogin balance matches post-spin balance exactly

## Key Invariants Validated
- ✅ Spin reward is applied exactly once
- ✅ User state persists across relogin (new session)
- ✅ No duplicate rewards are granted
- ✅ No rollback occurs after session change

## Assumptions
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
- `LoginSource` remains constant; only `DeviceId` varies per user
```

---

## HARD RULES — VIOLATING ANY OF THESE WILL BREAK THE TESTS:

1. Login response paths: `body.response.LoginResponse.AccessToken` and `body.response.LoginResponse.UserBalance` — NOT any other path
2. Spin response paths: `body.response.SpinResult.Rewards` and `body.response.SpinResult.UserBalance` — NOT any other path
3. Spin URL has DOUBLE SLASH: `/api/frontend/wheel//v1` — do NOT remove it
4. Access token header key is literally `accessToken` (camelCase custom header) — NOT `Authorization`, NOT `Bearer`, NOT `access-token`
5. Do NOT manually calculate expected coins — use SpinResult.UserBalance as source of truth
6. Each test run generates a NEW uuid DeviceId — never hardcode or reuse
7. LoginSource is always `test_raz_05022XXXXXXXX` — never changes
8. The Postman collection JSON must be valid v2.1 schema, directly importable

Now generate all 8 files with complete, working code. No placeholders, no TODOs, no "implement here" comments.
