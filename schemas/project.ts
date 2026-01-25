import { z } from "zod";

export const ProjectSchema = z.object({
    id: z.number(),
    nombre: z.string().min(1, "El nombre es obligatorio"),
    id_mga: z.string().min(1, "El ID MGA es obligatorio"),
    municipios: z.string().optional().nullable(),
    id_tipo_proyecto: z.string().optional().nullable(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});

export type Project = z.infer<typeof ProjectSchema>;
