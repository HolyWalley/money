export interface CloudflareEnv {
  MONEY_USER_AUTH: KVNamespace
  JWT_ACCESS_SECRET: string
  JWT_REFRESH_SECRET: string
  JWT_ACCESS_EXPIRES_IN: string
  JWT_REFRESH_EXPIRES_IN: string
}

export interface CloudflareContext {
  request: Request
  env: CloudflareEnv
  next: () => Promise<Response>
  user?: {
    userId: string
    username: string
  }
}