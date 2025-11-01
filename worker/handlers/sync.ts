import { CloudflareEnv, UserInfo } from "../types/cloudflare";
import { ResponseUtils } from "../utils/response";
import { BinaryUtils } from "../utils/binary";

interface SyncUpdate {
  update: string | Uint8Array;  // Base64 string from client, Uint8Array internally
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

    if (!Array.isArray(updates)) {
      return ResponseUtils.validationError(['Invalid request body: expected array of updates']);
    }

    const durableObjectId = env.MONEY_OBJECT.idFromName(userInfo.userId);
    const durableObject = env.MONEY_OBJECT.get(durableObjectId);

    // Convert base64 strings to Uint8Array before storing
    const processedUpdates = updates.map(update => ({
      ...update,
      update: BinaryUtils.deserializeFromJson(update.update)
    }));

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

    // Convert Uint8Array to base64 for JSON serialization
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
