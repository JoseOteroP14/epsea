/**
 * PDF generation for Visit 3 (Ley 1876) — same green style used by Visita 1 con:
 *   - 7 secciones (Acompañamiento, Datos productor, Predio, Sistema, Enfoque técnico,
 *     Clasificación con los 30 ítems y sus justificaciones, Extensionista).
 *   - Comparación de media geométrica inicial (método 3) vs. final (método 9).
 *   - Seguimiento a compromisos y evidencias fotográficas.
 */

import { Asset } from "expo-asset";
import {
  cacheDirectory,
  deleteAsync,
  downloadAsync,
  EncodingType,
  readAsStringAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import * as Print from "expo-print";
import { API_BASE_URL } from "@/utils/api-config";

// @ts-expect-error — pdfmake build files have no type declarations
import pdfMake from "pdfmake/build/pdfmake";

(globalThis as any).pdfMake = (globalThis as any).pdfMake || {};
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("pdfmake/build/vfs_fonts");
pdfMake.vfs = (globalThis as any).pdfMake.vfs;

const BASE_URL = API_BASE_URL;

// ─── Palette ────────────────────────────────────────────────────────────
const HEADER_GREEN = "#4A7A3D";
const HEADER_TEXT = "#FFFFFF";
const SECTION_GREEN = "#C6EFCE";
const LIGHT_GREEN = "#E2EFDA";

// ─── Interfaces ─────────────────────────────────────────────────────────

export interface Visit3PdfAspectRow {
  /** Número global del ítem 1–30. */
  number: number;
  /** Descripción de la pregunta. */
  description: string;
  /** Valor inicial (clasificación método 3). */
  initialValue: string;
  /** Valor final (clasificación método 9 en esta Visita 3). */
  finalValue: string;
  /** Rango o descriptor cualitativo (opcional). */
  category?: string;
}

export interface Visit3PdfAspectBlock {
  id: string;
  number: number;
  title: string;
  rows: Visit3PdfAspectRow[];
  justification: string;
  /** Media geométrica inicial de este aspecto (opcional). */
  geometricMeanInitial?: number | null;
  /** Media geométrica final de este aspecto (opcional). */
  geometricMeanFinal?: number | null;
}

export interface Visit3PdfCommitment {
  activity: string;
  percentage: string;
  appropriation: string;
}

export interface Visit3PdfData {
  // Section 1: Datos del Acompañamiento
  fechaRegistro: string;
  horaRegistro: string;
  nombrePersonaAtiende: string;
  attendanceId: number;

  // Section 2: Datos generales del productor
  nombreCompletoUsuario: string;
  tipoDocumento: string;
  numeroIdentificacion: string;
  numeroTelefonico: string;

  // Section 3: Predio
  nombreDelPredio: string;
  asnm: string;
  departamento: string;
  municipio: string;
  corregimientoVereda: string;

  // Section 4: Sistema Productivo
  lineaProductivaPrincipal: string;
  lineaProductivaSecundaria: string;
  areaTotalEnProduccion: string;

  // Section 5: Enfoque técnico productivo
  objetivoGeneral: string;
  objetivosEspecificos: string;
  recomendacionesComunidad: string;
  observaciones: string;
  commitmentsTracking: Visit3PdfCommitment[];
  photoBase64Uris: string[];

  // Section 6: Clasificación con 30 ítems y 5 aspectos
  aspects: Visit3PdfAspectBlock[];
  /** Media geométrica global inicial. */
  overallInitial?: number | null;
  /** Media geométrica global final. */
  overallFinal?: number | null;

  // Section 7: Extensionista
  nombreExtensionista: string;
  identificacionExtensionista: string;
  perfilProfesional: string;
}

// ─── Layout / helpers ───────────────────────────────────────────────────

const greenLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => HEADER_GREEN,
  vLineColor: () => HEADER_GREEN,
};

function lbl(text: string, extra?: Record<string, unknown>) {
  return {
    text,
    fontSize: 7,
    bold: true,
    fillColor: LIGHT_GREEN,
    margin: [2, 2, 2, 2],
    ...extra,
  };
}

