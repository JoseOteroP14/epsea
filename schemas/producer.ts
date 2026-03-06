import { z } from "zod";

// Objetos anidados que vienen de la API
const SexSchema = z
  .object({
    id: z.number(),
    name: z.string(),
  })
  .nullable()
  .optional();

const MunicipalitySchema = z
  .object({
    code: z.string(),
    name: z.string(),
    department_code: z.string(),
    department_name: z.string(),
  })
  .nullable()
  .optional();

const DocumentTypeSchema = z
  .object({
    id: z.number(),
    name: z.string(),
  })
  .nullable()
  .optional();

const LevelOfEducationSchema = z
  .object({
    id: z.number(),
    name: z.string(),
  })
  .nullable()
  .optional();

const EthnicGroupSchema = z
  .object({
    id: z.number(),
    name: z.string(),
  })
  .nullable()
  .optional();

const DisabilitySchema = z
  .object({
    id: z.number(),
    name: z.string(),
  })
  .nullable()
  .optional();

// Schema básico para listados de productores asignados
export const ProducerSchema = z
  .object({
    id: z.number().optional(),
    producer_id: z.number().optional(),
    identification: z.string(),
    first_name: z.string(),
    middle_name: z.string().optional().nullable(),
    first_surname: z.string(),
    last_surname: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    project_name: z.string().optional().nullable(),
  })
  .passthrough();

// Schema detallado para GET /producers/:id
export const ProducerDetailSchema = z
  .object({
    id: z.number(),
    identification: z.string(),
    first_name: z.string(),
    middle_name: z.string().optional().nullable(),
    first_surname: z.string(),
    last_surname: z.string().optional().nullable(),
    birthdate: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().optional().nullable(),

    // IDs de relaciones
    sex_id: z.number().optional().nullable(),
    municipality_code: z.string().optional().nullable(),
    document_type_id: z.number().optional().nullable(),
    disability_id: z.number().optional().nullable(),
    level_of_education_id: z.number().optional().nullable(),
    ethnic_group_id: z.number().optional().nullable(),

    // Objetos anidados
    sex: SexSchema,
    municipality: MunicipalitySchema,
    document_type: DocumentTypeSchema,
    disability: DisabilitySchema,
    level_of_education: LevelOfEducationSchema,
    ethnic_group: EthnicGroupSchema,

    created_at: z.string().optional().nullable(),
  })
  .passthrough();

export type Producer = z.infer<typeof ProducerSchema>;
export type ProducerDetail = z.infer<typeof ProducerDetailSchema>;
