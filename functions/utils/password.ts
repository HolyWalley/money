export class PasswordUtils {
  private static readonly ITERATIONS = 100000
  private static readonly SALT_LENGTH = 32
  private static readonly KEY_LENGTH = 64

  static async hashPassword(password: string): Promise<string> {
    // Generate random salt
    const salt = crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH))
    
    // Convert password to ArrayBuffer
    const passwordBuffer = new TextEncoder().encode(password)
    
    // Import password as key
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    )
    
    // Derive key using PBKDF2
    const derivedKey = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: this.ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      this.KEY_LENGTH * 8 // bits
    )
    
    // Combine salt and hash for storage
    const hashArray = new Uint8Array(derivedKey)
    const combined = new Uint8Array(this.SALT_LENGTH + this.KEY_LENGTH)
    combined.set(salt)
    combined.set(hashArray, this.SALT_LENGTH)
    
    // Convert to base64 for storage
    return btoa(String.fromCharCode(...combined))
  }

  static async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    try {
      // Decode base64 hash
      const combined = new Uint8Array(
        atob(hashedPassword)
          .split('')
          .map(char => char.charCodeAt(0))
      )
      
      // Extract salt and hash
      const salt = combined.slice(0, this.SALT_LENGTH)
      const storedHash = combined.slice(this.SALT_LENGTH)
      
      // Convert password to ArrayBuffer
      const passwordBuffer = new TextEncoder().encode(password)
      
      // Import password as key
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      )
      
      // Derive key using same parameters
      const derivedKey = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: this.ITERATIONS,
          hash: 'SHA-256'
        },
        keyMaterial,
        this.KEY_LENGTH * 8 // bits
      )
      
      // Compare hashes in constant time
      const derivedArray = new Uint8Array(derivedKey)
      
      if (derivedArray.length !== storedHash.length) {
        return false
      }
      
      let result = 0
      for (let i = 0; i < derivedArray.length; i++) {
        result |= derivedArray[i] ^ storedHash[i]
      }
      
      return result === 0
    } catch {
      return false
    }
  }

  static validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    
    if (!password) {
      errors.push('Password is required')
      return { valid: false, errors }
    }
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long')
    }
    
    if (password.length > 128) {
      errors.push('Password must be less than 128 characters long')
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter')
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter')
    }
    
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number')
    }
    
    return { valid: errors.length === 0, errors }
  }

  static validateUsername(username: string): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    
    if (!username) {
      errors.push('Username is required')
      return { valid: false, errors }
    }
    
    if (username.length < 3) {
      errors.push('Username must be at least 3 characters long')
    }
    
    if (username.length > 30) {
      errors.push('Username must be less than 30 characters long')
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      errors.push('Username can only contain letters, numbers, hyphens, and underscores')
    }
    
    return { valid: errors.length === 0, errors }
  }
}