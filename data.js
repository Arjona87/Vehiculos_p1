/* =========================================================================
   data.js — Robo de Vehículos AMG (CGES / Gobierno de Jalisco)
   -------------------------------------------------------------------------
   Responsabilidades:
   1) Conectar en vivo con el Google Sheet fuente (vía endpoint gviz/tq).
   2) Mapear columnas reales del Sheet -> variables internas del dashboard.
   3) EXCLUIR de forma dura cualquier campo sensible/personal (gobernanza
      de datos: ver sección 3 del prompt de construcción).
   4) Reproyectar la geometría (wkt_geom, en UTM 13N / EPSG:32613) a
      WGS84 (lat/long) para poder graficarla en Leaflet.
   5) Calcular todos los agregados que consumen charts.js y map.js.

   NOTA IMPORTANTE (ver data-mapping.md):
   Al inspeccionar el Google Sheet en vivo se confirmó que el tab principal
   tiene 100 columnas (A→CV) y **no** incluye columnas LATITUD/LONGITUD en
   grados decimales (a diferencia del Excel de muestra original, que sí las
   tenía). Por lo tanto la única fuente de geolocalización disponible es
   `wkt_geom` (y su duplicado Xgeo/YGeo), en un sistema proyectado que, por
   rango de valores, corresponde a UTM Zona 13N (EPSG:32613). Este módulo
   reproyecta esos valores en el cliente usando proj4js.
   ========================================================================= */

const APP_CONFIG = {
  // ID del Google Sheet fuente de este proyecto (Robo de Vehículos AMG).
  SHEET_ID: "1SwLdpHDL9HvjmyFdWwN3bd5BdCvrVgUM6DjUKCw5L7I",
  // Si el Sheet tiene varias pestañas por año, se puede fijar aquí o dejar
  // que loadAvailableSheetNames() las detecte. Por ahora v1 solo usa 2026.
  SHEET_TAB_NAME: null, // null = primera hoja / hoja por defecto
  // Años a mostrar en v1 (se filtra el resto aunque exista en el Sheet).
  V1_ONLY_YEAR: 2026,
  FETCH_TIMEOUT_MS: 15000,
};

/* -------------------------------------------------------------------------
   1) MAPEO DE COLUMNAS (confirmado contra el Sheet real — ver data-mapping.md)
   ------------------------------------------------------------------------- */
const COLUMN_MAP = {
  wkt_geom: "wkt_geom",
  nuc: "NUC",                 // uso interno solamente para deduplicar; NUNCA se muestra
  fechaHechos: "FECHA_DE_H",
  horaHechos: "HORA_HECHO",
  fechaDenuncia: "FECHA_DE_D",
  mes: "MES",
  anio: "AÑO",
  numOfendidos: "NUM_OFENDI",
  numVehiculos: "NUM_VEHICU",
  delito: "Delito",
  especialidad: "Especialid",
  modalidad: "Modalidad",
  violencia: "Violencia",
  medioComision: "Medio_de_c",
  modusOperandi: "Modus_oper",
  municipio: "MUNICIPIO",
  municipioGeo: "MunicipioG", // ver data-mapping.md: puede no existir aún en el Sheet conectado
  estado: "ESTADO",
  colonia: "COLONIA",
  violenciaEst: "Violencia_",
  modusEst: "MODUS_EST",
  marca: "Marca",
  submarca: "Submarca",
  modeloAnio: "Modelo",
  color: "Color",
  situacion: "SituaciOn",     // posible estatus (recuperado/detenido) — no siempre presente
  estatusCi: "ESTATUS_CI",
  zonaGeo: "ZonaGeo",         // usado como "sector" (ej. GU07, ZP04, TL01…)
  xgeo: "Xgeo",
  ygeo: "YGeo",
  codigoPostal: "CODIGO_POS",
};

