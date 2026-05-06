// Backward compat alias for repository
export type LineAnswers = Record<string, string>;

export type ActivityType =
  | "agricola"
  | "pecuaria"
  | "forestal"
  | "pesca"
  | "acuicola";

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  agricola: "Agrícola",
  pecuaria: "Pecuaria",
  forestal: "Forestal",
  pesca: "Pesca",
  acuicola: "Acuícola",
};

export const ACTIVITY_TYPES: ActivityType[] = [
  "agricola",
  "pecuaria",
  "forestal",
  "pesca",
  "acuicola",
];

export const ACTIVITY_IDS: Record<ActivityType, number> = {
  agricola: 1,
  pecuaria: 2,
  forestal: 3,
  pesca: 4,
  acuicola: 5,
};

export const SPECIES_ACTIVITY_ID = 5;

export interface ProductiveLine {
  id: number;
  activity_id: number;
  name: string;
}

export interface AssistantItem {
  id: number;
  name: string;
}

export interface UnitOfMeasureItem {
  id: number;
  line_id: number;
  unit_id: number;
  type_field_id: number;
  unit_of_measure_name: string;
  line_name: string;
}

export interface UnitConfig {
  mode: "fixed" | "select";
  value?: string;
  options?: string[];
}

// Livestock unit mapping from Pecuaria.json
export const LIVESTOCK_UNIT_MAP: Record<string, UnitConfig> = {
  "Bovino - Leche": { mode: "fixed", value: "Litros / día" },
  "Bovino - Carne": { mode: "fixed", value: "Kilogramos en pie al sacrificio" },
  "Bovino - Carne y leche (doble propósito)": {
    mode: "select",
    options: [
      "Litros / día",
      "Kilogramos en pie al destete",
      "Kilogramos en pie al sacrificio",
    ],
  },
  "Búfalo - Carne": { mode: "fixed", value: "Kilogramos en pie al sacrificio" },
  "Búfalo - Leche": { mode: "fixed", value: "Litros / día" },
  "Avícola - Gallina Ponedora - Levante": {
    mode: "fixed",
    value: "Número de aves",
  },
  "Avícola - Gallina Ponedora - Ponedora": {
    mode: "fixed",
    value: "Huevos / día (Promedio)",
  },
  "Avícola - Pollo engorde": {
    mode: "select",
    options: ["Kilogramos de carne", "Número de aves"],
  },
  "Avícola - Aves de Traspatio - Pato": {
    mode: "fixed",
    value: "Número de aves",
  },
  "Avícola - Aves de Traspatio - Ganzo": {
    mode: "fixed",
    value: "Número de aves",
  },
  "Avícola - Aves de Traspatio - Pavos": {
    mode: "fixed",
    value: "Número de aves",
  },
  "Avícola - Aves de Traspatio - Codornices": {
    mode: "fixed",
    value: "Kilogramos de carne",
  },
  "Avícola - Aves de Traspatio - Gallinas de Campo": {
    mode: "select",
    options: ["Número de aves", "Huevos / día (Promedio)"],
  },
  "Apicultura - Miel": {
    mode: "select",
    options: ["Kilogramo", "Número de colmenas"],
  },
  "Apicultura - Polen": {
    mode: "select",
    options: ["Kilogramo", "Número de colmenas"],
  },
  "Apicultura - Cera": {
    mode: "select",
    options: ["Kilogramo", "Número de colmenas"],
  },
  "Conejos - Carne": { mode: "fixed", value: "Kilogramo" },
  "Conejos - Piel": { mode: "fixed", value: "Número de pieles" },
  "Cuy - Carne": { mode: "fixed", value: "Kilogramo" },
  "Ovino - Leche": { mode: "fixed", value: "Litros / día" },
  "Ovino - Lana": { mode: "fixed", value: "Kilogramos promedio por animal" },
  "Ovino - Carne y lana (doble propósito)": {
    mode: "select",
    options: [
      "Kilogramos en pie al sacrificio",
      "Kilogramos promedio por animal",
    ],
  },
  "Caprino - Leche": { mode: "fixed", value: "Litros / día" },
  "Caprino - Carne": {
    mode: "fixed",
    value: "Kilogramos en pie al sacrificio",
  },
  "Caprino - Carne y lana (doble propósito)": {
    mode: "select",
    options: ["Litros / día", "Kilogramos en pie al sacrificio"],
  },
  "Mulares/Asnales/Equinos - Carne": {
    mode: "fixed",
    value: "Kilogramos en pie al sacrificio",
  },
  "Mulares/Asnales/Equinos - Trabajo": {
    mode: "fixed",
    value: "Número de animales",
  },
  "Mulares/Asnales/Equinos - Exposición": {
    mode: "fixed",
    value: "Andares (animales de exposición)",
  },
  "Zoocría - Babillas": {
    mode: "select",
    options: ["Kilogramos carne", "Kilogramos piel"],
  },
  "Zoocría - Ofidios": { mode: "fixed", value: "Número de animales" },
  "Avestruces - Exhibición": {
    mode: "select",
    options: [
      "Número de animales",
      "Kilogramos en pie al sacrificio",
      "Huevos / año",
    ],
  },
  "Chigüiros - Carne": {
    mode: "select",
    options: ["Kilogramos en pie al sacrificio", "Número de animales"],
  },
  "Lapa - Carne": {
    mode: "select",
    options: ["Kilogramos en pie al sacrificio", "Número de animales"],
  },
  "Mariposas - Mariposario": { mode: "fixed", value: "Número de insectos" },
};

