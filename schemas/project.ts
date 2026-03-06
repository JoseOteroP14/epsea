import { z } from "zod";

export const ProjectSchema = z.object({
    id: z.number(),
    name: z.string(),
    description: z.string().optional().nullable(),
    type_id: z.number().optional().nullable(),
    role_name: z.string().optional().nullable(),
}).passthrough();

export type Project = z.infer<typeof ProjectSchema>;
