import { test, expect } from '@playwright/test';
import { generateDeviceId, login, spinWheel } from '../utils/api-client';

/**
 * BONUS: Spin Until Exhaustion & Scripted Wheel Detection
 *
 * Test 1 — Spins the wheel until energy runs out, tracking coin balance
 *          progression via SpinResult.UserBalance (source of truth).
 *          Confirms persistence after exhaustion via relogin.
 *
 * Test 2 — Creates two independent users, runs each through the full
 *          spin-to-exhaustion flow, and compares Wedges arrays + selectedIndex
 *          sequences to determine if the wheel is scripted.
 *
 * Note: Only coins are tracked. Other reward types (RewardDefinitionType === 6
 * with FeedResponse) can change coin balance indirectly, which is why we always
 * use spin.userBalance.Coins as source of truth — never manual arithmetic.
 */
test.describe('Bonus — Spin Until Exhaustion', () => {

  /**
   * Helper: spin a user until energy reaches 0.
   * Returns the full spin history and final state.
   */
  async function spinUntilExhausted(
    request: any,
    accessToken: string,
    initialEnergy: number,
    initialCoins: number
  ) {
    const spinHistory: Array<{
      spinNumber: number;
      selectedIndex: number;
      coinsBefore: number;
      coinsAfter: number;
      coinDelta: number;
      rewardTypes: number[];
    }> = [];

    let currentEnergy = initialEnergy;
    let currentCoins = initialCoins;

    while (currentEnergy > 0) {
      const coinsBefore = currentCoins;
      const spin = await spinWheel(request, accessToken);

      expect(spin.httpStatus, `Spin ${spinHistory.length + 1} should return HTTP 200`).toBe(200);

      const coinsAfter = spin.userBalance.Coins;
      const rewardTypes = spin.rewards.map(r => r.RewardDefinitionType);

      spinHistory.push({
        spinNumber: spinHistory.length + 1,
        selectedIndex: spin.selectedIndex,
        coinsBefore,
        coinsAfter,
        coinDelta: coinsAfter - coinsBefore,
        rewardTypes,
      });

      currentCoins = coinsAfter;
      currentEnergy = spin.userBalance.Energy;
    }

    return { spinHistory, finalCoins: currentCoins, finalEnergy: currentEnergy };
  }

  test('spin until out of energy and track coin balance', async ({ request }) => {
    test.setTimeout(60_000);

    const deviceId = generateDeviceId();

    // ── Step 1: Login ──
    const loginResult = await login(request, deviceId);
    expect(loginResult.httpStatus).toBe(200);

    const initialCoins = loginResult.userBalance.Coins;
    const initialEnergy = loginResult.userBalance.Energy;
    expect(initialEnergy, 'New user must have energy to spin').toBeGreaterThan(0);

    console.log(`Initial state — Coins: ${initialCoins}, Energy: ${initialEnergy}`);

    // ── Step 2: Spin until energy is exhausted ──
    const { spinHistory, finalCoins, finalEnergy } = await spinUntilExhausted(
      request,
      loginResult.accessToken,
      initialEnergy,
      initialCoins
    );

    // Energy must be 0 after exhaustion
    expect(finalEnergy, 'Energy must be 0 after exhaustion').toBe(0);

    // Spin count must be at least initialEnergy (rewards can refill energy, extending the session)
    expect(spinHistory.length, 'Spin count must be >= initial energy').toBeGreaterThanOrEqual(initialEnergy);

    // Final coins must be >= initial (coins can only increase or stay same from spins)
    expect(finalCoins, 'Final coins must be >= initial coins').toBeGreaterThanOrEqual(initialCoins);

    // Log spin-by-spin summary
    const totalCoinsGained = finalCoins - initialCoins;
    console.log(`\nSpin Summary — ${spinHistory.length} spins completed`);
    console.log(`Coins: ${initialCoins} → ${finalCoins} (gained ${totalCoinsGained})`);
    for (const spin of spinHistory) {
      console.log(
        `  Spin ${spin.spinNumber}: index=${spin.selectedIndex}, ` +
        `coins ${spin.coinsBefore} → ${spin.coinsAfter} (${spin.coinDelta >= 0 ? '+' : ''}${spin.coinDelta}), ` +
        `rewardTypes=[${spin.rewardTypes.join(',')}]`
      );
    }

    // ── Step 3: Relogin — verify persistence after full exhaustion ──
    const relogin = await login(request, deviceId);
    expect(relogin.httpStatus).toBe(200);

    expect(relogin.userBalance.Coins,
      'Relogin coins must match final spin coins — state persists after exhaustion'
    ).toBe(finalCoins);

    expect(relogin.userBalance.Energy,
      'Relogin energy must still be 0 — no free refill on relogin'
    ).toBe(0);

    console.log(`\nRelogin — Coins: ${relogin.userBalance.Coins}, Energy: ${relogin.userBalance.Energy}`);
  });

  test('wheel is scripted — same wedges and spin sequence for different users', async ({ request }) => {
    test.setTimeout(60_000);

    // ── Create User A ──
    const deviceIdA = generateDeviceId();
    const loginA = await login(request, deviceIdA);
    expect(loginA.httpStatus).toBe(200);

    // ── Create User B ──
    const deviceIdB = generateDeviceId();
    const loginB = await login(request, deviceIdB);
    expect(loginB.httpStatus).toBe(200);

    // ── Compare Wedges — wheel configuration must be identical ──
    const wedgesA = JSON.stringify(loginA.wheel.Wedges);
    const wedgesB = JSON.stringify(loginB.wheel.Wedges);

    expect(wedgesA,
      'Wheel wedges must be identical for both users — wheel is scripted'
    ).toBe(wedgesB);

    console.log(`Wedges match: ${wedgesA === wedgesB} (${loginA.wheel.Wedges.length} wedges)`);

    // ── Spin both users to exhaustion and collect selectedIndex sequences ──
    const resultA = await spinUntilExhausted(
      request,
      loginA.accessToken,
      loginA.userBalance.Energy,
      loginA.userBalance.Coins
    );

    const resultB = await spinUntilExhausted(
      request,
      loginB.accessToken,
      loginB.userBalance.Energy,
      loginB.userBalance.Coins
    );

    // Both users should have the same number of spins (same starting energy)
    expect(resultA.spinHistory.length,
      'Both users should have the same spin count'
    ).toBe(resultB.spinHistory.length);

    // Compare selectedIndex sequences
    const indicesA = resultA.spinHistory.map(s => s.selectedIndex);
    const indicesB = resultB.spinHistory.map(s => s.selectedIndex);
    const indicesMatch = JSON.stringify(indicesA) === JSON.stringify(indicesB);

    console.log(`\nUser A indices: [${indicesA.join(', ')}]`);
    console.log(`User B indices: [${indicesB.join(', ')}]`);
    console.log(`Spin sequence match: ${indicesMatch}`);

    // The wheel config (Wedges) is scripted — assert it
    // The spin outcomes (selectedIndex) may or may not be scripted — log but assert
    expect(indicesMatch,
      'Spin outcome sequence should be identical for both users — wheel is fully scripted'
    ).toBe(true);

    console.log('\nWheel is scripted: identical wedges AND identical spin outcomes for two independent users.');
  });
});
