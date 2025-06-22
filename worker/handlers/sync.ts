import { CloudflareEnv, UserInfo } from "../types/cloudflare";
import { ResponseUtils } from "../utils/response";
import { BinaryUtils } from "../utils/binary";

interface SyncUpdate {
  update: number[] | Uint8Array;  // Can receive as array from client
  timestamp: number;
  deviceId: string;
}

export async function onRequestPut(
  request: Request,
  env: CloudflareEnv,
  userInfo: UserInfo
): Promise<Response> {
  try {
    const updates: SyncUpdate[] = await request.json();
    console.debug(`[SyncHandler] PUT: Received ${updates.length} updates for user ${userInfo.username}`);

    if (!Array.isArray(updates)) {
      return ResponseUtils.validationError(['Invalid request body: expected array of updates']);
    }

    const durableObjectId = env.MONEY_OBJECT.idFromName(userInfo.userId);
    const durableObject = env.MONEY_OBJECT.get(durableObjectId);

    // Convert arrays back to Uint8Array before storing
    const processedUpdates = updates.map((update, index) => {
      console.debug(`[SyncHandler] Processing update ${index}: deviceId=${update.deviceId}, updateType=${Array.isArray(update.update) ? 'Array' : update.update.constructor.name}, length=${Array.isArray(update.update) ? update.update.length : (update.update as Uint8Array).length}`);

      try {
        const converted = BinaryUtils.deserializeFromJson(update.update);
        console.debug(`[SyncHandler] Converted update ${index} to Uint8Array, length=${converted.length}`);
        return {
          ...update,
          update: converted
        };
      } catch (error) {
        console.error(`[SyncHandler] Error converting update ${index}:`, error);
        throw error;
      }
    });

    console.debug(`[SyncHandler] Sending ${processedUpdates.length} processed updates to Durable Object`);
    await durableObject.pushUpdates(processedUpdates);

    return ResponseUtils.success({ message: 'Updates pushed successfully' });
  } catch (error) {
    console.error('[SyncHandler] Sync PUT error:', error);
    return ResponseUtils.internalError();
  }
}

export async function onRequestGet(
  request: Request,
  env: CloudflareEnv,
  userInfo: UserInfo
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const since = url.searchParams.get('since');

    const durableObjectId = env.MONEY_OBJECT.idFromName(userInfo.userId);
    const durableObject = env.MONEY_OBJECT.get(durableObjectId);

    const updates = await durableObject.getUpdates(since ? parseInt(since) : undefined);

    // Convert Uint8Array to regular Array for JSON serialization
    const serializedUpdates = updates.map(update => ({
      ...update,
      update: BinaryUtils.serializeForJson(update.update)
    }));

    return ResponseUtils.success({ updates: serializedUpdates });
  } catch (error) {
    console.error('Sync GET error:', error);
    return ResponseUtils.internalError();
  }
}