function val(text: string, extra?: Record<string, unknown>) {
  return {
    text: text || "",
    fontSize: 7,
    margin: [2, 2, 2, 2],
    ...extra,
  };
}

function secHeader(text: string) {
  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            text,
            fontSize: 8,
            bold: true,
            fillColor: HEADER_GREEN,
            color: HEADER_TEXT,
            alignment: "center",
            margin: [0, 2, 0, 2],
          },
        ],
      ],
    },
    layout: greenLayout,
    margin: [0, 0, 0, 0],
  };
}

function subSecHeader(text: string) {
  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            text,
            fontSize: 8,
            bold: true,
            fillColor: SECTION_GREEN,
            alignment: "center",
            margin: [0, 2, 0, 2],
          },
        ],
      ],
    },
    layout: greenLayout,
    margin: [0, 0, 0, 0],
  };
}

function textArea(content: string, fixedHeight = 50) {
  return {
    table: {
      widths: ["*"],
      heights: [fixedHeight],
      body: [
        [
          {
            text: content || " ",
            fontSize: 7,
            margin: [4, 4, 4, 4],
          },
        ],
      ],
    },
    layout: greenLayout,
    margin: [0, 0, 0, 0],
  };
}

// ─── Assets & photos ────────────────────────────────────────────────────

const LOGO_LEFT_MODULE = require("@/assets/images/logo-unicordoba.jpeg");
const LOGO_RIGHT_MODULE = require("@/assets/images/logo_mini.png");

async function loadAssetBase64(module: number): Promise<string> {
  const [asset] = await Asset.loadAsync(module);
  const localUri = asset.localUri ?? asset.uri;
  const base64 = await readAsStringAsync(localUri, {
    encoding: EncodingType.Base64,
  });
  const ext = asset.type ?? "png";
  const mime = ext === "jpeg" || ext === "jpg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${base64}`;
}

