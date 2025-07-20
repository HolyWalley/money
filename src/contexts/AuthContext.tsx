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

const USER_STORAGE_KEY = 'money-app-user'

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

// Utility functions for localStorage
const saveUserToStorage = (user: User | null) => {
  if (user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(USER_STORAGE_KEY)
  }
}

const loadUserFromStorage = (): User | null => {
  try {
    const stored = localStorage.getItem(USER_STORAGE_KEY)
    return stored ? JSON.parse(stored) : null
  } catch (error) {
    console.warn('Failed to load user from storage:', error)
    localStorage.removeItem(USER_STORAGE_KEY)
    return null
  }
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUserState] = useState<User | null>(() => loadUserFromStorage())
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const isAuthenticated = user !== null
  const isPremium = useMemo(() => user?.premium?.active ?? false, [user?.premium?.active])

  // Enhanced setUser that also handles localStorage
  const setUser = (newUser: User | null) => {
    setUserState(newUser)
    saveUserToStorage(newUser)
  }

  // Check authentication status on mount and refresh
  const checkAuth = async (silent = false) => {
    if (!silent) {
      setIsLoading(true)
    }
    
    try {
      const response = await apiClient.checkAuth()

      if (response.ok && response.data) {
        setUser(response.data)
      } else {
        setUser(null)
      }
    } catch (error) {
      console.error('Auth check error:', error)
      if (!silent) {
        setUser(null)
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
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

  // Background auth refresh when user is cached
  useEffect(() => {
    const cachedUser = loadUserFromStorage()
    if (cachedUser) {
      // User is loaded from cache, do a silent background refresh
      checkAuth(true)
    } else {
      // No cached user, do a full auth check
      checkAuth()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
