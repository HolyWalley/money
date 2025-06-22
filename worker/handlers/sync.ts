import { CloudflareEnv, UserInfo } from "../types/cloudflare";
import { ResponseUtils } from "../utils/response";

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

    if (!Array.isArray(updates)) {
      return ResponseUtils.validationError(['Invalid request body: expected array of updates']);
    }

    const durableObjectId = env.MONEY_OBJECT.idFromName(userInfo.userId);
    const durableObject = env.MONEY_OBJECT.get(durableObjectId);

    // Convert arrays back to Uint8Array before storing
    const processedUpdates = updates.map(update => ({
      ...update,
      update: Array.isArray(update.update) ? new Uint8Array(update.update) : update.update
    }));

    await durableObject.pushUpdates(processedUpdates);

    return ResponseUtils.success({ message: 'Updates pushed successfully' });
  } catch (error) {
    console.error('Sync PUT error:', error);
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
    const serializedUpdates = updates.map(update => {
      let updateArray;
      if (update.update instanceof Uint8Array) {
        updateArray = Array.from(update.update);
      } else if (update.update instanceof ArrayBuffer) {
        updateArray = Array.from(new Uint8Array(update.update));
      } else {
        updateArray = update.update;
      }

      return {
        ...update,
        update: updateArray
      };
    });

    return ResponseUtils.success({ updates: serializedUpdates });
  } catch (error) {
    console.error('Sync GET error:', error);
    return ResponseUtils.internalError();
  }
}
