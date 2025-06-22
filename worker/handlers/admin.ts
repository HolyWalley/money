import { CloudflareEnv } from "../types/cloudflare";
import { ResponseUtils } from "../utils/response";
import { StorageUtils } from "../utils/storage";

// Development-only admin endpoints
export async function getUser(request: Request & { params?: Record<string, string> }, env: CloudflareEnv): Promise<Response> {
  try {
    const username = request.params?.username;

    if (!username) {
      return ResponseUtils.validationError(['Username is required']);
    }

    const user = await StorageUtils.getUserByUsername(username, env);

    if (!user) {
      return ResponseUtils.notFound('User not found');
    }

    // Don't return password hash
    const { passwordHash, ...userWithoutPassword } = user;

    return ResponseUtils.success(userWithoutPassword);
  } catch (error) {
    console.error('Admin get user error:', error);
    return ResponseUtils.internalError();
  }
}

export async function updateUserPremium(request: Request & { params?: Record<string, string> }, env: CloudflareEnv): Promise<Response> {
  try {
    const username = request.params?.username;

    if (!username) {
      return ResponseUtils.validationError(['Username is required']);
    }

    const body = await request.json();
    const { premium } = body;

    if (typeof premium !== 'boolean') {
      return ResponseUtils.validationError(['Premium must be a boolean']);
    }

    const success = await StorageUtils.updateUser(username, { premium }, env);

    if (!success) {
      return ResponseUtils.notFound('User not found');
    }

    return ResponseUtils.success({
      message: `User ${username} premium status updated to ${premium}`,
      username,
      premium
    });
  } catch (error) {
    console.error('Admin update user premium error:', error);
    return ResponseUtils.internalError();
  }
}

