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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    const { active } = body;

    if (typeof active !== 'boolean') {
      return ResponseUtils.validationError(['Active must be a boolean']);
    }

    const user = await StorageUtils.getUserByUsername(username, env);
    if (!user) {
      return ResponseUtils.notFound('User not found');
    }

    // Update premium with activation timestamp if activating
    const premium = {
      active,
      ...(active && { activatedAt: new Date().toISOString() }),
      // Preserve existing activatedAt if deactivating
      ...(!active && user.premium.activatedAt && { activatedAt: user.premium.activatedAt })
    };

    const success = await StorageUtils.updateUser(username, { premium }, env);

    if (!success) {
      return ResponseUtils.notFound('Failed to update user');
    }

    return ResponseUtils.success({
      message: `User ${username} premium status updated`,
      username,
      premium
    });
  } catch (error) {
    console.error('Admin update user premium error:', error);
    return ResponseUtils.internalError();
  }
}

