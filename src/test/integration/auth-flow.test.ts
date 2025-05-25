import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch for integration testing
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Authentication Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Signup Flow', () => {
    it('should handle successful user signup', async () => {
      const signupData = {
        username: 'testuser',
        password: 'StrongP@ss123'
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: { id: 'user-123', username: 'testuser' }
          }
        })
      })

      const response = await fetch('/api/v1/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(signupData)
      })

      const result = await response.json()

      expect(response.ok).toBe(true)
      expect(result.success).toBe(true)
      expect(result.data.user.username).toBe('testuser')
      expect(mockFetch).toHaveBeenCalledWith('/api/v1/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(signupData)
      })
    })

    it('should handle signup failure with existing username', async () => {
      const signupData = {
        username: 'existinguser',
        password: 'StrongP@ss123'
      }

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: 'Username already exists'
        })
      })

      const response = await fetch('/api/v1/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(signupData)
      })

      const result = await response.json()

      expect(response.ok).toBe(false)
      expect(response.status).toBe(409)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Username already exists')
    })
  })

  describe('Signin Flow', () => {
    it('should handle successful user signin', async () => {
      const signinData = {
        username: 'testuser',
        password: 'StrongP@ss123'
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: { id: 'user-123', username: 'testuser' }
          }
        })
      })

      const response = await fetch('/api/v1/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(signinData)
      })

      const result = await response.json()

      expect(response.ok).toBe(true)
      expect(result.success).toBe(true)
      expect(result.data.user.username).toBe('testuser')
    })

    it('should handle signin failure with invalid credentials', async () => {
      const signinData = {
        username: 'testuser',
        password: 'wrongpassword'
      }

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: 'Invalid credentials'
        })
      })

      const response = await fetch('/api/v1/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(signinData)
      })

      const result = await response.json()

      expect(response.ok).toBe(false)
      expect(response.status).toBe(401)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid credentials')
    })
  })

  describe('Protected Route Access', () => {
    it('should allow access to /me endpoint with valid authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: { id: 'user-123', username: 'testuser' }
          }
        })
      })

      const response = await fetch('/api/v1/me', {
        credentials: 'include'
      })

      const result = await response.json()

      expect(response.ok).toBe(true)
      expect(result.success).toBe(true)
      expect(result.data.user.username).toBe('testuser')
    })

    it('should deny access to /me endpoint without authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: 'Unauthorized'
        })
      })

      const response = await fetch('/api/v1/me', {
        credentials: 'include'
      })

      const result = await response.json()

      expect(response.ok).toBe(false)
      expect(response.status).toBe(401)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized')
    })
  })

  describe('Token Refresh Flow', () => {
    it('should successfully refresh access token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: { id: 'user-123', username: 'testuser' }
          }
        })
      })

      const response = await fetch('/api/v1/refresh', {
        method: 'POST',
        credentials: 'include'
      })

      const result = await response.json()

      expect(response.ok).toBe(true)
      expect(result.success).toBe(true)
      expect(result.data.user.username).toBe('testuser')
    })

    it('should fail to refresh with invalid refresh token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: 'Invalid refresh token'
        })
      })

      const response = await fetch('/api/v1/refresh', {
        method: 'POST',
        credentials: 'include'
      })

      const result = await response.json()

      expect(response.ok).toBe(false)
      expect(response.status).toBe(401)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid refresh token')
    })
  })

  describe('Signout Flow', () => {
    it('should successfully sign out user', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true
        })
      })

      const response = await fetch('/api/v1/signout', {
        method: 'POST',
        credentials: 'include'
      })

      const result = await response.json()

      expect(response.ok).toBe(true)
      expect(result.success).toBe(true)
    })
  })

  describe('Complete Authentication Flow', () => {
    it('should handle complete signup -> signin -> access protected route -> signout flow', async () => {
      // 1. Signup
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { user: { id: 'user-123', username: 'testuser' } }
        })
      })

      const signupResponse = await fetch('/api/v1/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: 'testuser', password: 'StrongP@ss123' })
      })

      expect(signupResponse.ok).toBe(true)

      // 2. Access protected route
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { user: { id: 'user-123', username: 'testuser' } }
        })
      })

      const meResponse = await fetch('/api/v1/me', {
        credentials: 'include'
      })

      expect(meResponse.ok).toBe(true)

      // 3. Signout
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      })

      const signoutResponse = await fetch('/api/v1/signout', {
        method: 'POST',
        credentials: 'include'
      })

      expect(signoutResponse.ok).toBe(true)

      // 4. Try to access protected route after signout
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: 'Unauthorized'
        })
      })

      const unauthorizedResponse = await fetch('/api/v1/me', {
        credentials: 'include'
      })

      expect(unauthorizedResponse.ok).toBe(false)
      expect(unauthorizedResponse.status).toBe(401)
    })
  })
})