export async function convertVisit3PhotosToBase64(
  localPhotos: ({ uri: string } | null)[],
  existingImages: ({ id: number } | null)[],
  token: string | null,
): Promise<string[]> {
  const results: string[] = [];
  for (let i = 0; i < 3; i++) {
    const local = localPhotos[i];
    const existing = existingImages[i];
    try {
      if (local?.uri) {
        const base64 = await readAsStringAsync(local.uri, {
          encoding: EncodingType.Base64,
        });
        results.push(`data:image/jpeg;base64,${base64}`);
      } else if (existing && token) {
        const url = `${BASE_URL}/visit-3/images/${existing.id}`;
        const tmpPath = `${cacheDirectory}pdf_visit3_${existing.id}_${Date.now()}.jpg`;
        const download = await downloadAsync(url, tmpPath, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const base64 = await readAsStringAsync(download.uri, {
          encoding: EncodingType.Base64,
        });
        results.push(`data:image/jpeg;base64,${base64}`);
        await deleteAsync(tmpPath, { idempotent: true });
      }
    } catch {
      // continue
    }
  }
  return results;
}

// ─── Header ─────────────────────────────────────────────────────────────

function buildHeader(logoLeft: string, logoRight: string) {
  return {
    table: {
      widths: [65, "*", 65],
      body: [
        [
          { image: logoLeft, width: 60, height: 40, rowSpan: 2, margin: [0, 5, 0, 5] },
          {
            text: "FORMATO ACOMPAÑAMIENTO DEL EXTENSIONISTA",
            fontSize: 11,
            bold: true,
            alignment: "center",
            margin: [0, 4, 0, 0],
          },
          { image: logoRight, width: 55, height: 40, rowSpan: 2, margin: [0, 5, 0, 5] },
        ],
        [
          {},
          {
            text: "Visita No 3",
            fontSize: 10,
            bold: true,
            alignment: "center",
            margin: [0, 0, 0, 4],
          },
          {},
        ],
      ],
    },
    layout: greenLayout,
    margin: [0, 0, 0, 0],
  };
}

// ─── Sections ───────────────────────────────────────────────────────────

function buildSection1(d: Visit3PdfData) {
  const mark = (id: number) => (d.attendanceId === id ? "X" : "");
  return [
    secHeader("1. Datos Del Acompañamiento"),
    {
      table: {
        widths: ["20%", "*", "20%", "*"],
        body: [
          [
            lbl("Fecha registro\nAcompañamiento"),
            val(d.fechaRegistro),
            lbl("Hora registro\nAcompañamiento"),
            val(d.horaRegistro),
          ],
        ],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },
    {
      table: {
        widths: ["32%", "17%", "17%", "17%", "17%"],
        body: [
          [
            lbl("Nombre Persona Quien\nAtiende El Acompañamiento"),
            lbl(`Usuario\n${mark(1)}`, { alignment: "center" }),
            lbl(`Trabajador UP\n${mark(2)}`, { alignment: "center" }),
            lbl(`Persona núcleo\nfamiliar\n${mark(3)}`, { alignment: "center" }),
            lbl(`Otro\n${mark(4)}`, { alignment: "center" }),
          ],
        ],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },
    {
      table: {
        widths: ["50%", "*"],
        body: [
          [
            lbl(
              "Solo si quien atiende la visita es diferente al usuario\ndiligencie: Trabajador UP, Persona Núcleo\nFamiliar u Otro",
            ),
            val(d.attendanceId !== 1 ? d.nombrePersonaAtiende : ""),
          ],
        ],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },
  ];
}

function buildSection2(d: Visit3PdfData) {
  return [
    secHeader("2. Datos generales del usuario productor"),
    {
      table: {
        widths: ["25%", "*"],
        body: [[lbl("Nombre Completo\nUsuario"), val(d.nombreCompletoUsuario)]],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },
    {
      table: {
        widths: ["18%", "14%", "18%", "14%", "18%", "*"],
        body: [
          [
            lbl("Tipo De Documento"),
            val(d.tipoDocumento),
            lbl("Numero De\nIdentificacion"),
            val(d.numeroIdentificacion),
            lbl("Numero\nTelefonico"),
            val(d.numeroTelefonico),
          ],
        ],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },
  ];
}

function buildSection3(d: Visit3PdfData) {
  return [
    secHeader("3. Identificación del predio"),
    {
      table: {
        widths: ["18%", "*", "12%"],
        body: [[lbl("Nombre Del Predio"), val(d.nombreDelPredio), lbl("ASNM")]],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },
    {
      table: {
        widths: ["14%", "*", "14%", "*", "20%", "*"],
        body: [
          [
            lbl("Departamento"),
            val(d.departamento),
            lbl("Municipio"),
            val(d.municipio),
            lbl("Corregimiento/Vereda"),
            val(d.corregimientoVereda),
          ],
        ],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },
  ];
}

function buildSection4(d: Visit3PdfData) {
  return [
    secHeader("4. Identificación del sistema productivo"),
    {
      table: {
        widths: ["25%", "*", "25%", "*"],
        body: [
          [
            lbl("Línea Productiva\nPrincipal"),
            val(d.lineaProductivaPrincipal),
            lbl("Línea Productiva\nSecundaria"),
            val(d.lineaProductivaSecundaria),
          ],
        ],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },
    {
      table: {
        widths: ["25%", "*"],
        body: [
          [
            lbl("Área total En Producción", { fillColor: SECTION_GREEN }),
            val(d.areaTotalEnProduccion),
          ],
        ],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },
  ];
}

function buildSection5(d: Visit3PdfData) {
  const photoUris = d.photoBase64Uris.filter(Boolean);
  const photoCount = photoUris.length;
  let photoGrid: unknown;
  if (photoCount === 0) {
    photoGrid = {
      table: {
        widths: ["*", "*", "*"],
        heights: [100],
        body: [
          [
            {
              text: "Foto 1",
              fontSize: 7,
              alignment: "center",
              color: "#999999",
              margin: [0, 40, 0, 0],
            },
            {
              text: "Foto 2",
              fontSize: 7,
              alignment: "center",
              color: "#999999",
              margin: [0, 40, 0, 0],
            },
            {
              text: "Foto 3",
              fontSize: 7,
              alignment: "center",
              color: "#999999",
              margin: [0, 40, 0, 0],
            },
          ],
        ],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    };
  } else {
    const sizing =
      photoCount === 1
        ? { w: 250, h: 180, cols: ["*"] }
        : photoCount === 2
          ? { w: 200, h: 140, cols: ["*", "*"] }
          : { w: 150, h: 110, cols: ["*", "*", "*"] };
    const cells: unknown[] = photoUris.slice(0, 3).map((uri) => ({
      image: uri,
      width: sizing.w,
      height: sizing.h,
      alignment: "center",
    }));
    while (cells.length < sizing.cols.length) cells.push({ text: "", fontSize: 1 });
    photoGrid = {
      table: { widths: sizing.cols, body: [cells] },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    };
  }

  const trackingRows = d.commitmentsTracking.map((c) => [
    val(c.activity, { fontSize: 6 }),
    val(c.percentage, { alignment: "center", fontSize: 6 }),
    val(c.appropriation, { fontSize: 6 }),
  ]);

  const trackingTable = trackingRows.length
    ? {
        table: {
          widths: ["45%", "15%", "*"],
          body: [
            [
              lbl("Actividad / recomendación", { alignment: "center" }),
              lbl("% Cumpl.", { alignment: "center" }),
              lbl("Apropiación en campo", { alignment: "center" }),
            ],
            ...trackingRows,
          ],
        },
        layout: greenLayout,
        margin: [0, 0, 0, 0],
      }
    : {
        table: {
          widths: ["*"],
          body: [
            [
              val(
                "Sin recomendaciones/compromisos registrados en Visita 2.",
                { alignment: "center", italics: true },
              ),
            ],
          ],
        },
        layout: greenLayout,
        margin: [0, 0, 0, 0],
      };

  return [
    secHeader("5. Enfoque Técnico Productivo"),
    subSecHeader("5. Objetivo General del Acompañamiento"),
    textArea(d.objetivoGeneral, 40),
    subSecHeader("5.0 Objetivos Específicos del Acompañamiento"),
    textArea(d.objetivosEspecificos, 60),
    subSecHeader("5.1 Cumplimiento de recomendaciones y compromisos"),
    trackingTable,
    subSecHeader("5.2 Recomendaciones técnicas para la comunidad productiva"),
    textArea(d.recomendacionesComunidad, 60),
    subSecHeader("5.3 Observaciones"),
    textArea(d.observaciones, 60),
    subSecHeader("5.4 Registro Fotográfico visita"),
    {
      text: "Tomar mínimo 3 fotos con su respectiva marca de agua (lugar, georreferenciación, ASNM, fecha, hora).",
      fontSize: 6,
      italics: true,
      color: "#555555",
      alignment: "center",
      margin: [0, 2, 0, 2],
    },
    photoGrid,
  ];
}

function formatGeoMean(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function buildAspectBlock(block: Visit3PdfAspectBlock) {
  const header = [
    lbl("N°", { alignment: "center" }),
    lbl("Descripción del ítem"),
    lbl("Cal. Inicial", { alignment: "center" }),
    lbl("Cal. Final", { alignment: "center" }),
    lbl("Rango", { alignment: "center" }),
  ];

  const rows = block.rows.map((row) => [
    val(String(row.number), { alignment: "center" }),
    val(row.description, { fontSize: 6 }),
    val(row.initialValue || "—", { alignment: "center" }),
    val(row.finalValue || "—", { alignment: "center" }),
    val(row.category ?? "", { alignment: "center", fontSize: 6 }),
  ]);

  return [
    subSecHeader(block.title),
    {
      table: {
        widths: ["6%", "*", "13%", "13%", "16%"],
        body: [header, ...rows],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },
    {
      table: {
        widths: ["50%", "25%", "25%"],
        body: [
          [
            lbl(`Media geométrica del aspecto ${block.number}`),
            val(`Inicial: ${formatGeoMean(block.geometricMeanInitial)}`, {
              alignment: "center",
            }),
            val(`Final: ${formatGeoMean(block.geometricMeanFinal)}`, {
              alignment: "center",
            }),
          ],
        ],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },
    {
      table: {
        widths: ["*"],
        body: [
          [
            lbl(
              `Justificación de la calificación asignada — Aspecto ${block.number}`,
            ),
          ],
        ],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },
    textArea(block.justification, 60),
  ];
}

function buildSection6(d: Visit3PdfData) {
  const aspectContent = d.aspects.flatMap(buildAspectBlock);
  return [
    secHeader("6. Clasificación Del Usuario (Según Ley 1876 Del 2017)"),
    {
      table: {
        widths: ["50%", "25%", "25%"],
        body: [
          [
            lbl("Media geométrica global (30 ítems)"),
            val(`Inicial: ${formatGeoMean(d.overallInitial)}`, {
              alignment: "center",
            }),
            val(`Final: ${formatGeoMean(d.overallFinal)}`, {
              alignment: "center",
            }),
          ],
        ],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },
    ...aspectContent,
  ];
}

function buildSection7(d: Visit3PdfData) {
  return [
    secHeader("7. Datos Del Extensionista"),
    {
      table: {
        widths: ["30%", "*"],
        body: [
          [lbl("Nombre del\nExtensionista"), val(d.nombreExtensionista)],
          [
            lbl("Identificación Del\nExtensionista"),
            val(d.identificacionExtensionista),
          ],
          [
            lbl("Perfil Profesional\nDel Extensionista"),
            val(d.perfilProfesional),
          ],
          [lbl("Firma extensionista"), { text: "", margin: [0, 15, 0, 15] }],
          [lbl("Fecha firma\nextensionista"), { text: "", margin: [0, 8, 0, 8] }],
        ],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },
  ];
}

// ─── Document build ─────────────────────────────────────────────────────

function buildDocDefinition(
  data: Visit3PdfData,
  logoLeft: string,
  logoRight: string,
) {
  return {
    pageSize: "LETTER",
    pageMargins: [30, 30, 30, 30],
    content: [
      buildHeader(logoLeft, logoRight),
      ...buildSection1(data),
      ...buildSection2(data),
      ...buildSection3(data),
      ...buildSection4(data),
      ...buildSection5(data),
      ...buildSection6(data),
      ...buildSection7(data),
    ],
  };
}

function pdfToBase64(docDef: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const pdf = pdfMake.createPdf(docDef);
      pdf.getBase64((base64: string) => resolve(base64));
    } catch (error) {
      reject(error);
    }
  });
}

export async function generateAndPrintVisit3Pdf(
  data: Visit3PdfData,
): Promise<void> {
  const [logoLeft, logoRight] = await Promise.all([
    loadAssetBase64(LOGO_LEFT_MODULE),
    loadAssetBase64(LOGO_RIGHT_MODULE),
  ]);
  const docDefinition = buildDocDefinition(data, logoLeft, logoRight);
  const base64 = await pdfToBase64(docDefinition);

  const safeName = data.nombreCompletoUsuario
    .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ0-9 ]/g, "")
    .replace(/\s+/g, "_") || "usuario";
  const fileName = `visita3_${safeName}.pdf`;
  const fileUri = `${cacheDirectory}${fileName}`;

  await writeAsStringAsync(fileUri, base64, { encoding: EncodingType.Base64 });
  await Print.printAsync({ uri: fileUri });
}

// ─── Utilities ──────────────────────────────────────────────────────────

/**
 * Media geométrica de valores numéricos ignorando entradas no positivas o vacías.
 * Devuelve `null` si no hay valores válidos.
 */
export function computeGeometricMean(values: (number | null | undefined)[]): number | null {
  const valid = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0,
  );
  if (valid.length === 0) return null;
  const sumLog = valid.reduce((acc, v) => acc + Math.log(v), 0);
  return Math.exp(sumLog / valid.length);
}
