import { z } from 'zod'

export const categoryTypeSchema = z.enum(['income', 'expense', 'transfer'])

export const categoryColorSchema = z.enum([
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'gray'
])

export const categorySchema = z.object({
  _id: z.string(),
  name: z.string().min(1).max(50),
  type: categoryTypeSchema,
  icon: z.string(),
  color: categoryColorSchema,
  isDefault: z.boolean(),
  order: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
})

export type CategoryType = z.infer<typeof categoryTypeSchema>
export type CategoryColor = z.infer<typeof categoryColorSchema>
export type Category = z.infer<typeof categorySchema>
