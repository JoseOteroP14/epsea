import { z } from "zod";

// Schema para componentes de encuesta (GET /components)
export const SurveyComponentSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable().optional(),
});

export type SurveyComponent = z.infer<typeof SurveyComponentSchema>;

// Tipos de pregunta
export const QuestionTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export type QuestionType = z.infer<typeof QuestionTypeSchema>;

// Schema base de pregunta (GET /questions)
export const QuestionSchema = z
  .object({
    id: z.number(),
    name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    component_id: z.number(),
    question_type_id: z.number(),
    is_required: z.boolean().optional(),
    required: z.boolean().optional(),
    multiple: z.boolean().optional(),
    order: z.number().optional(),
    question_parent_id: z.number().nullable().optional(),
  })
  .passthrough();

export type Question = z.infer<typeof QuestionSchema>;

// Schemas detallados por tipo de pregunta
export const QuestionTextDetailSchema = z
  .object({
    id: z.number(),
    question_id: z.number(),
    max_length: z.number().nullable().optional(),
    placeholder: z.string().nullable().optional(),
  })
  .passthrough();

export const QuestionDateDetailSchema = z
  .object({
    id: z.number(),
    question_id: z.number(),
    min_date: z.string().nullable().optional(),
    max_date: z.string().nullable().optional(),
  })
  .passthrough();

export const QuestionBoolDetailSchema = z
  .object({
    id: z.number(),
    question_id: z.number(),
    true_label: z.string().nullable().optional(),
    false_label: z.string().nullable().optional(),
  })
  .passthrough();

export const QuestionNumericDetailSchema = z
  .object({
    id: z.number(),
    question_id: z.number(),
    min_value: z.number().nullable().optional(),
    max_value: z.number().nullable().optional(),
    decimal_places: z.number().nullable().optional(),
  })
  .passthrough();

export const QuestionListOptionSchema = z.object({
  id: z.number(),
  name: z.string(),
  value: z.union([z.string(), z.number()]).optional(),
});

export const QuestionListDetailSchema = z
  .object({
    id: z.number(),
    question_id: z.number(),
    options: z.array(QuestionListOptionSchema).optional(),
  })
  .passthrough();

// Dependent list option — includes optional reference to another question
export const QuestionDependentListOptionSchema = z.object({
  id: z.number(),
  name: z.string(),
  value: z.union([z.string(), z.number()]).optional(),
  other_question_id: z.number().nullable().optional(),
});

export const QuestionDependentListDetailSchema = z
  .object({
    id: z.number(),
    question_id: z.number(),
    items: z.array(QuestionDependentListOptionSchema).optional(),
    options: z.array(QuestionDependentListOptionSchema).optional(),
  })
  .passthrough();

// Department (GET /assistants/departments)
export const DepartmentSchema = z.object({
  department_cod: z.string(),
  department: z.string(),
});

// Municipality (GET /assistants/municipalities/:department_cod)
export const MunicipalitySchema = z.object({
  municipality_code: z.string(),
  municipality: z.string(),
  department_cod: z.string(),
  department: z.string(),
});

export type QuestionTextDetail = z.infer<typeof QuestionTextDetailSchema>;
export type QuestionDateDetail = z.infer<typeof QuestionDateDetailSchema>;
export type QuestionBoolDetail = z.infer<typeof QuestionBoolDetailSchema>;
export type QuestionNumericDetail = z.infer<typeof QuestionNumericDetailSchema>;
export type QuestionListDetail = z.infer<typeof QuestionListDetailSchema>;
export type QuestionListOption = z.infer<typeof QuestionListOptionSchema>;
export type QuestionDependentListDetail = z.infer<typeof QuestionDependentListDetailSchema>;
export type QuestionDependentListOption = z.infer<typeof QuestionDependentListOptionSchema>;
export type Department = z.infer<typeof DepartmentSchema>;
export type Municipality = z.infer<typeof MunicipalitySchema>;

// Survey result item from GET /surveys/:project_id/producer/:producer_id/intervention_method/:intervention_method_id
export const SurveyResultItemSchema = z
  .object({
    survey_id: z.number(),
    created_at: z.string(),
    updated_at: z.string(),
    intervention_method_id: z.number(),
    intervention_method_name: z.string(),
    answer_id: z.number(),
    answer_value: z.string(),
    question_id: z.number(),
    question_description: z.string().nullable().optional(),
    question_type_id: z.number(),
    question_parent_id: z.number().nullable().optional(),
    answer: z
      .object({
        id: z.number(),
        question_id: z.number(),
        name: z.string(),
        value: z.string(),
        other_question_id: z.number().nullable().optional(),
      })
      .optional(),
  })
  .passthrough();

export type SurveyResultItem = z.infer<typeof SurveyResultItemSchema>;

// Innova fields (GET /assistants/innova-fields)
export const InnovaFieldSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    field_type: z.string().optional(),
  })
  .passthrough();

export type InnovaField = z.infer<typeof InnovaFieldSchema>;
