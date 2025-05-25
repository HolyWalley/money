# Authentication System TODO

## Phase 1: Backend Foundation ✅ COMPLETE
- [x] Add JWT secrets to .dev.vars.example
- [x] Install JWT library (@tsndr/cloudflare-worker-jwt) and password hashing (PBKDF2)
- [x] Create JWT utility functions (sign, verify, refresh)
- [x] Create password hashing utilities (PBKDF2 with Web Crypto API)
- [x] Create KV storage utilities for user data
- [x] Create TypeScript types for Cloudflare context
- [x] Create response utilities with proper error handling

## Phase 2: API Endpoints ✅ COMPLETE
- [x] Implement /api/v1/signup endpoint
  - [x] Validate username/password with comprehensive rules
  - [x] Check if user exists
  - [x] Hash password and store in KV
  - [x] Generate JWT tokens (access + refresh)
  - [x] Set secure HTTP-only cookies
- [x] Implement /api/v1/signin endpoint
  - [x] Validate credentials
  - [x] Generate JWT tokens
  - [x] Set secure HTTP-only cookies
- [x] Implement /api/v1/me endpoint
  - [x] Read and validate JWT from cookies
  - [x] Return user data from token payload
- [x] Implement /api/v1/refresh endpoint
  - [x] Validate refresh token
  - [x] Issue new access token
- [x] Implement /api/v1/signout endpoint
  - [x] Clear cookies

## Phase 3: Middleware Protection ✅ COMPLETE
- [x] Create /api/_middleware.ts
  - [x] JWT validation for protected routes
  - [x] Skip validation for public routes (signup, signin, refresh)
  - [x] Return 401 for invalid/missing tokens
  - [x] Add user context to requests

## Phase 4: Frontend Components
- [ ] Create auth context/provider
- [ ] Create SignUp form component
- [ ] Create SignIn form component
- [ ] Create auth layout/routing
- [ ] Add form validation with Zod schemas
- [ ] Handle auth state management

## Phase 5: Testing
- [ ] Unit tests for JWT utilities
- [ ] Unit tests for password utilities
- [ ] Integration tests for auth endpoints
- [ ] Frontend component tests
- [ ] E2E authentication flow tests

## Phase 6: Security & Best Practices
- [ ] Implement rate limiting for auth endpoints
- [ ] Add CSRF protection
- [ ] Secure cookie configuration
- [ ] Input sanitization
- [ ] Error handling without information leakage

## Technical Requirements
- JWT with access token (15min) + refresh token (7 days)
- HTTP-only, secure, SameSite cookies
- Password hashing with bcrypt/argon2
- Username-based KV storage
- Comprehensive error handling
- Type-safe API responses