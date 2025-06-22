import { Router } from 'itty-router'
import type { CloudflareEnv } from '../types/cloudflare'
import type { AuthenticatedRequest } from '../middleware'
import { withSecurity, withAuth, withHeaders } from '../middleware'
import * as signin from '../handlers/signin'
import * as signup from '../handlers/signup'
import * as signout from '../handlers/signout'
import * as refresh from '../handlers/refresh'
import * as me from '../handlers/me'
import * as sync from '../handlers/sync'
import { ResponseUtils } from '../utils/response'

export function createAPIRouter() {
  const router = Router()

  // Apply security middleware to all API routes
  router.all('/api/*', withSecurity)

  // Apply auth middleware to all API routes (it will skip public routes internally)
  router.all('/api/*', withAuth)

  // Public routes
  router.post('/api/v1/signin', async (request: AuthenticatedRequest, env: CloudflareEnv) => {
    const response = await signin.onRequestPost(request as unknown as Request, env)
    return withHeaders(response, request)
  })

  router.post('/api/v1/signup', async (request: AuthenticatedRequest, env: CloudflareEnv) => {
    const response = await signup.onRequestPost(request as unknown as Request, env)
    return withHeaders(response, request)
  })

  router.post('/api/v1/refresh', async (request: AuthenticatedRequest, env: CloudflareEnv) => {
    const response = await refresh.onRequestPost(request as unknown as Request, env)
    return withHeaders(response, request)
  })

  // Protected routes
  router.post('/api/v1/signout', async (request: AuthenticatedRequest, env: CloudflareEnv) => {
    const response = await signout.onRequestPost(request as unknown as Request, env, request.user!)
    return withHeaders(response, request)
  })

  router.get('/api/v1/me', async (request: AuthenticatedRequest, env: CloudflareEnv) => {
    const response = await me.onRequestGet(request as unknown as Request, env, request.user!)
    return withHeaders(response, request)
  })

  router.put('/api/v1/me', async (request: AuthenticatedRequest, env: CloudflareEnv) => {
    const response = await me.onRequestPut(request as unknown as Request, env, request.user!)
    return withHeaders(response, request)
  })

  router.get('/api/v1/sync', async (request: AuthenticatedRequest, env: CloudflareEnv) => {
    const response = await sync.onRequestGet(request as unknown as Request, env, request.user!)
    return withHeaders(response, request)
  })

  router.put('/api/v1/sync', async (request: AuthenticatedRequest, env: CloudflareEnv) => {
    const response = await sync.onRequestPut(request as unknown as Request, env, request.user!)
    return withHeaders(response, request)
  })

  // 404 handler for API routes
  router.all('/api/*', () => {
    return ResponseUtils.error('API endpoint not found', 404)
  })

  return router
}
