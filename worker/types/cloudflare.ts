import { UserSettings } from "../../shared/types/userSettings"
import { MoneyObject } from "../durable-objects/MoneyObject.ts"
import { IPremium } from "../utils/storage"

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
