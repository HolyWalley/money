export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  errors?: string[]
}

interface CookieOptions {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
  maxAge?: number
  path?: string
}

export class ResponseUtils {
  static success<T>(data: T, status = 200): Response {
    const response: ApiResponse<T> = {
      success: true,
      data
    }
    
    return new Response(JSON.stringify(response), {
      status,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }

  static error(error: string, status = 400, errors?: string[]): Response {
    const response: ApiResponse = {
      success: false,
      error,
      ...(errors && { errors })
    }
    
    return new Response(JSON.stringify(response), {
      status,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }

  static unauthorized(error = 'Unauthorized'): Response {
    return this.error(error, 401)
  }

  static forbidden(error = 'Forbidden'): Response {
    return this.error(error, 403)
  }

  static notFound(error = 'Not found'): Response {
    return this.error(error, 404)
  }

  static methodNotAllowed(error = 'Method not allowed'): Response {
    return this.error(error, 405)
  }

  static conflict(error = 'Conflict'): Response {
    return this.error(error, 409)
  }

  static validationError(errors: string[]): Response {
    return this.error('Validation failed', 422, errors)
  }

  static internalError(error = 'Internal server error'): Response {
    return this.error(error, 500)
  }

  static setCookies(response: Response, cookies: Array<{ name: string; value: string; options: CookieOptions }>): Response {
    const newHeaders = new Headers(response.headers)
    
    cookies.forEach(({ name, value, options }) => {
      const cookieString = this.formatCookie(name, value, options)
      newHeaders.append('Set-Cookie', cookieString)
    })
    
    return new Response(response.body, {
      status: response.status,
      headers: newHeaders
    })
  }

  static clearCookies(response: Response, cookieNames: string[]): Response {
    const newHeaders = new Headers(response.headers)
    
    cookieNames.forEach(name => {
      const cookieString = this.formatCookie(name, '', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 0,
        path: '/'
      })
      newHeaders.append('Set-Cookie', cookieString)
    })
    
    return new Response(response.body, {
      status: response.status,
      headers: newHeaders
    })
  }

  private static formatCookie(name: string, value: string, options: CookieOptions): string {
    let cookie = `${name}=${value}`
    
    if (options.maxAge !== undefined) {
      cookie += `; Max-Age=${options.maxAge}`
    }
    
    if (options.path) {
      cookie += `; Path=${options.path}`
    }
    
    if (options.secure) {
      cookie += '; Secure'
    }
    
    if (options.httpOnly) {
      cookie += '; HttpOnly'
    }
    
    if (options.sameSite) {
      cookie += `; SameSite=${options.sameSite}`
    }
    
    return cookie
  }

  static parseCookies(request: Request): Record<string, string> {
    const cookieHeader = request.headers.get('Cookie')
    
    if (!cookieHeader) {
      return {}
    }
    
    const cookies: Record<string, string> = {}
    
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=')
      if (name && value) {
        cookies[name] = decodeURIComponent(value)
      }
    })
    
    return cookies
  }
}
