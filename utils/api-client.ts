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
  const response = await request.post(`${BASE_URL}/api/frontend/login/v4/login`, {
    data: {
      DeviceId: deviceId,
      LoginSource: LOGIN_SOURCE,
    },
  });

  const httpStatus = response.status();
  const body = await response.json();

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
}

export async function spinWheel(request: APIRequestContext, accessToken: string): Promise<SpinResult> {
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
  const spinResult = body.response.SpinResult;

  return {
    httpStatus,
    selectedIndex: body.response.SelectedIndex,
    rewards: spinResult.Rewards,
    userBalance: spinResult.UserBalance,
    fullResponse: body,
  };
}
