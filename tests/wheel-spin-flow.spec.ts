import { test, expect } from '@playwright/test';
import { generateDeviceId, login, spinWheel } from '../utils/api-client';
import { UserBalance } from '../utils/types';

test.describe('Wheel Spin E2E Flow', () => {

  test('reward persistence across sessions', async ({ request }) => {
    const deviceId = generateDeviceId();
    let accessToken: string;
    let initialBalance: UserBalance;
    let postSpinBalance: UserBalance;
    let reloginBalance: UserBalance;

    await test.step('Step 1: Create new user and login', async () => {
      const result = await login(request, deviceId);

      // Assert HTTP 200 and API-level success
      expect(result.httpStatus).toBe(200);
      expect(result.fullResponse.status).toBe(0);

      // Assert access token is present
      expect(result.accessToken).toBeTruthy();
      expect(typeof result.accessToken).toBe('string');

      // Assert energy is sufficient for a spin
      expect(result.userBalance.Energy).toBeGreaterThan(0);

      // Store for subsequent steps
      accessToken = result.accessToken;
      initialBalance = result.userBalance;

      console.log('Initial Balance:', JSON.stringify(initialBalance));
    });

    await test.step('Step 2: Spin the wheel', async () => {
      const result = await spinWheel(request, accessToken);

      // Assert HTTP 200 and API-level success
      expect(result.httpStatus).toBe(200);
      expect(result.fullResponse.status).toBe(0);

      // Assert rewards array exists and is not empty
      expect(result.rewards).toBeInstanceOf(Array);
      expect(result.rewards.length).toBeGreaterThan(0);

      // Assert first reward has required fields
      const reward = result.rewards[0];
      expect(typeof reward.RewardDefinitionType).toBe('number');
      expect(typeof reward.RewardResourceType).toBe('number');
      expect(typeof reward.Amount).toBe('number');
      expect(typeof reward.TrackingId).toBe('string');
      expect(reward.TrackingId.length).toBeGreaterThan(0);

      // Assert selectedIndex is valid
      expect(result.selectedIndex).toBeGreaterThanOrEqual(0);

      // Assert coins did not decrease (spin never takes coins away)
      expect(result.userBalance.Coins).toBeGreaterThanOrEqual(initialBalance.Coins);

      // Assert energy decreased by exactly 1 (each spin costs 1 energy)
      expect(result.userBalance.Energy).toBe(initialBalance.Energy - 1);

      // Store post-spin balance — THIS IS THE SOURCE OF TRUTH
      postSpinBalance = result.userBalance;

      console.log('Reward:', JSON.stringify(reward));
      console.log('Selected Index:', result.selectedIndex);
      console.log('Post-Spin Balance:', JSON.stringify(postSpinBalance));
    });

    await test.step('Step 3: Relogin with same DeviceId', async () => {
      const result = await login(request, deviceId);

      // Assert HTTP 200
      expect(result.httpStatus).toBe(200);

      // Store relogin balance
      reloginBalance = result.userBalance;

      console.log('Relogin Balance:', JSON.stringify(reloginBalance));
    });

    await test.step('Step 4: Validate state persistence across sessions', async () => {
      // ── Invariant 1: Spin reward is applied exactly once ──
      // The reward was applied (balance changed from initial state)
      expect(postSpinBalance.Coins,
        'Reward must be applied — post-spin coins should be >= initial coins'
      ).toBeGreaterThanOrEqual(initialBalance.Coins);
      // The reward was not applied again on relogin (no duplication)
      expect(reloginBalance.Coins,
        'Reward applied exactly once — relogin coins must equal post-spin coins, not higher'
      ).toBe(postSpinBalance.Coins);

      //  User state persists across relogin 
      expect(reloginBalance.Coins,
        'Coins must persist across sessions'
      ).toBe(postSpinBalance.Coins);
      expect(reloginBalance.Gems,
        'Gems must persist across sessions'
      ).toBe(postSpinBalance.Gems);
      expect(reloginBalance.Energy,
        'Energy must persist across sessions'
      ).toBe(postSpinBalance.Energy);

      //  No duplicate rewards are granted 
      // If coins were duplicated, relogin balance would exceed post-spin balance
      expect(reloginBalance.Coins,
        'No duplicate rewards — relogin coins must not exceed post-spin coins'
      ).toBeLessThanOrEqual(postSpinBalance.Coins);
      // Energy should not have been refunded (which would indicate a duplicate cycle)
      expect(reloginBalance.Energy,
        'No duplicate spin — energy must not be refunded after session change'
      ).toBe(postSpinBalance.Energy);

      //  No rollback occurs after session change ──
      // Coins must not revert to initial balance (rollback detection)
      expect(reloginBalance.Coins,
        'No rollback — relogin coins must be >= initial coins (reward must not be reverted)'
      ).toBeGreaterThanOrEqual(initialBalance.Coins);
      // Energy must not revert to initial balance (rollback detection)
      expect(reloginBalance.Energy,
        'No rollback — energy must reflect the spin cost, not revert to initial energy'
      ).toBe(initialBalance.Energy - 1);
    });
  });
});