// Unit name → API ID mapping
export const UNIT_NAME_TO_ID: Record<string, number> = {
  "Litros / día": 1,
  "Kilogramos en pie al sacrificio": 2,
  "Kilogramos en pie al destete": 3,
  "Número de aves": 4,
  "Huevos / día (Promedio)": 5,
  "Kilogramos de carne": 6,
  "Número de colmenas": 7,
  Kilogramo: 8,
  "Número de pieles": 9,
  "Kilogramos promedio por animal": 10,
  "Número de animales": 11,
  "Andares (animales de exposición)": 12,
  "Kilogramos carne": 13,
  "Kilogramos piel": 14,
  "Huevos / año": 15,
  "Número de insectos": 16,
};

export const UNIT_ID_TO_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(UNIT_NAME_TO_ID).map(([name, id]) => [id, name]),
);

// ── Form data types ────────────────────────────────────────────────────────────

export interface AgriculturalLineForm {
  line_id: number | null;
  line_name: string;
  area: string;
  harvests: string;
  production: string;
  date: string;
}

export interface LivestockLineForm {
  line_id: number | null;
  line_name: string;
  unit_of_measure: string;
  area: string;
  cycles: string;
  production: string;
  date: string;
}

export interface ForestLineForm {
  line_id: number | null;
  line_name: string;
  unit_of_measure_id: string;
  unit_of_measure_name: string;
  area: string;
  cycles: string;
  production: string;
  date: string;
}

export interface FishingLineForm {
  type_id: string;
  type_name: string;
  fishing_area_id: string;
  fishing_area_name: string;
  species: { line_id: number; name: string }[];
  weight: string;
  date: string;
}

export interface AquacultureLineForm {
  type_id: string;
  type_name: string;
  area_crop_id: string;
  area_crop_name: string;
  area_value_crop: string;
  number_of_animals: string;
  cycles: string;
  production: string;
  date: string;
  species: { line_id: number; name: string }[];
}

// ── Factory functions ──────────────────────────────────────────────────────────

export function createEmptyAgriculturalForm(): AgriculturalLineForm {
  return {
    line_id: null,
    line_name: "",
    area: "",
    harvests: "",
    production: "",
    date: "",
  };
}

export function createEmptyLivestockForm(): LivestockLineForm {
  return {
    line_id: null,
    line_name: "",
    unit_of_measure: "",
    area: "",
    cycles: "",
    production: "",
    date: "",
  };
}

export function createEmptyForestForm(): ForestLineForm {
  return {
    line_id: null,
    line_name: "",
    unit_of_measure_id: "",
    unit_of_measure_name: "",
    area: "",
    cycles: "",
    production: "",
    date: "",
  };
}

export function createEmptyFishingForm(): FishingLineForm {
  return {
    type_id: "",
    type_name: "",
    fishing_area_id: "",
    fishing_area_name: "",
    species: [],
    weight: "",
    date: "",
  };
}

export function createEmptyAquacultureForm(): AquacultureLineForm {
  return {
    type_id: "",
    type_name: "",
    area_crop_id: "",
    area_crop_name: "",
    area_value_crop: "",
    number_of_animals: "",
    cycles: "",
    production: "",
    date: "",
    species: [],
  };
}

// ── Existing line types from GET endpoints ────────────────────────────────────

export interface ExistingAgriculturalLine {
  id: number;
  producer_id: number;
  project_id: number;
  line_id: number;
  line?: { id: number; name: string };
  area: number;
  harvests: number;
  production: number;
  date: string;
}

export interface ExistingLivestockLine {
  id: number;
  producer_id: number;
  project_id: number;
  line_id: number;
  line?: { id: number; name: string };
  unit_of_measure_id: number;
  area: number;
  cycles: number;
  production: number;
  date: string;
}

export interface ExistingForestLine {
  id: number;
  producer_id: number;
  project_id: number;
  line_id: number;
  line?: { id: number; name: string };
  unit_of_measure_id: number;
  area: number;
  cycles: number;
  production: number;
  date: string;
}

export interface ExistingFishingLine {
  id: number;
  producer_id: number;
  project_id: number;
  type_id: number;
  fishing_area_id?: number;
  type_name?: string;
  fishing_area_name?: string;
  weight: number;
  date: string;
  lines?: { line_id: number }[];
}

export interface ExistingAquacultureLine {
  id: number;
  producer_id: number;
  project_id: number;
  type_id: number;
  area_crop_id: number;
  area_value_crop?: number;
  type_system_name?: string;
  area_crop_name?: string;
  number_of_animals: number;
  cycles: number;
  production: number;
  date: string;
  lines?: { line_id: number }[];
}
