import { z } from 'zod';
import { UserSettingsSchema } from './user_settings.schema';

export const UpdateUserSchema = z.object({
  settings: UserSettingsSchema.optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
