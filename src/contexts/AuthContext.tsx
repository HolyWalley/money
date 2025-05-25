import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export interface User {
  userId: string
  username: string
  createdAt: string
  updatedAt?: string
}

export interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  signin: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  signup: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  signout: () => Promise<void>
  refreshAuth: () => Promise<void>
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

  const isAuthenticated = user !== null

  // Check authentication status on mount and refresh
  const checkAuth = async () => {
    try {
      const response = await fetch('/api/v1/me', {
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data?.user) {
          setUser(data.data.user)
        } else {
          setUser(null)
        }
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
      const response = await fetch('/api/v1/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setUser(data.data.user)
        return { success: true }
      } else {
        return { success: false, error: data.error || 'Sign in failed' }
      }
    } catch (error) {
      console.error('Signin error:', error)
      return { success: false, error: 'Network error occurred' }
    }
  }

  // Signup function
  const signup = async (username: string, password: string) => {
    try {
      const response = await fetch('/api/v1/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setUser(data.data.user)
        return { success: true }
      } else {
        return { 
          success: false, 
          error: data.errors?.join(', ') || data.error || 'Sign up failed' 
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
      await fetch('/api/v1/signout', {
        method: 'POST',
        credentials: 'include'
      })
    } catch (error) {
      console.error('Signout error:', error)
    } finally {
      setUser(null)
    }
  }

  // Refresh authentication
  const refreshAuth = async () => {
    await checkAuth()
  }

  // Auto-refresh token when needed
  useEffect(() => {
    const attemptTokenRefresh = async () => {
      try {
        const response = await fetch('/api/v1/refresh', {
          method: 'POST',
          credentials: 'include'
        })

        if (response.ok) {
          await checkAuth()
        }
      } catch (error) {
        console.error('Token refresh error:', error)
      }
    }

    // Refresh token every 10 minutes if authenticated
    let refreshInterval: NodeJS.Timeout | null = null
    
    if (isAuthenticated) {
      refreshInterval = setInterval(attemptTokenRefresh, 10 * 60 * 1000)
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval)
      }
    }
  }, [isAuthenticated])

  // Check auth on mount
  useEffect(() => {
    checkAuth()
  }, [])

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    signin,
    signup,
    signout,
    refreshAuth
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}