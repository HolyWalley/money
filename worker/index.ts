import type { CloudflareEnv } from './types/cloudflare'
import { createAPIRouter } from './routes/api'
import { SecurityUtils } from './utils/security'
import { ResponseUtils } from './utils/response'

// Create API router
const router = createAPIRouter()

// Main fetch handler
export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    
    // Only handle API routes
    if (url.pathname.startsWith('/api/')) {
      try {
        return await router.fetch(request, env, ctx)
      } catch (error) {
        console.error('Worker error:', error)
        return SecurityUtils.addSecurityHeaders(
          ResponseUtils.internalError('Internal server error')
        )
      }
    }

    // For non-API routes, return 404 and let Cloudflare serve static assets
    return new Response('Not found', { status: 404 })
  }
}

// Export Durable Object
export { MoneyObject } from './durable-objects/MoneyObject'
