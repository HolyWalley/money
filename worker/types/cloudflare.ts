import type { UserSettings } from "../../shared/types/userSettings"
import type { MarketObject } from "../durable-objects/MarketObject"
import type { MoneyObject } from "../durable-objects/MoneyObject"
import type { IPremium } from "../utils/storage"

export interface UserInfo {
  userId: string
  username: string
  premium: IPremium
  settings: UserSettings
}

export interface CloudflareEnv {
  MONEY_USER_AUTH: KVNamespace
  JWT_ACCESS_SECRET: string
  JWT_REFRESH_SECRET: string
  JWT_ACCESS_EXPIRES_IN: string
  JWT_REFRESH_EXPIRES_IN: string
  MONEY_OBJECT: DurableObjectNamespace<MoneyObject>;
  // One shared instance for everyone, addressed by a fixed name - market data
  // is public, not per-user.
  MARKET_OBJECT: DurableObjectNamespace<MarketObject>;
  ENVIRONMENT?: string; // 'development' | 'production'
}

export interface CloudflareContext {
  request: Request
  env: CloudflareEnv
  next: () => Promise<Response>
  data?: {
    user: UserInfo
  }
}
