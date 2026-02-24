import { test, expect } from '@playwright/test';
import { generateDeviceId, login, spinWheel } from '../utils/api-client';

/**
 * BONUS: Extended Login Response Validation
 *
 * The login response contains many more params beyond UserBalance.
 * This test validates additional fields such as AccountCreated, ExternalPlayerId,
 * DisplayName, Level, Wheel config, and internal data consistency.
 */
test.describe('Bonus — Extended Login Response Validation', () => {

  test('first login — validate additional response params', async ({ request }) => {
    const deviceId = generateDeviceId();
    const result = await login(request, deviceId);

    expect(result.httpStatus).toBe(200);
    expect(result.fullResponse.status).toBe(0);

    // LoginStatus should indicate success
    expect(result.loginStatus, 'LoginStatus should be 1 (success)').toBe(1);

    // AccountCreated must be true for a brand-new DeviceId
    expect(result.accountCreated,
      'AccountCreated must be true on first login with a new DeviceId'
    ).toBe(true);

    // ExternalPlayerId — unique player identifier assigned on creation
    expect(typeof result.externalPlayerId).toBe('string');
    expect(result.externalPlayerId.length).toBeGreaterThan(0);

    // DisplayName — auto-assigned guest name
    expect(typeof result.displayName).toBe('string');
    expect(result.displayName.length).toBeGreaterThan(0);

    // Avatar — default avatar assigned
    expect(typeof result.avatar).toBe('number');
    expect(result.avatar).toBeGreaterThanOrEqual(0);

    // Level — new user starts at level 1
    expect(result.level.LevelId, 'New user should start at level 1').toBe(1);
    expect(typeof result.level.LandId).toBe('string');
    expect(result.level.LandId.length).toBeGreaterThan(0);

    // Wheel — must have a config with wedges for spinning
    expect(typeof result.wheel.WheelId).toBe('string');
    expect(result.wheel.Wedges.length, 'Wheel must have wedges').toBeGreaterThan(0);

    // wheel should have exactly 26 wedges (based on known config)
    expect(result.wheel.Wedges.length, 'Wheel should have 26 wedges').toBe(26);

    // Cards — new user receives starter cards
    expect(result.cards.length, 'New user should have starter cards').toBeGreaterThan(0);

    // Internal consistency — top-level amounts must match UserBalance
    expect(result.coinsAmount, 'CoinsAmount must match UserBalance.Coins').toBe(result.userBalance.Coins);
    expect(result.gemsAmount, 'GemsAmount must match UserBalance.Gems').toBe(result.userBalance.Gems);
    expect(result.energyAmount, 'EnergyAmount must match UserBalance.Energy').toBe(result.userBalance.Energy);

    console.log('AccountCreated:', result.accountCreated);
    console.log('ExternalPlayerId:', result.externalPlayerId);
    console.log('DisplayName:', result.displayName);
    console.log('Level:', result.level.LevelId, '| Land:', result.level.LandId);
    console.log('Cards:', result.cards.length, '| Wedges:', result.wheel.Wedges.length);
  });

  test('relogin — AccountCreated is false and identity persists', async ({ request }) => {
    const deviceId = generateDeviceId();

    // First login — create account
    const firstLogin = await login(request, deviceId);
    expect(firstLogin.httpStatus).toBe(200);
    expect(firstLogin.accountCreated).toBe(true);

    // Spin to modify state
    const spin = await spinWheel(request, firstLogin.accessToken);
    expect(spin.httpStatus).toBe(200);

    // Relogin
    const relogin = await login(request, deviceId);
    expect(relogin.httpStatus).toBe(200);
    expect(relogin.fullResponse.status).toBe(0);

    // AccountCreated must be false on relogin
    expect(relogin.accountCreated,
      'AccountCreated must be false on relogin — account already exists'
    ).toBe(false);

    // Identity fields persist across sessions
    expect(relogin.externalPlayerId, 'ExternalPlayerId must persist').toBe(firstLogin.externalPlayerId);
    expect(relogin.displayName, 'DisplayName must persist').toBe(firstLogin.displayName);
    expect(relogin.avatar, 'Avatar must persist').toBe(firstLogin.avatar);

    // Level persists
    expect(relogin.level.LevelId, 'LevelId must persist').toBe(firstLogin.level.LevelId);

    // Internal consistency on relogin
    expect(relogin.coinsAmount, 'Relogin CoinsAmount must match UserBalance.Coins').toBe(relogin.userBalance.Coins);
    expect(relogin.gemsAmount, 'Relogin GemsAmount must match UserBalance.Gems').toBe(relogin.userBalance.Gems);
    expect(relogin.energyAmount, 'Relogin EnergyAmount must match UserBalance.Energy').toBe(relogin.userBalance.Energy);

    console.log('AccountCreated (relogin):', relogin.accountCreated);
    console.log('ExternalPlayerId match:', relogin.externalPlayerId === firstLogin.externalPlayerId);
    console.log('DisplayName match:', relogin.displayName === firstLogin.displayName);
  });
});