// Campos que EXISTEN en el Sheet pero que jamás deben usarse para mostrar,
// exportar, o incluir en tooltips/popups/tablas, por ser datos sensibles o
// personales (gobernanza de datos — obligatorio, ver sección 3 del prompt).
const SENSITIVE_COLUMNS = [
  "Usu_CREO_E", "Serie", "Placa", "NUC", "NUMnuC", "OBS_EST", "Observac",
  "REV_EST", "CALLE", "NUM_INTE", "NUM_EXT", "ENTRE_1", "ENTRE_2",
  "LUGAR_REFE", "OBJETOS_RO", "EMPRESA", "CantMascul", "CantFemeni",
  "CantDescon", "TotalVicti", "IdGeo", "CalleGeo", "CruceGeo",
];

/* -------------------------------------------------------------------------
   2) REPROYECCIÓN GEOESPACIAL (UTM 13N / EPSG:32613 -> WGS84)
   ------------------------------------------------------------------------- */
// Definición usada por proj4js. Ajustar aquí si al validar contra puntos de
// control reales se confirma un EPSG distinto (ver nota en data-mapping.md).
if (typeof proj4 !== "undefined") {
  proj4.defs("EPSG:32613", "+proj=utm +zone=13 +datum=WGS84 +units=m +no_defs");
}

function parseWktPoint(wkt) {
  if (!wkt || typeof wkt !== "string") return null;
  const m = wkt.match(/Point\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!m) return null;
  const x = parseFloat(m[1]);
  const y = parseFloat(m[2]);
  if (isNaN(x) || isNaN(y)) return null;
  return { x, y };
}

function reprojectToWGS84(x, y) {
  // Validación de rango: descarta geometrías nulas / (0,0) / fuera de AMG.
  if (!x || !y) return null;
  if (x < 400000 || x > 900000) return null;   // fuera de rango plausible UTM13N para Jalisco
  if (y < 2000000 || y > 2500000) return null; // fuera de rango plausible para AMG
  try {
    if (typeof proj4 !== "undefined") {
      const [lon, lat] = proj4("EPSG:32613", "EPSG:4326", [x, y]);
      // Segunda validación: el resultado debe caer cerca del AMG.
      if (lat < 20.2 || lat > 21.2 || lon < -103.9 || lon > -103.0) return null;
      return { lat, lon };
    }
  } catch (e) {
    console.warn("Error reproyectando punto:", e);
  }
  return null;
}

/* -------------------------------------------------------------------------
   3) FETCH DEL GOOGLE SHEET (formato gviz/tq -> JSON)
   ------------------------------------------------------------------------- */
function buildGvizUrl() {
  const base = `https://docs.google.com/spreadsheets/d/${APP_CONFIG.SHEET_ID}/gviz/tq?tqx=out:json`;
  return APP_CONFIG.SHEET_TAB_NAME
    ? `${base}&sheet=${encodeURIComponent(APP_CONFIG.SHEET_TAB_NAME)}`
    : base;
}

function parseGvizResponse(text) {
  // La respuesta viene envuelta como: google.visualization.Query.setResponse({...});
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  const jsonStr = text.substring(jsonStart, jsonEnd + 1);
  const parsed = JSON.parse(jsonStr);
  const cols = parsed.table.cols.map(c => (c.label || c.id || "").trim());
  const rows = parsed.table.rows.map(r => {
    const obj = {};
    r.c.forEach((cell, i) => {
      const key = cols[i];
      if (!key) return;
      obj[key] = cell ? (cell.f !== undefined && cell.f !== null ? cell.f : cell.v) : null;
    });
    return obj;
  });
  return rows;
}

