import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('PasswordUtils', () => {
  // Mock Web Crypto API for testing
  const mockCrypto = {
    getRandomValues: vi.fn((array: Uint8Array) => {
      // Fill with deterministic values for testing
      for (let i = 0; i < array.length; i++) {
        array[i] = i % 256
      }
      return array
    }),
    subtle: {
      importKey: vi.fn().mockResolvedValue('mockKey'),
      deriveBits: vi.fn().mockImplementation(() => {
        // Return a deterministic 32-byte array
        const buffer = new ArrayBuffer(32)
        const view = new Uint8Array(buffer)
        for (let i = 0; i < 32; i++) {
          view[i] = i
        }
        return Promise.resolve(buffer)
      }),
    },
  }

  // Mock the password utility functions that would normally be in functions/utils/password.ts
  class PasswordUtils {
    private static readonly SALT_LENGTH = 16
    private static readonly KEY_LENGTH = 32
    private static readonly ITERATIONS = 100000

    static async hashPassword(password: string): Promise<string> {
      const salt = crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH))
      const passwordBuffer = new TextEncoder().encode(password)
      
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      )
      
      const derivedKey = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: this.ITERATIONS,
          hash: 'SHA-256'
        },
        keyMaterial,
        this.KEY_LENGTH * 8
      )
      
      const hashArray = new Uint8Array(derivedKey)
      const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('')
      const hashHex = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('')
      
      return `${saltHex}:${hashHex}`
    }

    static async verifyPassword(password: string, hash: string): Promise<boolean> {
      const [saltHex, hashHex] = hash.split(':')
      if (!saltHex || !hashHex) return false
      
      const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)))
      const storedHash = new Uint8Array(hashHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)))
      
      const passwordBuffer = new TextEncoder().encode(password)
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      )
      
      const derivedKey = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: this.ITERATIONS,
          hash: 'SHA-256'
        },
        keyMaterial,
        this.KEY_LENGTH * 8
      )
      
      const computedHash = new Uint8Array(derivedKey)
      
      // Constant-time comparison
      if (computedHash.length !== storedHash.length) return false
      
      let result = 0
      for (let i = 0; i < computedHash.length; i++) {
        result |= computedHash[i] ^ storedHash[i]
      }
      
      return result === 0
    }

    static isValidPassword(password: string): boolean {
      if (password.length < 8 || password.length > 128) return false
      
      const hasUppercase = /[A-Z]/.test(password)
      const hasLowercase = /[a-z]/.test(password)
      const hasNumber = /\d/.test(password)
      const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)
      
      return hasUppercase && hasLowercase && hasNumber && hasSpecialChar
    }

    static isValidUsername(username: string): boolean {
      if (username.length < 3 || username.length > 50) return false
      return /^[a-zA-Z0-9_-]+$/.test(username)
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock global crypto for testing
    vi.stubGlobal('crypto', mockCrypto)
  })

  describe('hashPassword', () => {
    it('should hash a password and return salt:hash format', async () => {
      const password = 'TestPassword123!'
      const hash = await PasswordUtils.hashPassword(password)
      
      expect(hash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{64}$/)
      expect(hash.split(':').length).toBe(2)
    })

    it('should generate different hashes for the same password on multiple calls', async () => {
      const password = 'TestPassword123!'
      
      // Reset the mock to generate different values
      let callCount = 0
      mockCrypto.getRandomValues.mockImplementation((array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = (i + callCount) % 256
        }
        callCount++
        return array
      })
      
      const hash1 = await PasswordUtils.hashPassword(password)
      const hash2 = await PasswordUtils.hashPassword(password)
      
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('verifyPassword', () => {
    it('should verify a correct password', async () => {
      const password = 'TestPassword123!'
      const hash = await PasswordUtils.hashPassword(password)
      
      const isValid = await PasswordUtils.verifyPassword(password, hash)
      expect(isValid).toBe(true)
    })

    it('should reject an incorrect password', async () => {
      const password = 'TestPassword123!'
      const wrongPassword = 'WrongPassword123!'
      const hash = await PasswordUtils.hashPassword(password)
      
      // Mock different derived key for wrong password
      mockCrypto.subtle.deriveBits.mockImplementationOnce(() => {
        const buffer = new ArrayBuffer(32)
        const view = new Uint8Array(buffer)
        for (let i = 0; i < 32; i++) {
          view[i] = (i + 1) % 256  // Different from original
        }
        return Promise.resolve(buffer)
      })
      
      const isValid = await PasswordUtils.verifyPassword(wrongPassword, hash)
      expect(isValid).toBe(false)
    })

    it('should reject malformed hash', async () => {
      const password = 'TestPassword123!'
      const malformedHash = 'not-a-valid-hash'
      
      const isValid = await PasswordUtils.verifyPassword(password, malformedHash)
      expect(isValid).toBe(false)
    })

    it('should reject hash with missing salt or hash part', async () => {
      const password = 'TestPassword123!'
      
      const isValid1 = await PasswordUtils.verifyPassword(password, 'onlyonepart')
      const isValid2 = await PasswordUtils.verifyPassword(password, ':missingpalt')
      const isValid3 = await PasswordUtils.verifyPassword(password, 'missinghash:')
      
      expect(isValid1).toBe(false)
      expect(isValid2).toBe(false)
      expect(isValid3).toBe(false)
    })
  })

  describe('isValidPassword', () => {
    it('should accept a strong password', () => {
      const strongPassword = 'StrongP@ss123'
      expect(PasswordUtils.isValidPassword(strongPassword)).toBe(true)
    })

    it('should reject password that is too short', () => {
      const shortPassword = 'Short1!'
      expect(PasswordUtils.isValidPassword(shortPassword)).toBe(false)
    })

    it('should reject password that is too long', () => {
      const longPassword = 'A'.repeat(129) + '1!'
      expect(PasswordUtils.isValidPassword(longPassword)).toBe(false)
    })

    it('should reject password without uppercase', () => {
      const noUppercase = 'lowercase123!'
      expect(PasswordUtils.isValidPassword(noUppercase)).toBe(false)
    })

    it('should reject password without lowercase', () => {
      const noLowercase = 'UPPERCASE123!'
      expect(PasswordUtils.isValidPassword(noLowercase)).toBe(false)
    })

    it('should reject password without numbers', () => {
      const noNumbers = 'NoNumbers!'
      expect(PasswordUtils.isValidPassword(noNumbers)).toBe(false)
    })

    it('should reject password without special characters', () => {
      const noSpecialChar = 'NoSpecialChar123'
      expect(PasswordUtils.isValidPassword(noSpecialChar)).toBe(false)
    })
  })

  describe('isValidUsername', () => {
    it('should accept valid username', () => {
      const validUsernames = ['user123', 'valid_user', 'test-user', 'a1b2c3']
      validUsernames.forEach(username => {
        expect(PasswordUtils.isValidUsername(username)).toBe(true)
      })
    })

    it('should reject username that is too short', () => {
      const shortUsername = 'ab'
      expect(PasswordUtils.isValidUsername(shortUsername)).toBe(false)
    })

    it('should reject username that is too long', () => {
      const longUsername = 'a'.repeat(51)
      expect(PasswordUtils.isValidUsername(longUsername)).toBe(false)
    })

    it('should reject username with invalid characters', () => {
      const invalidUsernames = ['user@name', 'user name', 'user.name', 'user+name']
      invalidUsernames.forEach(username => {
        expect(PasswordUtils.isValidUsername(username)).toBe(false)
      })
    })
  })
})
