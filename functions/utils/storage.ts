import type { CloudflareEnv } from '../types/cloudflare'

export interface UserRecord {
  userId: string
  username: string
  passwordHash: string
  createdAt: string
  updatedAt: string
  lastLoginAt?: string
  isActive: boolean
}

export class StorageUtils {
  private static getUserKey(username: string): string {
    return `user:${username.toLowerCase()}`
  }

  static async createUser(
    username: string,
    passwordHash: string,
    env: CloudflareEnv
  ): Promise<UserRecord> {
    const userId = crypto.randomUUID()
    const now = new Date().toISOString()
    
    const userRecord: UserRecord = {
      userId,
      username: username.toLowerCase(),
      passwordHash,
      createdAt: now,
      updatedAt: now,
      isActive: true
    }

    const key = this.getUserKey(username)
    await env.MONEY_USER_AUTH.put(key, JSON.stringify(userRecord))
    
    return userRecord
  }

  static async getUserByUsername(username: string, env: CloudflareEnv): Promise<UserRecord | null> {
    try {
      const key = this.getUserKey(username)
      const data = await env.MONEY_USER_AUTH.get(key)
      
      if (!data) {
        return null
      }
      
      return JSON.parse(data) as UserRecord
    } catch (error) {
      console.error('Error retrieving user:', error)
      return null
    }
  }

  static async updateUser(
    username: string,
    updates: Partial<UserRecord>,
    env: CloudflareEnv
  ): Promise<boolean> {
    try {
      const existingUser = await this.getUserByUsername(username, env)
      
      if (!existingUser) {
        return false
      }
      
      const updatedUser: UserRecord = {
        ...existingUser,
        ...updates,
        updatedAt: new Date().toISOString()
      }
      
      const key = this.getUserKey(username)
      await env.MONEY_USER_AUTH.put(key, JSON.stringify(updatedUser))
      
      return true
    } catch (error) {
      console.error('Error updating user:', error)
      return false
    }
  }

  static async deleteUser(username: string, env: CloudflareEnv): Promise<boolean> {
    try {
      const key = this.getUserKey(username)
      await env.MONEY_USER_AUTH.delete(key)
      return true
    } catch (error) {
      console.error('Error deleting user:', error)
      return false
    }
  }

  static async userExists(username: string, env: CloudflareEnv): Promise<boolean> {
    const user = await this.getUserByUsername(username, env)
    return user !== null && user.isActive
  }

}
