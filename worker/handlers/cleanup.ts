import type { CloudflareEnv, UserInfo } from '../types/cloudflare'
import { ResponseUtils } from '../utils/response'

export async function onRequestPost(
  request: Request,
  env: CloudflareEnv,
  userInfo: UserInfo
): Promise<Response> {
  try {
    // Get the durable object for this user
    const durableObjectId = env.MONEY_OBJECT.idFromName(userInfo.userId)
    const durableObject = env.MONEY_OBJECT.get(durableObjectId)

    // Cleanup old updates
    const result = await durableObject.cleanupOldUpdates()

    return ResponseUtils.success({
      message: 'Old updates cleaned up successfully',
      deletedCount: result.deletedCount,
      remainingBytes: result.remainingBytes,
      remainingKB: (result.remainingBytes / 1024).toFixed(2),
      remainingMB: (result.remainingBytes / 1024 / 1024).toFixed(2)
    })
  } catch (error) {
    console.error('Cleanup endpoint error:', error)
    return ResponseUtils.internalError('Failed to cleanup old updates')
  }
}
