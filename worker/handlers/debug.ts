import type { CloudflareEnv, UserInfo } from '../types/cloudflare'
import { ResponseUtils } from '../utils/response'

export async function onRequestGet(
  request: Request,
  env: CloudflareEnv,
  userInfo: UserInfo
): Promise<Response> {
  try {
    // Get the durable object for this user
    const durableObjectId = env.MONEY_OBJECT.idFromName(userInfo.userId)
    const durableObject = env.MONEY_OBJECT.get(durableObjectId)

    // Get storage sizes and statistics from the durable object
    const storageSizes = await durableObject.getStorageSizes()
    const updateStatistics = await durableObject.getUpdateStatistics()

    return ResponseUtils.success({
      durableObject: {
        userId: userInfo.userId,
        storageSizes: {
          updatesTableBytes: storageSizes.updatesTableBytes,
          compiledStateBytes: storageSizes.compiledStateBytes,
          totalBytes: storageSizes.updatesTableBytes + storageSizes.compiledStateBytes
        },
        updateStatistics: {
          count: updateStatistics.count,
          totalBytes: updateStatistics.totalBytes,
          minSize: updateStatistics.minSize,
          maxSize: updateStatistics.maxSize,
          avgSize: updateStatistics.avgSize,
          medianSize: updateStatistics.medianSize,
          distribution: updateStatistics.distribution
        }
      }
    })
  } catch (error) {
    console.error('Debug endpoint error:', error)
    return ResponseUtils.internalError('Failed to get debug information')
  }
}

