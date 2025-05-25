import { describe, it, expect } from 'vitest'
import { signupSchema, signinSchema } from '@/lib/auth-schemas'

describe('Auth Schemas', () => {
  describe('signupSchema', () => {
    it('should validate a valid signup payload', () => {
      const validData = {
        username: 'testuser',
        password: 'StrongP@ss123',
        confirmPassword: 'StrongP@ss123'
      }

      const result = signupSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should reject username that is too short', () => {
      const invalidData = {
        username: 'ab',
        password: 'StrongP@ss123',
        confirmPassword: 'StrongP@ss123'
      }

      const result = signupSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toContain('at least 3 characters')
    })

    it('should reject username that is too long', () => {
      const invalidData = {
        username: 'a'.repeat(51),
        password: 'StrongP@ss123',
        confirmPassword: 'StrongP@ss123'
      }

      const result = signupSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toContain('less than 30 characters')
    })

    it('should reject username with invalid characters', () => {
      const invalidData = {
        username: 'user@name',
        password: 'StrongP@ss123',
        confirmPassword: 'StrongP@ss123'
      }

      const result = signupSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toContain('letters, numbers')
    })

    it('should reject weak password', () => {
      const invalidData = {
        username: 'testuser',
        password: 'weak',
        confirmPassword: 'weak'
      }

      const result = signupSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues.some(issue => 
        issue.message.includes('at least 8 characters')
      )).toBe(true)
    })

    it('should reject password without uppercase letter', () => {
      const invalidData = {
        username: 'testuser',
        password: 'lowercase123',
        confirmPassword: 'lowercase123'
      }

      const result = signupSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues.some(issue => 
        issue.message.includes('uppercase letter')
      )).toBe(true)
    })

    it('should reject password without lowercase letter', () => {
      const invalidData = {
        username: 'testuser',
        password: 'UPPERCASE123',
        confirmPassword: 'UPPERCASE123'
      }

      const result = signupSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues.some(issue => 
        issue.message.includes('lowercase letter')
      )).toBe(true)
    })

    it('should reject password without number', () => {
      const invalidData = {
        username: 'testuser',
        password: 'NoNumbers',
        confirmPassword: 'NoNumbers'
      }

      const result = signupSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues.some(issue => 
        issue.message.includes('number')
      )).toBe(true)
    })

    it('should reject mismatched passwords', () => {
      const invalidData = {
        username: 'testuser',
        password: 'StrongP@ss123',
        confirmPassword: 'DifferentP@ss123'
      }

      const result = signupSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toContain("do not match")
    })

    it('should reject missing fields', () => {
      const invalidData = {
        username: 'testuser'
        // Missing password and confirmPassword
      }

      const result = signupSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('signinSchema', () => {
    it('should validate a valid signin payload', () => {
      const validData = {
        username: 'testuser',
        password: 'AnyPassword123!'
      }

      const result = signinSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should reject empty username', () => {
      const invalidData = {
        username: '',
        password: 'password'
      }

      const result = signinSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toContain('required')
    })

    it('should reject empty password', () => {
      const invalidData = {
        username: 'testuser',
        password: ''
      }

      const result = signinSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues.some(issue => 
        issue.message.includes('required')
      )).toBe(true)
    })

    it('should reject missing fields', () => {
      const invalidData = {}

      const result = signinSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues.length).toBe(2)
    })

    it('should validate any string for username and password with minimum requirements', () => {
      // Sign in schema has validation requirements
      const validData = {
        username: 'testuser', // meets minimum requirements
        password: 'Password123' // meets minimum requirements
      }

      const result = signinSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })
  })
})
