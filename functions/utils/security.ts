import type { CloudflareContext } from '../types/cloudflare'

export interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum requests per window
  keyGenerator?: (request: Request) => string // Custom key generator
}

export interface SecurityHeaders {
  'Content-Security-Policy'?: string
  'X-Frame-Options'?: string
  'X-Content-Type-Options'?: string
  'Referrer-Policy'?: string
  'Permissions-Policy'?: string
}

export class SecurityUtils {
  // Rate limiting using KV store
  static async checkRateLimit(
    request: Request,
    env: CloudflareContext['env'],
    config: RateLimitConfig
  ): Promise<{ allowed: boolean; remainingRequests: number; resetTime: number }> {
    const key = config.keyGenerator ? 
      config.keyGenerator(request) : 
      this.getClientIP(request)
    
    const rateLimitKey = `ratelimit:${key}`
    const now = Date.now()
    const windowStart = Math.floor(now / config.windowMs) * config.windowMs
    const windowKey = `${rateLimitKey}:${windowStart}`
    
    try {
      // Get current request count for this window
      const currentCount = await env.MONEY_USER_AUTH.get(windowKey)
      const requests = currentCount ? parseInt(currentCount, 10) : 0
      
      if (requests >= config.maxRequests) {
        return {
          allowed: false,
          remainingRequests: 0,
          resetTime: windowStart + config.windowMs
        }
      }
      
      // Increment request count
      await env.MONEY_USER_AUTH.put(
        windowKey, 
        String(requests + 1),
        { expirationTtl: Math.ceil(config.windowMs / 1000) + 60 } // Extra 60s buffer
      )
      
      return {
        allowed: true,
        remainingRequests: config.maxRequests - requests - 1,
        resetTime: windowStart + config.windowMs
      }
    } catch (error) {
      console.error('Rate limit check failed:', error)
      // Fail open - allow request if rate limiting fails
      return {
        allowed: true,
        remainingRequests: config.maxRequests - 1,
        resetTime: windowStart + config.windowMs
      }
    }
  }
  
  // Generate CSRF token
  static async generateCSRFToken(
    userId: string,
    env: CloudflareContext['env']
  ): Promise<string> {
    const tokenData = {
      userId,
      timestamp: Date.now(),
      nonce: crypto.getRandomValues(new Uint8Array(16))
    }
    
    const encoder = new TextEncoder()
    const data = encoder.encode(JSON.stringify({
      userId: tokenData.userId,
      timestamp: tokenData.timestamp,
      nonce: Array.from(tokenData.nonce)
    }))
    
    // Import secret key for HMAC
    const secret = encoder.encode(env.JWT_SECRET)
    const key = await crypto.subtle.importKey(
      'raw',
      secret,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    
    // Sign the token data
    const signature = await crypto.subtle.sign('HMAC', key, data)
    const signatureArray = new Uint8Array(signature)
    
    // Combine data and signature
    const combined = new Uint8Array(data.length + signatureArray.length)
    combined.set(data)
    combined.set(signatureArray, data.length)
    
    // Base64 encode
    return btoa(String.fromCharCode(...combined))
  }
  
  // Verify CSRF token
  static async verifyCSRFToken(
    token: string,
    userId: string,
    env: CloudflareContext['env']
  ): Promise<boolean> {
    try {
      // Decode base64
      const combined = new Uint8Array(
        atob(token).split('').map(c => c.charCodeAt(0))
      )
      
      // Split data and signature (signature is always 32 bytes for SHA-256)
      const signatureLength = 32
      const data = combined.slice(0, -signatureLength)
      const providedSignature = combined.slice(-signatureLength)
      
      // Parse token data
      const decoder = new TextDecoder()
      const tokenData = JSON.parse(decoder.decode(data))
      
      // Verify userId matches
      if (tokenData.userId !== userId) {
        return false
      }
      
      // Verify token age (max 1 hour)
      const age = Date.now() - tokenData.timestamp
      if (age > 60 * 60 * 1000) {
        return false
      }
      
      // Verify signature
      const encoder = new TextEncoder()
      const secret = encoder.encode(env.JWT_SECRET)
      const key = await crypto.subtle.importKey(
        'raw',
        secret,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      )
      
      return await crypto.subtle.verify(
        'HMAC',
        key,
        providedSignature,
        data
      )
    } catch (error) {
      console.error('CSRF token verification failed:', error)
      return false
    }
  }
  
  // Get client IP address
  static getClientIP(request: Request): string {
    // Cloudflare provides the real IP in CF-Connecting-IP header
    const cfIP = request.headers.get('CF-Connecting-IP')
    if (cfIP) return cfIP
    
    // Fallback to X-Forwarded-For
    const forwardedFor = request.headers.get('X-Forwarded-For')
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim()
    }
    
    // Last resort fallback
    return 'unknown'
  }
  
  // Sanitize input to prevent XSS and injection attacks
  static sanitizeInput(input: string): string {
    if (typeof input !== 'string') return ''
    
    return input
      .trim()
      .replace(/[<>'"&]/g, (char) => {
        const entities: Record<string, string> = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;'
        }
        return entities[char] || char
      })
      // Remove null bytes and control characters except newlines and tabs
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  }
  
  // Validate and sanitize username
  static sanitizeUsername(username: string): string {
    if (typeof username !== 'string') return ''
    
    return username
      .trim()
      .toLowerCase()
      // Remove any characters that aren't alphanumeric, underscore, or hyphen
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 50) // Enforce max length
  }
  
  // Generate secure security headers
  static getSecurityHeaders(): SecurityHeaders {
    return {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'", // Allow inline scripts for theme
        "style-src 'self' 'unsafe-inline'", // Allow inline styles for Tailwind
        "img-src 'self' data:", // Allow data URLs for icons
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; '),
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'payment=()',
        'usb=()'
      ].join(', ')
    }
  }
  
  // Add security headers to response
  static addSecurityHeaders(response: Response): Response {
    const headers = this.getSecurityHeaders()
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    })
    
    Object.entries(headers).forEach(([key, value]) => {
      newResponse.headers.set(key, value)
    })
    
    return newResponse
  }
  
  // Log security events
  static logSecurityEvent(
    event: string,
    details: Record<string, unknown>,
    request: Request
  ): void {
    const logData = {
      timestamp: new Date().toISOString(),
      event,
      ip: this.getClientIP(request),
      userAgent: request.headers.get('User-Agent'),
      url: request.url,
      ...details
    }
    
    console.warn('SECURITY EVENT:', JSON.stringify(logData))
  }
  
  // Check for suspicious patterns in requests
  static detectSuspiciousActivity(request: Request): string[] {
    const issues: string[] = []
    const url = new URL(request.url)
    
    // Check for SQL injection patterns
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|OR)\b.*=)/i,
      /(--|\*\/|\*\*)/,
      /(\bOR\b.*=.*\bOR\b)/i
    ]
    
    const searchParams = url.searchParams.toString()
    sqlPatterns.forEach(pattern => {
      if (pattern.test(searchParams)) {
        issues.push('potential_sql_injection')
      }
    })
    
    // Check for XSS patterns
    const xssPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i
    ]
    
    xssPatterns.forEach(pattern => {
      if (pattern.test(searchParams)) {
        issues.push('potential_xss')
      }
    })
    
    // Check for excessive request rate from single IP
    const userAgent = request.headers.get('User-Agent')
    if (!userAgent || userAgent.length < 10) {
      issues.push('suspicious_user_agent')
    }
    
    return issues
  }
}
