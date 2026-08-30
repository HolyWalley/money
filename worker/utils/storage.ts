import type { UserSettings } from '../../shared/types/userSettings'
import type { CloudflareEnv } from '../types/cloudflare'

export interface IPremium {
  active: boolean
  activatedAt?: string // ISO timestamp when premium was last activated
}

export interface UserRecord {
  userId: string
  username: string
  passwordHash: string
  createdAt: string
  updatedAt: string
  lastLoginAt?: string
  isActive: boolean,
  premium: IPremium,
  settings: UserSettings
}

// 'read' is a transport failure: retrying is the right answer and it will clear
// on its own. 'corrupt' never clears by retrying - the stored record itself is
// unusable and an operator has to repair it. Both stay under status 'error' so
// every caller keeps answering 503 (a corrupt record is a server-side data
// problem, and a 401 would log the user out and destroy their local identity for
// it), but the reason distinguishes them in logs and to any caller that cares.
export type StorageReadFailureReason = 'read' | 'corrupt'

export type StorageReadResult<T> =
  | { status: 'found'; value: T }
  | { status: 'not-found' }
  | { status: 'error'; reason: StorageReadFailureReason; error: unknown }

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
      isActive: true,
      premium: {
        active: false
      },
      settings: {
        defaultCurrency: 'USD',
      }
    }

    const key = this.getUserKey(username)
    await env.MONEY_USER_AUTH.put(key, JSON.stringify(userRecord))

    return userRecord
  }

  static async readUserByUsername(username: string, env: CloudflareEnv): Promise<StorageReadResult<UserRecord>> {
    const key = this.getUserKey(username)

    let data: string | null
    try {
      data = await env.MONEY_USER_AUTH.get(key)
    } catch (error) {
      console.error('Error retrieving user:', error)
      return { status: 'error', reason: 'read', error }
    }

    if (!data) {
      return { status: 'not-found' }
    }

    try {
      return { status: 'found', value: this.parseUserRecord(data) }
    } catch (error) {
      // Loud and specific: without this line a corrupt record is indistinguishable
      // from a KV blip, so the account retries a 503 forever and nobody is told.
      console.error(`Corrupt user record at KV key "${key}" - manual repair required:`, error)
      return { status: 'error', reason: 'corrupt', error }
    }
  }

  private static parseUserRecord(data: string): UserRecord {
    const parsed = JSON.parse(data) as unknown

    // Only the fields every stored version has ever had, so an older record is
    // never mistaken for a corrupt one.
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as UserRecord).userId !== 'string' ||
      typeof (parsed as UserRecord).username !== 'string'
    ) {
      throw new Error('User record is not a valid user object')
    }

    return parsed as UserRecord
  }

  static async getUserByUsername(username: string, env: CloudflareEnv): Promise<UserRecord | null> {
    const read = await this.readUserByUsername(username, env)
    return read.status === 'found' ? read.value : null
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
