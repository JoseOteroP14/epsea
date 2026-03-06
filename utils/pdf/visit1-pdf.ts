/**
 * PDF generation for Visit 1 using pdfmake directly in React Native.
 * Replicates the exact format documented in pdfmake.json.
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

// @ts-expect-error — pdfmake build files have no type declarations
import pdfMake from "pdfmake/build/pdfmake";

// vfs_fonts.js (0.1.x) uses `this.pdfMake.vfs = {...}` which attaches fonts
// to the global object instead of module.exports. In Metro/Hermes the ESM
// default import therefore comes back empty. Work around it by ensuring
// globalThis.pdfMake exists before the require runs, then copying the VFS.
(globalThis as any).pdfMake = (globalThis as any).pdfMake || {};
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("pdfmake/build/vfs_fonts");
pdfMake.vfs = (globalThis as any).pdfMake.vfs;

// ─── Color Palette ────────────────────────────────────────────────────────

const HEADER_GREEN = "#4A7A3D";
const HEADER_TEXT = "#FFFFFF";
const SECTION_GREEN = "#C6EFCE";
const LIGHT_GREEN = "#E2EFDA";

// ─── Data Interface ───────────────────────────────────────────────────────

export interface Visit1PdfData {
  // Section 1: Productor
  nombreCompletoProductor: string;
  tipoDocumento: string;
  numeroIdentificacion: string;
  numeroTelefonico: string;
  // Section 2: Predio
  nombreDelPredio: string;
  asnm: string;
  departamento: string;
  municipio: string;
  corregimientoVereda: string;
  // Section 3: Sistema Productivo
  lineaProductivaPrincipal: string;
  lineaProductivaSecundaria: string;
  areaTotalEnProduccion: string;
  // Section 4: Clasificación
  nivelClasificacion: string;
  // Section 5: Enfoque Técnico Productivo
  objetivoAcompanamiento: string;
  diagnosticoVisita: string;
  recomendacionesCompromisos: string;
  observacionesVisita: string;
  photoBase64Uris: string[];
  // Section 6: Datos del Acompañamiento
  fechaRegistroAcompanamiento: string;
  horaRegistroAcompanamiento: string;
  nombrePersonaAtiende: string;
  attendanceId: number;
  // Section 7: Extensionista
  nombreExtensionista: string;
  identificacionExtensionista: string;
  perfilProfesional: string;
}

// ─── Green Border Layout ──────────────────────────────────────────────────

const greenLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => HEADER_GREEN,
  vLineColor: () => HEADER_GREEN,
};

// ─── Cell Factories ───────────────────────────────────────────────────────

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

// ─── Photo Conversion ─────────────────────────────────────────────────────

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

const BASE_URL = "https://playmusic.com.co/agro/api/v1";

export async function convertPhotosToBase64(
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
        const url = `${BASE_URL}/visit-1/images/${existing.id}`;
        const tmpPath = `${cacheDirectory}pdf_img_${existing.id}_${Date.now()}.jpg`;
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
      // Skip photo on conversion error
    }
  }

  return results;
}

// ─── Section Builders ─────────────────────────────────────────────────────

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
            text: "Visita No 1",
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

function buildSection1(d: Visit1PdfData) {
  return [
    secHeader("1. Identificacion Del Usuario Productor"),
    {
      table: {
        widths: ["25%", "*"],
        body: [
          [
            lbl("Nombre Completo\nUsuario Productor"),
            val(d.nombreCompletoProductor),
          ],
        ],
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

function buildSection2(d: Visit1PdfData) {
  return [
    secHeader("2. Identificación Del Predio"),
    {
      table: {
        widths: ["18%", "*", "12%"],
        body: [
          [lbl("Nombre Del Predio"), val(d.nombreDelPredio), lbl("ASNM")],
        ],
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

function buildSection3(d: Visit1PdfData) {
  return [
    secHeader("3. Identificación Del Sistema Productivo"),
    {
      table: {
        widths: ["25%", "*", "25%", "*"],
        body: [
          [
            lbl("Linea Productiva\nPrincipal"),
            val(d.lineaProductivaPrincipal),
            lbl("Linea Productiva\nSecundaria"),
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

function buildSection4(d: Visit1PdfData) {
  return [
    secHeader("4. Clasificación Del Usuario (Según Ley 1876 Del 2017)"),
    {
      table: {
        widths: ["50%", "*"],
        body: [
          [
            lbl("Nivel de clasificación\n(último diagnóstico aplicado)"),
            val(d.nivelClasificacion),
          ],
        ],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },
  ];
}

function buildSection5(d: Visit1PdfData) {
  const photoUris = d.photoBase64Uris.filter(Boolean);
  const photoCount = photoUris.length;

  // Build photo grid based on count
  let photoGrid;
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

    // Pad with empty cells if fewer photos than columns
    while (cells.length < sizing.cols.length) {
      cells.push({ text: "", fontSize: 1 });
    }

    photoGrid = {
      table: {
        widths: sizing.cols,
        body: [cells],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    };
  }

  return [
    secHeader("5. Enfoque Técnico Productivo"),

    // 5.0 — Objetivo del Acompañamiento
    {
      table: {
        widths: ["25%", "*"],
        body: [[lbl("Objetivo del\nAcompañamiento"), val("")]],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },
    textArea(d.objetivoAcompanamiento, 50),

    // 5.1 — Diagnóstico visita
    subSecHeader("5.1 Diagnostico visita"),
    textArea(d.diagnosticoVisita, 80),

    // 5.2 — Recomendaciones y Compromisos
    subSecHeader("5.2 Recomendaciones y Compromisos"),
    textArea(d.recomendacionesCompromisos, 80),

    // 5.3 — Cumplimiento recomendaciones (siempre "No aplica" en Visita 1)
    {
      table: {
        widths: ["40%", "20%", "20%", "20%"],
        body: [
          [
            lbl(
              "5.3 Se Cumplió Con Las Recomendaciones\nDe La Visita Anterior",
            ),
            lbl("SI", { alignment: "center" }),
            lbl("NO", { alignment: "center" }),
            lbl("No aplica\n   X", { alignment: "center" }),
          ],
        ],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },

    // 5.4 — Observaciones visita
    subSecHeader("5.4 Observaciones visita"),
    textArea(d.observacionesVisita, 80),

    // 5.4 — Registro Fotográfico visita
    subSecHeader("5.4 Registro Fotográfico visita"),
    {
      text: "Tomar mínimo 3 fotos con su respectiva marca de agua (lugar, georreferenciación, ASNM, fecha, hora). Foto 1 panoramica del predio y el usuario, Foto 2 donde se vea al usuario en su actividad productiva principal, Foto 3 Donde se vea al usuario junto con el extensionista.",
      fontSize: 6,
      italics: true,
      color: "#555555",
      alignment: "center",
      margin: [0, 2, 0, 2],
    },
    photoGrid,
  ];
}

function buildSection6(d: Visit1PdfData) {
  const mark = (id: number) => (d.attendanceId === id ? "X" : "");

  return [
    secHeader("6. Datos Del Acompañamiento"),
    {
      table: {
        widths: ["20%", "*", "20%", "*"],
        body: [
          [
            lbl("Fecha registro\nAcompañamiento"),
            val(d.fechaRegistroAcompanamiento),
            lbl("Hora registro\nAcompañamiento"),
            val(d.horaRegistroAcompanamiento),
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
            lbl(`Usuario\nProductor\n${mark(1)}`, { alignment: "center" }),
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
              "Solo si quien atiende la visita es diferente al productor\nUsuario diligencié: Trabajador UP, Persona Núcleo\nFamiliar, Otro",
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

function buildSection7(d: Visit1PdfData) {
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
          [
            lbl("Firma extensionista"),
            { text: "", margin: [0, 15, 0, 15] },
          ],
          [
            lbl("Fecha firma\nextensionista"),
            { text: "", margin: [0, 8, 0, 8] },
          ],
        ],
      },
      layout: greenLayout,
      margin: [0, 0, 0, 0],
    },
  ];
}

// ─── Doc Definition ───────────────────────────────────────────────────────

function buildDocDefinition(data: Visit1PdfData, logoLeft: string, logoRight: string) {
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

// ─── PDF Generation & Print ───────────────────────────────────────────────

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

export async function generateAndPrintVisit1Pdf(
  data: Visit1PdfData,
): Promise<void> {
  const [logoLeft, logoRight] = await Promise.all([
    loadAssetBase64(LOGO_LEFT_MODULE),
    loadAssetBase64(LOGO_RIGHT_MODULE),
  ]);
  const docDefinition = buildDocDefinition(data, logoLeft, logoRight);
  const base64 = await pdfToBase64(docDefinition);

  const safeName = data.nombreCompletoProductor
    .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ0-9 ]/g, "")
    .replace(/\s+/g, "_");
  const fileName = `visita1_${safeName}.pdf`;
  const fileUri = `${cacheDirectory}${fileName}`;

  await writeAsStringAsync(fileUri, base64, {
    encoding: EncodingType.Base64,
  });

  await Print.printAsync({ uri: fileUri });
}
