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

export interface LevelInfo {
  LevelId: number;
  LandId: string;
  DaysToComplete: number;
  EndOfContent: boolean;
  CompletedQuests: any[];
  SuggestedQuests: any[];
}

export interface WheelInfo {
  WheelId: string;
  Wedges: any[];
}

export interface SessionInfo {
  SessionCounter: number;
  SessionStartTtlSec: number;
}

export interface CardInfo {
  CardId: string;
  Type: number;
  Amount: number;
  Level: number;
  Rarity: number;
  Weight: number;
  BaseReward: number;
}

export interface LoginResult {
  httpStatus: number;
  loginStatus: number;
  accessToken: string;
  userBalance: UserBalance;
  accountCreated: boolean;
  externalPlayerId: string;
  displayName: string;
  avatar: number;
  level: LevelInfo;
  wheel: WheelInfo;
  cards: CardInfo[];
  session: SessionInfo;
  coinsAmount: number;
  gemsAmount: number;
  energyAmount: number;
  fullResponse: any;
}

export interface SpinResult {
  httpStatus: number;
  selectedIndex: number;
  rewards: Reward[];
  userBalance: UserBalance;
  fullResponse: any;
}
