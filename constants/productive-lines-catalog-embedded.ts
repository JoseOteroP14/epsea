/**
 * Semilla embebida en la app (catálogos que no forman parte de la descarga de sincronización).
 * Los arrays vacíos indican “sin datos embebidos”; en runtime se rellenan desde SQLite
 * tras `refreshProductiveLinesStaticCatalog()` (p. ej. al iniciar sesión con red).
 * Si el backend publica un snapshot estable, se puede sustituir este objeto sin tocar el flujo de sync.
 */
export const EMBEDDED_PRODUCTIVE_LINES_CATALOG = {
  typesOfFishing: [] as { id: number; name: string }[],
  fishingAreas: [] as { id: number; name: string }[],
  aquacultureTypes: [] as { id: number; name: string }[],
  croppingSystemAreas: [] as { id: number; name: string }[],
  speciesLines: [] as { id: number; activity_id: number; name: string }[],
  linesByActivityId: {
    1: [] as { id: number; activity_id: number; name: string }[],
    2: [] as { id: number; activity_id: number; name: string }[],
    3: [] as { id: number; activity_id: number; name: string }[],
    4: [] as { id: number; activity_id: number; name: string }[],
    5: [] as { id: number; activity_id: number; name: string }[],
  },
  unitsByLineId: {} as Record<
    number,
    {
      id: number;
      line_id: number;
      unit_id: number;
      type_field_id: number;
      unit_of_measure_name: string;
      line_name: string;
    }[]
  >,
};
