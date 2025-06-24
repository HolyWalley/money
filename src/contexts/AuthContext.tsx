import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { type UserSettings } from '../../shared/types/userSettings.ts'
import { apiClient } from '../lib/api-client'

export interface IPremium {
  active: boolean
  activatedAt?: string
}

export interface User {
  userId: string
  username: string
  createdAt: string
  premium: IPremium,
  updatedAt?: string,
  settings?: UserSettings
}

export interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  isPremium: boolean
  signin: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  signup: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  signout: () => Promise<void>
  refreshAuth: () => Promise<void>
  setUser: (user: User | null) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  const isAuthenticated = user !== null
  const isPremium = useMemo(() => user?.premium?.active ?? false, [user?.premium?.active])

  // Check authentication status on mount and refresh
  const checkAuth = async () => {
    try {
      const response = await apiClient.checkAuth()

      if (response.ok && response.data) {
        setUser(response.data)
      } else {
        setUser(null)
      }
    } catch (error) {
      console.error('Auth check error:', error)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  // Signin function
  const signin = async (username: string, password: string) => {
    try {
      const response = await apiClient.signin(username, password)

      if (response.ok && response.data) {
        setUser(response.data)
        navigate('/dashboard')
        window.scrollTo(0, 0)
        return { success: true }
      } else {
        return { success: false, error: response.error || 'Sign in failed' }
      }
    } catch (error) {
      console.error('Signin error:', error)
      return { success: false, error: 'Network error occurred' }
    }
  }

  // Signup function
  const signup = async (username: string, password: string) => {
    try {
      const response = await apiClient.signup(username, password)

      if (response.ok && response.data) {
        setUser(response.data)
        navigate('/dashboard')
        window.scrollTo(0, 0)
        return { success: true }
      } else {
        return {
          success: false,
          error: response.error || 'Sign up failed'
        }
      }
    } catch (error) {
      console.error('Signup error:', error)
      return { success: false, error: 'Network error occurred' }
    }
  }

  // Signout function
  const signout = async () => {
    try {
      await apiClient.signout()
    } catch (error) {
      console.error('Signout error:', error)
    } finally {
      setUser(null)
      navigate('/auth')
    }
  }

  // Refresh authentication
  const refreshAuth = async () => {
    await checkAuth()
  }

  // Since we now have automatic 401 retry with refresh in apiClient,
  // we don't need the periodic refresh interval anymore
  useEffect(() => {
    // Auto-refresh is handled by apiClient on 401 responses
  }, [])

  // Check auth on mount
  useEffect(() => {
    checkAuth()
  }, [])

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    isPremium,
    signin,
    signup,
    signout,
    refreshAuth,
    setUser
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
