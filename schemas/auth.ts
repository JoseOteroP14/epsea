import { z } from "zod";

export const RoleSchema = z.object({
    id: z.number(),
    role_id: z.number(),
    user_id: z.number(),
    project_id: z.number().nullable(),
});

export const UserSchema = z.object({
    user_id: z.number(),
    username: z.string(),
    roles: z.array(RoleSchema),
});

export const AuthResponseSchema = z.object({
    access_token: z.string(),
    token_type: z.string(),
    user: UserSchema,
});

export type Role = z.infer<typeof RoleSchema>;
export type User = z.infer<typeof UserSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// Role constants for easier usage in the app
export const USER_ROLES = {
    ADMIN: 1,
    EXTENSIONIST: 2,
    COORDINATOR: 3,
} as const;