async function fetchSheetRows() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APP_CONFIG.FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(buildGvizUrl(), { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return parseGvizResponse(text);
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/* -------------------------------------------------------------------------
   4) NORMALIZACIÓN DE REGISTROS (solo campos permitidos + geolocalización)
   ------------------------------------------------------------------------- */
const DIAS_ORDEN = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"];
const DIAS_JS = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"]; // getDay(): 0=domingo

function parseFechaDDMMYYYY(str) {
  if (!str || typeof str !== "string") return null;
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return new Date(parseInt(y), parseInt(mo) - 1, parseInt(d));
}

function franjaHoraria(horaStr) {
  if (!horaStr) return null;
  let h = null;
  if (typeof horaStr === "string") {
    const m = horaStr.match(/^(\d{1,2}):(\d{2})/);
    if (m) h = parseInt(m[1]);
  } else if (typeof horaStr === "number") {
    h = Math.floor(horaStr * 24) % 24; // si viene como fracción de día (formato hora de Sheets)
  }
  if (h === null || isNaN(h)) return null;
  if (h >= 0 && h < 6) return "MADRUGADA";
  if (h >= 6 && h < 12) return "MAÑANA";
  if (h >= 12 && h < 19) return "TARDE";
  return "NOCHE";
}

function normalizeRecord(raw) {
  const g = key => raw[COLUMN_MAP[key]] ?? null;

  const wkt = g("wkt_geom");
  const point = parseWktPoint(wkt);
  const geo = point ? reprojectToWGS84(point.x, point.y) : null;

  const fecha = parseFechaDDMMYYYY(g("fechaHechos"));
  const anio = parseInt(g("anio")) || (fecha ? fecha.getFullYear() : null);
  const mes = (g("mes") || "").toString().trim().toUpperCase();

  const violenciaRaw = (g("violencia") || g("violenciaEst") || "").toString().trim().toUpperCase();
  const conViolencia = violenciaRaw === "SI" || violenciaRaw.includes("CON VIOLENCIA");

  const modus = (g("modusEst") || g("modusOperandi") || "SIN ESPECIFICAR").toString().trim().toUpperCase();

  const diaSemana = fecha ? DIAS_JS[fecha.getDay()] : null;
  const franja = franjaHoraria(g("horaHechos"));

  return {
    anio,
    mes,
    fecha,
    diaSemana,
    franja,
    municipio: (g("municipio") || "SIN DATO").toString().trim().toUpperCase(),
    // MunicipioG (geocodificado) con fallback a MUNICIPIO si el Sheet aún no trae esa columna.
    municipioGeo: (g("municipioGeo") || g("municipio") || "SIN DATO").toString().trim().toUpperCase(),
    colonia: (g("colonia") || "SIN DATO").toString().trim().toUpperCase(),
    sector: (g("zonaGeo") || "SIN DATO").toString().trim().toUpperCase(),
    conViolencia,
    modus,
    marca: (g("marca") || "SIN DATO").toString().trim().toUpperCase(),
    submarca: (g("submarca") || "SIN DATO").toString().trim().toUpperCase(),
    situacion: (g("situacion") || "").toString().trim().toUpperCase(),
    lat: geo ? geo.lat : null,
    lon: geo ? geo.lon : null,
  };
}

/* -------------------------------------------------------------------------
   5) CARGA PRINCIPAL (con fallback local si falla el fetch en vivo)
   ------------------------------------------------------------------------- */
async function loadDataset() {
  try {
    const rows = await fetchSheetRows();
    const normalized = rows.map(normalizeRecord).filter(r => r.anio);
    if (!normalized.length) throw new Error("El Sheet respondió vacío");
    return { records: normalized, source: "live", fetchedAt: new Date() };
  } catch (err) {
    console.warn("No se pudo leer el Google Sheet en vivo, usando datos de respaldo:", err);
    const fallback = await fetch("fallback.json").then(r => r.json()).catch(() => []);
    const normalized = fallback.map(r => ({ ...r, fecha: r.fecha ? new Date(r.fecha) : null }));
    return { records: normalized, source: "fallback", fetchedAt: null, error: err };
  }
}

/* -------------------------------------------------------------------------
   6) AGREGADOS (alimentan KPIs, gráficas y mapa)
   ------------------------------------------------------------------------- */
const MESES_ORDEN = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO",
  "JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];

function computeAggregates(records) {
  const total = records.length;
  const conViolencia = records.filter(r => r.conViolencia).length;
  const sinViolencia = total - conViolencia;

  // Mensual (multi-año, listo para escalar)
  const monthlyByYear = {};
  records.forEach(r => {
    if (!r.anio || !r.mes) return;
    monthlyByYear[r.anio] = monthlyByYear[r.anio] || {};
    monthlyByYear[r.anio][r.mes] = (monthlyByYear[r.anio][r.mes] || 0) + 1;
  });

  // Municipios (columna MunicipioG, geocodificada; con fallback a MUNICIPIO)
  const municipios = {};
  records.forEach(r => { municipios[r.municipioGeo] = (municipios[r.municipioGeo] || 0) + 1; });
  const topMunicipios = Object.entries(municipios).sort((a,b)=>b[1]-a[1]).slice(0,10);

  // Colonias — se agregan junto con su municipio para desambiguar colonias
  // homónimas (ej. "Centro") que existen en más de un municipio del AMG.
  const coloniasDetalle = {};
  records.forEach(r => {
    const key = `${r.municipio}|||${r.colonia}`;
    if (!coloniasDetalle[key]) coloniasDetalle[key] = { municipio: r.municipio, colonia: r.colonia, count: 0 };
    coloniasDetalle[key].count++;
  });
  const topColoniasDetalle = Object.values(coloniasDetalle).sort((a,b)=>b.count-a.count).slice(0,10);
  // Formato [nombre, valor] para reutilizar la gráfica de barras genérica.
  const topColonias = topColoniasDetalle.map(d => [`${d.colonia} — ${d.municipio}`, d.count]);

  // Sectores
  const sectores = {};
  records.forEach(r => { sectores[r.sector] = (sectores[r.sector] || 0) + 1; });
  const topSectores = Object.entries(sectores).sort((a,b)=>b[1]-a[1]);

  // Marcas / submarcas
  const marcas = {};
  const submarcas = {};
  records.forEach(r => {
    marcas[r.marca] = (marcas[r.marca] || 0) + 1;
    const key = `${r.marca} ${r.submarca}`;
    submarcas[key] = (submarcas[key] || 0) + 1;
  });
  const topMarcas = Object.entries(marcas).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const topSubmarcas = Object.entries(submarcas).sort((a,b)=>b[1]-a[1]).slice(0,8);

  // Modus operandi
  const modus = {};
  records.forEach(r => { modus[r.modus] = (modus[r.modus] || 0) + 1; });
  const topModus = Object.entries(modus).sort((a,b)=>b[1]-a[1]);

  // Heatmap día x franja (separado con/sin violencia)
  const franjas = ["MADRUGADA","MAÑANA","TARDE","NOCHE"];
  function buildHeatmap(filterFn){
    const h = {};
    franjas.forEach(f => { h[f] = {}; DIAS_ORDEN.forEach(d => h[f][d] = 0); });
    records.filter(filterFn).forEach(r => {
      if (!r.franja || !r.diaSemana) return;
      if (h[r.franja] && h[r.franja][r.diaSemana] !== undefined) h[r.franja][r.diaSemana]++;
    });
    return h;
  }
  const heatmapViolencia = buildHeatmap(r => r.conViolencia);
  const heatmapSinViolencia = buildHeatmap(r => !r.conViolencia);

  // Recuperados / detenidos: no siempre disponibles en el dataset crudo.
  const situacionesDisponibles = records.some(r => r.situacion && r.situacion.length > 0);

  return {
    total, conViolencia, sinViolencia,
    pctConViolencia: total ? Math.round((conViolencia/total)*100) : 0,
    pctSinViolencia: total ? Math.round((sinViolencia/total)*100) : 0,
    monthlyByYear,
    topMunicipios, topColonias, topColoniasDetalle, topSectores, topMarcas, topSubmarcas, topModus,
    heatmapViolencia, heatmapSinViolencia,
    situacionesDisponibles,
    years: Object.keys(monthlyByYear).map(Number).sort(),
  };
}

// Namespace global simple para que main.js / charts.js / map.js consuman lo mismo.
window.CGES = window.CGES || {};
window.CGES.APP_CONFIG = APP_CONFIG;
window.CGES.SENSITIVE_COLUMNS = SENSITIVE_COLUMNS;
window.CGES.loadDataset = loadDataset;
window.CGES.computeAggregates = computeAggregates;
window.CGES.MESES_ORDEN = MESES_ORDEN;
window.CGES.DIAS_ORDEN = DIAS_ORDEN;
