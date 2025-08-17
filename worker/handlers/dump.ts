import type { CloudflareEnv, UserInfo } from '../types/cloudflare'
import { ResponseUtils } from '../utils/response'

export async function onRequestGet(
  request: Request,
  env: CloudflareEnv,
  userInfo: UserInfo
): Promise<Response> {
  try {
    const durableObjectId = env.MONEY_OBJECT.idFromName(userInfo.userId)
    const durableObject = env.MONEY_OBJECT.get(durableObjectId)

    // Create a streaming response
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()

    // Start streaming in the background
    ;(async () => {
      try {
        let chunkIndex = 0
        let hasMore = true
        
        while (hasMore) {
          const result = await durableObject.getDatabaseDumpChunk(chunkIndex)
          await writer.write(encoder.encode(result.chunk))
          hasMore = result.hasMore
          chunkIndex++
        }
      } catch (error) {
        console.error('Error during database dump:', error)
      } finally {
        await writer.close()
      }
    })()

    return new Response(readable, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': `attachment; filename="money-db-dump-${userInfo.userId}-${Date.now()}.ndjson"`,
        'Cache-Control': 'no-cache'
      }
    })
  } catch (error) {
    console.error('Dump error:', error)
    return ResponseUtils.internalError('Failed to dump database')
  }
}

export async function onRequestPost(
  request: Request,
  env: CloudflareEnv,
  userInfo: UserInfo
): Promise<Response> {
  try {
    // Get the durable object
    const durableObjectId = env.MONEY_OBJECT.idFromName(userInfo.userId)
    const durableObject = env.MONEY_OBJECT.get(durableObjectId)

    // Start the import session
    await durableObject.startImport()

    // Read and process the dump file in chunks
    const text = await request.text()
    const lines = text.trim().split('\n').filter(line => line.trim())
    
    // Process in chunks of 20 lines (to stay well under 32MB limit)
    // Based on the errors, we need very small chunks since each line can be quite large
    const chunkSize = 20
    for (let i = 0; i < lines.length; i += chunkSize) {
      const chunk = lines.slice(i, i + chunkSize)
      await durableObject.importDatabaseChunk(chunk)
    }

    // Finish import and get results
    const result = await durableObject.finishImport()

    return ResponseUtils.success({
      message: 'Database imported successfully',
      updatesImported: result.updatesImported,
      hasCompiledState: result.hasCompiledState
    })
  } catch (error) {
    console.error('Import error:', error)
    return ResponseUtils.internalError('Failed to import database')
  }
}
