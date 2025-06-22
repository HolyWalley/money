import { UserSettings } from "../../shared/types/userSettings"
import { MoneyObject } from "../durable-objects/MoneyObject.ts"

export interface UserInfo {
  userId: string
  username: string
  premium: boolean
  settings: UserSettings
}

export interface CloudflareEnv {
  MONEY_USER_AUTH: KVNamespace
  JWT_ACCESS_SECRET: string
  JWT_REFRESH_SECRET: string
  JWT_ACCESS_EXPIRES_IN: string
  JWT_REFRESH_EXPIRES_IN: string
  MONEY_OBJECT: DurableObjectNamespace<MoneyObject>;
}

export interface CloudflareContext {
  request: Request
  env: CloudflareEnv
  next: () => Promise<Response>
  data?: {
    user: UserInfo
  }
}
