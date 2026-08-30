import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { type UserSettings } from '../../shared/types/userSettings.ts'
import { apiClient } from '../lib/api-client'
import { describeAuthError } from '../lib/auth-error-copy'

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
  sessionExpired: boolean
  lastVerifiedAt: number | null
  signin: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  signup: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  signout: () => Promise<void>
  refreshAuth: () => Promise<void>
  setUser: (user: User | null) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const USER_STORAGE_KEY = 'money-app-user'

// Under the 900s access-cookie Max-Age (worker/utils/jwt.ts), so a long-open
// tab renews in the background instead of discovering expiry at the worst moment.
export const AUTH_REVERIFY_MIN_INTERVAL_MS = 600_000

// The interval above is armed by a *successful* verification, so on an unreachable
// server it never arms at all and every app-switcher pass fires another 8s /me.
// This floor is armed by the attempt, matching the 30s pull throttle sync.ts uses
// against the same trigger (iOS Safari fires visibilitychange on every pass).
export const AUTH_REVERIFY_FAILURE_MIN_INTERVAL_MS = 30_000

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
  const [sessionExpired, setSessionExpired] = useState(false)
  const [lastVerifiedAt, setLastVerifiedAt] = useState<number | null>(null)
  const navigate = useNavigate()

  const isAuthenticated = user !== null
  const isPremium = useMemo(() => user?.premium?.active ?? false, [user?.premium?.active])

  // Bumped by every deliberate identity change (signin, signup, signout) so a
  // verification issued under the previous identity can be recognised as stale.
  const identityGeneration = useRef(0)
  // Attempt time of the last completed checkAuth, whatever its outcome, and how
  // many are outstanding. Both throttle the background re-verify only.
  const lastAttemptRef = useRef<number | null>(null)
  const checksInFlight = useRef(0)

  // Enhanced setUser that also handles localStorage
  const setUser = useCallback((newUser: User | null) => {
    setUserState(newUser)
    saveUserToStorage(newUser)
  }, [])

  // Check authentication status on mount and refresh
  const checkAuth = useCallback(async (silent = false) => {
    const generation = identityGeneration.current
    checksInFlight.current += 1

    if (!silent) {
      setIsLoading(true)
    }

    try {
      const response = await apiClient.checkAuth()

      // A /me answer belongs to the identity that was current when it was issued.
      // Applying it to a different one resurrects a signed-out user into React
      // state AND localStorage, or clears one who has just signed in.
      if (generation !== identityGeneration.current) return

      if (response.ok && response.data) {
        setUser(response.data)
        setSessionExpired(false)
        setLastVerifiedAt(Date.now())
      } else if (response.failure === 'auth') {
        // The only involuntary logout in the app. Dropping the user also erases
        // the localStorage identity the app runs on offline, so it may fire only
        // when the server positively rejected the refresh token.
        //
        // A session can only EXPIRE if there was one. A first-time visitor's very
        // first /me is a 401 too, and flagging that as expiry greets everyone who
        // has never signed in with "Your session expired".
        const hadSession = loadUserFromStorage() !== null
        setUser(null)
        if (hadSession) setSessionExpired(true)
      }
      // Every other failure - network, timeout, server, client, parse - leaves the
      // cached user exactly as it was.
    } finally {
      checksInFlight.current -= 1
      lastAttemptRef.current = Date.now()

      if (!silent) {
        setIsLoading(false)
      }
    }
  }, [setUser])

  // Signin function
  const signin = useCallback(async (username: string, password: string) => {
    const response = await apiClient.signin(username, password)

    if (response.ok && response.data) {
      identityGeneration.current += 1
      setUser(response.data)
      setSessionExpired(false)
      setLastVerifiedAt(Date.now())
      navigate('/dashboard')
      window.scrollTo(0, 0)
      return { success: true }
    }

    return { success: false, error: describeAuthError(response) }
  }, [navigate, setUser])

  // Signup function
  const signup = useCallback(async (username: string, password: string) => {
    const response = await apiClient.signup(username, password)

    if (response.ok && response.data) {
      identityGeneration.current += 1
      setUser(response.data)
      setSessionExpired(false)
      setLastVerifiedAt(Date.now())
      navigate('/dashboard')
      window.scrollTo(0, 0)
      return { success: true }
    }

    // apiClient.signup has already merged `errors` into `error`; describeAuthError
    // passes that through untouched on its default branch.
    return { success: false, error: describeAuthError(response) }
  }, [navigate, setUser])

  // Signout function
  const signout = useCallback(async () => {
    // Bumped before the request, not in the finally: the intent to drop this
    // identity is unconditional, and anything already in flight must not be able
    // to write it back while the request is still running.
    identityGeneration.current += 1

    try {
      await apiClient.signout()
    } catch (error) {
      console.error('Signout error:', error)
    } finally {
      setUser(null)
      setSessionExpired(false)
      setLastVerifiedAt(null)
      lastAttemptRef.current = null
      navigate('/auth')
    }
  }, [navigate, setUser])

  // Refresh authentication
  const refreshAuth = useCallback(async () => {
    await checkAuth()
  }, [checkAuth])

  const userRef = useRef(user)
  const lastVerifiedRef = useRef(lastVerifiedAt)
  const checkAuthRef = useRef(checkAuth)

  useEffect(() => { userRef.current = user })
  useEffect(() => { lastVerifiedRef.current = lastVerifiedAt })
  useEffect(() => { checkAuthRef.current = checkAuth })

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

  useEffect(() => {
    const maybeVerify = () => {
      if (!userRef.current) return
      if (checksInFlight.current > 0) return
      const last = lastVerifiedRef.current
      if (last !== null && Date.now() - last < AUTH_REVERIFY_MIN_INTERVAL_MS) return
      const attempted = lastAttemptRef.current
      if (attempted !== null && Date.now() - attempted < AUTH_REVERIFY_FAILURE_MIN_INTERVAL_MS) return
      void checkAuthRef.current(true)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') maybeVerify() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', maybeVerify)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', maybeVerify)
    }
  }, [])

  const value: AuthContextType = useMemo(() => ({
    user,
    isLoading,
    isAuthenticated,
    isPremium,
    sessionExpired,
    lastVerifiedAt,
    signin,
    signup,
    signout,
    refreshAuth,
    setUser
  }), [user, isLoading, isAuthenticated, isPremium, sessionExpired, lastVerifiedAt, signin, signup, signout, refreshAuth, setUser])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
