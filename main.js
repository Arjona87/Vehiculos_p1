/* =========================================================================
   main.js — Orquestación general del dashboard
   Carga datos -> puebla filtros -> calcula agregados -> pinta todo
   Los filtros son cruzados: afectan KPIs, gráficas y mapa a la vez.
   ========================================================================= */

const STATE = {
  allRecords: [],
  filtered: [],
  filters: { anio: "all", mes: "all", municipio: "all", violencia: "all", marca: "all" },
  source: "live",
};

function fmtNum(n) {
  return (n ?? 0).toLocaleString("es-MX");
}

function fmtDelta(curr, prev) {
  if (prev === null || prev === undefined || prev === 0) {
    return { html: `<span class="kpi-na">Sin periodo previo para comparar</span>`, dir: "flat" };
  }
  const pct = Math.round(((curr - prev) / prev) * 100);
  const dir = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "■";
  return { html: `<span class="kpi-delta ${dir}">${arrow} ${Math.abs(pct)}% vs periodo anterior</span>`, dir };
}

/* ---------------------- Filtros ---------------------- */
function applyFilters() {
  const f = STATE.filters;
  STATE.filtered = STATE.allRecords.filter(r => {
    if (f.anio !== "all" && String(r.anio) !== String(f.anio)) return false;
    if (f.mes !== "all" && r.mes !== f.mes) return false;
    if (f.municipio !== "all" && r.municipioGeo !== f.municipio) return false;
    if (f.violencia !== "all") {
      const wantViolence = f.violencia === "con";
      if (r.conViolencia !== wantViolence) return false;
    }
    if (f.marca !== "all" && r.marca !== f.marca) return false;
    return true;
  });
}

function populateFilterOptions() {
  const years = [...new Set(STATE.allRecords.map(r => r.anio))].sort();
  const municipios = [...new Set(STATE.allRecords.map(r => r.municipioGeo))].sort();
  const marcas = [...new Set(STATE.allRecords.map(r => r.marca))].sort();

  fillSelect("filter-anio", years, "Todos los años");
  fillSelect("filter-mes", window.CGES.MESES_ORDEN, "Todos los meses", window.CGES.toTitle);
  fillSelect("filter-municipio", municipios, "Todos los municipios", window.CGES.toTitle);
  fillSelect("filter-marca", marcas, "Todas las marcas", window.CGES.toTitle);

  // Selector de año del header (hero) — mismo comportamiento, ligado al filtro global.
  fillSelect("hero-year-select", years, "Todos los años (2026 en v1)");
}

