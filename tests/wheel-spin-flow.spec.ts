import { test, expect, APIRequestContext } from '@playwright/test';
import { generateDeviceId, login, spinWheel } from '../utils/api-client';
import { UserBalance, Reward } from '../utils/types';

test.describe('Wheel Spin E2E Flow', () => {

  test('reward persistence across sessions', async ({ request }: { request: APIRequestContext }) => {
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
      expect(result.status, 'Spin must succeed (status 0)').toBe(0);

      // Assert rewards array exists and is not empty
      expect(result.rewards).toBeInstanceOf(Array);
      expect(result.rewards.length).toBeGreaterThan(0);

      // ASSUMPTION: For this test flow, i assume the wheel grants a single primary reward per spin.
      const reward = result.rewards[0];
      
      expect(typeof reward.RewardDefinitionType).toBe('number');
      expect(typeof reward.RewardResourceType).toBe('number');
      expect(typeof reward.Amount).toBe('number');
      expect(reward.Amount).toBeGreaterThan(0);
      expect(typeof reward.TrackingId).toBe('string');

      // Dynamically calculate expected balances based on the exact reward granted.
      let expectedCoins = initialBalance.Coins;
      let expectedEnergy = initialBalance.Energy - 1; // Base cost of 1 energy per spin

      if (reward.RewardDefinitionType === 1 && reward.RewardResourceType === 1) {
        // Direct coin reward
        expectedCoins += reward.Amount;
      } else if (reward.RewardDefinitionType === 6 && reward.FeedResponse?.Rewards) {
        // Card/Feed reward — coins granted indirectly via FeedResponse.Rewards
        const nestedRewards = Object.values(reward.FeedResponse.Rewards).flat() as Reward[];
        for (const nr of nestedRewards) {
          if (nr.RewardDefinitionType === 1 && nr.RewardResourceType === 1) {
            expectedCoins += nr.Amount;
          }
        }
      }

      if (reward.RewardResourceType === 3) {
        // Energy reward 
        expectedEnergy += reward.Amount;
      }

      // Strict assertions verifying the business logic
      expect(result.userBalance.Coins, 'Coins balance must exactly match expected outcome').toBe(expectedCoins);
      expect(result.userBalance.Energy, 'Energy balance must exactly match expected outcome').toBe(expectedEnergy);

      // Store post-spin balance — THIS IS THE SOURCE OF TRUTH
      postSpinBalance = result.userBalance;

      console.log('Reward:', JSON.stringify(reward));
      console.log('Selected Index:', result.selectedIndex);
      console.log('Post-Spin Balance:', JSON.stringify(postSpinBalance));
    });

    await test.step('Step 3: Relogin with same DeviceId', async () => {
      const result = await login(request, deviceId);

      // Assert HTTP 200 and API-level success
      expect(result.httpStatus).toBe(200);
      expect(result.fullResponse.status).toBe(0);

      // Store relogin balance
      reloginBalance = result.userBalance;

      console.log('Relogin Balance:', JSON.stringify(reloginBalance));
    });

    await test.step('Step 4: Validate state persistence across sessions', async () => {
      // postSpinBalance was already strictly validated in Step 2 (exact coin/energy math).
      // Step 4 only needs to prove the server persisted that validated state across sessions.

      // ── Invariant: Reward applied exactly once & state persists ──
      // If relogin balance === post-spin balance, it proves:
      //   1. The reward was applied (balance changed from initial — validated in Step 2)
      //   2. The reward was not duplicated (balance is not higher than post-spin)
      //   3. No rollback occurred (balance did not revert to initial)
      expect(reloginBalance.Coins, 'Coins must persist across sessions').toBe(postSpinBalance.Coins);
      expect(reloginBalance.Gems, 'Gems must persist across sessions').toBe(postSpinBalance.Gems);
      expect(reloginBalance.Energy, 'Energy must persist across sessions').toBe(postSpinBalance.Energy);
    });
  });
});
