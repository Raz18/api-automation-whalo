import { APIRequestContext } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';
import { LoginResult, SpinResult } from './types';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'https://fof-devplayground-api.whalosvc.com';
const LOGIN_SOURCE = process.env.LOGIN_SOURCE || 'test_raz_05022XXXXXXXX';

export function generateDeviceId(): string {
  return `candidate_test_${uuidv4()}`;
}

export async function login(request: APIRequestContext, deviceId: string): Promise<LoginResult> {
  try {
    const response = await request.post(`${BASE_URL}/api/frontend/login/v4/login`, {
      data: {
        DeviceId: deviceId,
        LoginSource: LOGIN_SOURCE,
      },
    });

    const httpStatus = response.status();
    const body = await response.json();

    if (!body?.response?.LoginResponse) {
      throw new Error(`Invalid login response structure. HTTP ${httpStatus}. Body: ${JSON.stringify(body)}`);
    }

    const loginResponse = body.response.LoginResponse;

    return {
      httpStatus,
      loginStatus: body.response.LoginStatus,
      accessToken: loginResponse.AccessToken,
      userBalance: loginResponse.UserBalance,
      accountCreated: loginResponse.AccountCreated,
      externalPlayerId: loginResponse.ExternalPlayerId,
      displayName: loginResponse.DisplayName,
      avatar: loginResponse.Avatar,
      level: loginResponse.Level,
      wheel: loginResponse.Wheel,
      cards: loginResponse.Cards,
      session: loginResponse.Session,
      coinsAmount: loginResponse.CoinsAmount,
      gemsAmount: loginResponse.GemsAmount,
      energyAmount: loginResponse.EnergyAmount,
      fullResponse: body,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Login API call failed for deviceId '${deviceId}': ${message}`, { cause: error });
  }
}

export async function spinWheel(request: APIRequestContext, accessToken: string): Promise<SpinResult> {
  try {
    const response = await request.post(`${BASE_URL}/api/frontend/wheel//v1`, {
      headers: {
        accessToken: accessToken, // custom header
      },
      data: {
        multiplier: 1,
      },
    });

    const httpStatus = response.status();
    const body = await response.json();
    const status = body?.status ?? -1;

    // Handle business-logic rejections (e.g. status -3: NotEnoughResources)
    if (status !== 0) {
      return {
        httpStatus,
        status,
        rawResponse: typeof body?.response === 'string' ? body.response : JSON.stringify(body?.response),
        fullResponse: body,
      } as SpinResult;
    }

    const spinResult = body?.response?.SpinResult;

    if (!spinResult) {
      throw new Error(`Invalid spin response structure. HTTP ${httpStatus}. Body: ${JSON.stringify(body)}`);
    }

    return {
      httpStatus,
      status,
      selectedIndex: body.response.SelectedIndex,
      rewards: spinResult.Rewards,
      userBalance: spinResult.UserBalance,
      fullResponse: body,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`SpinWheel API call failed: ${message}`, { cause: error });
  }
}