function fillSelect(id, values, placeholderLabel, labelFn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<option value="all">${placeholderLabel}</option>` +
    values.map(v => `<option value="${v}">${labelFn ? labelFn(v) : v}</option>`).join("");
}

function wireFilterEvents() {
  ["filter-anio","filter-mes","filter-municipio","filter-violencia","filter-marca"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => {
      const key = id.replace("filter-","");
      STATE.filters[key] = el.value === "all" ? "all" : (key==="violencia" ? el.value : el.value);
      document.getElementById("hero-year-select").value =
        key === "anio" ? el.value : document.getElementById("hero-year-select").value;
      renderAll();
    });
  });

  const heroYear = document.getElementById("hero-year-select");
  if (heroYear) heroYear.addEventListener("change", () => {
    STATE.filters.anio = heroYear.value;
    document.getElementById("filter-anio").value = heroYear.value;
    renderAll();
  });

  const btnReset = document.getElementById("btn-reset-filters");
  if (btnReset) btnReset.addEventListener("click", () => {
    STATE.filters = { anio: "all", mes: "all", municipio: "all", violencia: "all", marca: "all" };
    ["filter-anio","filter-mes","filter-municipio","filter-violencia","filter-marca","hero-year-select"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = "all"; });
    renderAll();
  });
}

/* ---------------------- Render de KPIs y narrativas ---------------------- */
function renderKPIs(agg) {
  setText("kpi-total", fmtNum(agg.total));
  setText("kpi-con-violencia", fmtNum(agg.conViolencia));
  setText("kpi-sin-violencia", fmtNum(agg.sinViolencia));
  setText("kpi-pct-violencia", `${agg.pctConViolencia}%`);

  document.getElementById("filter-count").textContent =
    `${fmtNum(STATE.filtered.length)} de ${fmtNum(STATE.allRecords.length)} registros bajo el filtro actual`;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function renderInsights(agg) {
  const modusTop = agg.topModus[0];
  const colTop = agg.topColoniasDetalle[0];
  const secTop = agg.topSectores[0];
  const marcaTop = agg.topMarcas[0];

  setHtml("insight-violence",
    agg.total
      ? `Del total analizado bajo el filtro actual (<b>${fmtNum(agg.total)}</b> eventos), el <b>${agg.pctSinViolencia}%</b> ocurrió sin violencia y el <b>${agg.pctConViolencia}%</b> con violencia.`
      : `No hay eventos que coincidan con el filtro seleccionado.`);

  setHtml("insight-modus",
    modusTop
      ? `El modus operandi más recurrente es <b>${window.CGES.toTitle(modusTop[0])}</b>, con ${fmtNum(modusTop[1])} eventos (${Math.round(modusTop[1]/agg.total*100)}% del total filtrado).`
      : `No hay datos suficientes de modus operandi para este filtro.`);

  setHtml("insight-colonias",
    colTop
      ? `<b>${window.CGES.toTitle(colTop.colonia)}</b>, en el municipio de <b>${window.CGES.toTitle(colTop.municipio)}</b>, es la colonia con mayor incidencia bajo el filtro actual (${fmtNum(colTop.count)} eventos). El sector con mayor incidencia es <b>${secTop ? secTop[0] : "s/d"}</b> con ${secTop?fmtNum(secTop[1]):0} eventos.`
      : `No hay datos suficientes de colonias para este filtro.`);

  setHtml("insight-marcas",
    marcaTop
      ? `<b>${window.CGES.toTitle(marcaTop[0])}</b> es la marca con mayor incidencia (${fmtNum(marcaTop[1])} eventos, ${Math.round(marcaTop[1]/agg.total*100)}% del total filtrado).`
      : `No hay datos suficientes de marcas para este filtro.`);

  const notAvailable = `<span class="not-available">Este dataset (muestra cruda de Fiscalía) no trae una columna explícita de estatus de recuperación/detención. Cuando el Google Sheet incorpore ese campo (ver <code>data-mapping.md</code>), esta sección se completará automáticamente sin cambios de código.</span>`;
  setHtml("insight-detenidos", agg.situacionesDisponibles
    ? `Se identificaron registros con estatus de seguimiento en el campo "SituaciOn".`
    : notAvailable);
  setHtml("insight-recuperados", agg.situacionesDisponibles
    ? `Se identificaron registros con estatus de recuperación en el campo "SituaciOn".`
    : notAvailable);
}

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

/* ---------------------- Tablas de ranking ---------------------- */
function renderRankTable(tbodyId, entries, total) {
  const el = document.getElementById(tbodyId);
  if (!el) return;
  const max = entries.length ? entries[0][1] : 1;
  el.innerHTML = entries.map(([name, value]) => `
    <tr>
      <td class="bar-cell"><div class="bar" style="width:${(value/max*100).toFixed(0)}%"></div><span>${window.CGES.toTitle(name)}</span></td>
      <td>${fmtNum(value)}</td>
      <td>${total ? Math.round(value/total*100) : 0}%</td>
    </tr>`).join("");
}

// Tabla de colonias con columna de Municipio en primer lugar, para
// desambiguar colonias homónimas entre municipios (ej. "Centro").
function renderColoniasTable(tbodyId, detalle, total) {
  const el = document.getElementById(tbodyId);
  if (!el) return;
  const max = detalle.length ? detalle[0].count : 1;
  el.innerHTML = detalle.map(d => `
    <tr>
      <td>${window.CGES.toTitle(d.municipio)}</td>
      <td class="bar-cell"><div class="bar" style="width:${(d.count/max*100).toFixed(0)}%"></div><span>${window.CGES.toTitle(d.colonia)}</span></td>
      <td>${fmtNum(d.count)}</td>
      <td>${total ? Math.round(d.count/total*100) : 0}%</td>
    </tr>`).join("");
}

/* ---------------------- Render general ---------------------- */
function renderAll() {
  applyFilters();
  const agg = window.CGES.computeAggregates(STATE.filtered);

  renderKPIs(agg);
  renderInsights(agg);

  window.CGES.renderMonthlyTrend(agg.monthlyByYear, window.CGES.MESES_ORDEN);
  window.CGES.renderViolenceDonut(agg.conViolencia, agg.sinViolencia);
  window.CGES.renderModusDonut(agg.topModus);
  window.CGES.renderHBar("chart-municipios", agg.topMunicipios, window.CGES.PALETTE.navy);
  window.CGES.renderHBar("chart-colonias", agg.topColonias, window.CGES.PALETTE.blue);
  window.CGES.renderHBar("chart-sectores", agg.topSectores, window.CGES.PALETTE.navy);
  window.CGES.renderHBar("chart-marcas", agg.topMarcas, window.CGES.PALETTE.orange);
  window.CGES.renderHBar("chart-submarcas", agg.topSubmarcas, window.CGES.PALETTE.orangeDark);

  window.CGES.renderHeatmapTable("heatmap-violencia", agg.heatmapViolencia, window.CGES.DIAS_ORDEN, "orange");
  window.CGES.renderHeatmapTable("heatmap-sin-violencia", agg.heatmapSinViolencia, window.CGES.DIAS_ORDEN, "blue");

  renderColoniasTable("table-colonias", agg.topColoniasDetalle, agg.total);
  renderRankTable("table-sectores", agg.topSectores, agg.total);

  window.CGES.renderMapMarkers(STATE.filtered);
}

/* ---------------------- Arranque ---------------------- */
async function boot() {
  const overlay = document.getElementById("loading-overlay");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");

  try {
    const { records, source, fetchedAt, error } = await window.CGES.loadDataset();
    STATE.allRecords = records;
    STATE.source = source;

    if (source === "live") {
      statusDot.className = "status-dot";
      statusText.textContent = `Conectado en vivo al Google Sheet · última lectura: ${fetchedAt.toLocaleTimeString("es-MX")}`;
    } else {
      statusDot.className = "status-dot warn";
      statusText.textContent = `Modo caché: no se pudo leer el Google Sheet en vivo (${error?.message || "error de red"}). Mostrando datos de respaldo.`;
    }

    populateFilterOptions();
    wireFilterEvents();
    renderAll();
  } catch (fatal) {
    statusDot.className = "status-dot err";
    statusText.textContent = "No fue posible cargar datos (ni en vivo ni de respaldo).";
    console.error(fatal);
  } finally {
    overlay.classList.add("hide");
    setTimeout(() => overlay.remove(), 500);
  }
}

document.addEventListener("DOMContentLoaded", boot);
