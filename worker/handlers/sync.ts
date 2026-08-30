import type { CloudflareEnv, UserInfo } from "../types/cloudflare";
import { ResponseUtils } from "../utils/response";
import { BinaryUtils } from "../utils/binary";

interface SyncUpdate {
  update: string | Uint8Array;  // Base64 string from client, Uint8Array internally
  timestamp: number;
  deviceId: string;
}

const MAX_UPDATES_PER_PUSH = 1000;

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

    if (updates.length > MAX_UPDATES_PER_PUSH) {
      return ResponseUtils.validationError(['Too many updates in a single push']);
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
    const sinceIdRaw = url.searchParams.get('sinceId');
    const sinceRaw = url.searchParams.get('since');

    // A malformed cursor must be treated as ABSENT, never as NaN: `WHERE id > NaN`
    // silently returns nothing, which reads to the client as "fully synced".
    const sinceId = sinceIdRaw !== null && /^\d+$/.test(sinceIdRaw) ? parseInt(sinceIdRaw, 10) : undefined;
    const since = sinceId === undefined && sinceRaw !== null && /^\d+$/.test(sinceRaw) ? parseInt(sinceRaw, 10) : undefined;

    const durableObjectId = env.MONEY_OBJECT.idFromName(userInfo.userId);
    const durableObject = env.MONEY_OBJECT.get(durableObjectId);

    const { updates, latestId } = await durableObject.getUpdates({ sinceId, since });

    // Convert Uint8Array to base64 for JSON serialization
    const serializedUpdates = updates.map(update => ({
      ...update,
      update: BinaryUtils.serializeForJson(update.update)
    }));

    return ResponseUtils.success({ updates: serializedUpdates, latestId });
  } catch (error) {
    console.error('Sync GET error:', error);
    return ResponseUtils.internalError();
  }
}
