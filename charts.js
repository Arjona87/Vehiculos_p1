/* =========================================================================
   charts.js — Inicialización y actualización de gráficas (ECharts)
   Paleta: azul marino / azul medio / naranja institucional / grises
   ========================================================================= */

const PALETTE = {
  navy: "#13294B",
  navyDark: "#0B1F3A",
  blue: "#1B4F91",
  blueLight: "#2E6DB4",
  orange: "#F5821F",
  orangeDark: "#E8792D",
  gray: "#9AA5B1",
  green: "#1FA35C",
  red: "#D64545",
};

const CHART_INSTANCES = {};

function getOrCreateChart(domId) {
  const el = document.getElementById(domId);
  if (!el) return null;
  if (CHART_INSTANCES[domId]) return CHART_INSTANCES[domId];
  const inst = echarts.init(el, null, { renderer: "svg" });
  CHART_INSTANCES[domId] = inst;
  window.addEventListener("resize", () => inst.resize());
  return inst;
}

function baseTooltip() {
  return { trigger: "item", backgroundColor: "#13294B", borderWidth: 0, textStyle: { color: "#fff", fontSize: 12 } };
}

/* ---------------------- 1. Comparativo mensual multi-año ---------------------- */
function renderMonthlyTrend(monthlyByYear, mesesOrden) {
  const chart = getOrCreateChart("chart-monthly");
  if (!chart) return;
  const years = Object.keys(monthlyByYear).sort();
  const colors = [PALETTE.blue, PALETTE.orange, PALETTE.gray, PALETTE.green, PALETTE.navy];
  const series = years.map((y, i) => ({
    name: y,
    type: "line",
    smooth: true,
    symbolSize: 6,
    lineStyle: { width: 3, color: colors[i % colors.length] },
    itemStyle: { color: colors[i % colors.length] },
    data: mesesOrden.map(m => monthlyByYear[y][m] || 0),
  }));
  chart.setOption({
    tooltip: { trigger: "axis" },
    legend: { data: years, top: 0, textStyle: { fontSize: 12 } },
    grid: { left: 40, right: 16, top: 34, bottom: 28 },
    xAxis: { type: "category", data: mesesOrden.map(m => m.slice(0,3)), axisLine: { lineStyle: { color: "#D8DCE2" } } },
    yAxis: { type: "value", splitLine: { lineStyle: { color: "#EEF1F4" } } },
    series,
  });
}

/* ---------------------- 2. Dona con/sin violencia ---------------------- */
function renderViolenceDonut(conViolencia, sinViolencia) {
  const chart = getOrCreateChart("chart-violence");
  if (!chart) return;
  chart.setOption({
    tooltip: baseTooltip(),
    legend: { bottom: 0, textStyle: { fontSize: 12 } },
    series: [{
      type: "pie",
      radius: ["55%", "78%"],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: "#fff", borderWidth: 2 },
      label: { formatter: "{b}\n{d}%", fontSize: 12 },
      data: [
        { value: sinViolencia, name: "Sin violencia", itemStyle: { color: PALETTE.blue } },
        { value: conViolencia, name: "Con violencia", itemStyle: { color: PALETTE.orange } },
      ],
    }],
  });
}

/* ---------------------- 3. Modus operandi (dona) ---------------------- */
function renderModusDonut(topModus) {
  const chart = getOrCreateChart("chart-modus");
  if (!chart) return;
  const colors = [PALETTE.navy, PALETTE.blue, PALETTE.blueLight, PALETTE.orange, PALETTE.orangeDark, PALETTE.gray, "#7C8B9E", "#B7C2CF"];
  chart.setOption({
    tooltip: baseTooltip(),
    legend: { show:false },
    series: [{
      type: "pie",
      radius: ["45%", "75%"],
      itemStyle: { borderColor: "#fff", borderWidth: 2 },
      label: { fontSize: 11, formatter: "{b}: {d}%" },
      data: topModus.slice(0,8).map(([name, value], i) => ({
        name: toTitle(name), value, itemStyle: { color: colors[i % colors.length] },
      })),
    }],
  });
}

/* ---------------------- 4. Barras horizontales genéricas ---------------------- */
function renderHBar(domId, entries, color) {
  const chart = getOrCreateChart(domId);
  if (!chart) return;
  const data = entries.slice().reverse();
  chart.setOption({
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 140, right: 24, top: 10, bottom: 10 },
    xAxis: { type: "value", splitLine: { lineStyle: { color: "#EEF1F4" } } },
    yAxis: { type: "category", data: data.map(([name]) => toTitle(name)), axisLabel: { fontSize: 11 } },
    series: [{
      type: "bar", data: data.map(([,v]) => v), barMaxWidth: 16,
      itemStyle: { color: color || PALETTE.blue, borderRadius: [0,4,4,0] },
      label: { show: true, position: "right", fontSize: 11, color: "#4A4F57" },
    }],
  });
}

/* ---------------------- 5. Heatmap día x franja ---------------------- */
function renderHeatmapTable(containerId, heatmapData, diasOrden, colorClass) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const franjas = ["MADRUGADA","MAÑANA","TARDE","NOCHE"];
  let max = 1;
  franjas.forEach(f => diasOrden.forEach(d => { max = Math.max(max, heatmapData[f][d] || 0); }));

  let html = `<div class="heatmap-wrap"><table class="heatmap"><thead><tr><th></th>`;
  diasOrden.forEach(d => html += `<th>${d}</th>`);
  html += `<th>Total</th></tr></thead><tbody>`;

  const rowTotals = {}; diasOrden.forEach(d => rowTotals[d]=0);
  franjas.forEach(f => {
    let rowTotal = 0;
    html += `<tr><td class="label">${toTitle(f)}</td>`;
    diasOrden.forEach(d => {
      const v = heatmapData[f][d] || 0;
      rowTotal += v; rowTotals[d]+=v;
      const intensity = v / max;
      const bg = colorClass === "orange"
        ? `rgba(245,130,31,${0.12 + intensity*0.75})`
        : `rgba(27,79,145,${0.12 + intensity*0.75})`;
      const textColor = intensity > 0.55 ? "#fff" : "#1B1F27";
      html += `<td style="background:${bg}; color:${textColor}; font-weight:${v?600:400}">${v||"·"}</td>`;
    });
    html += `<td class="total">${rowTotal}</td></tr>`;
  });
  html += `<tr><td class="label">Total</td>`;
  diasOrden.forEach(d => html += `<td class="total">${rowTotals[d]}</td>`);
  const grand = Object.values(rowTotals).reduce((a,b)=>a+b,0);
  html += `<td class="total">${grand}</td></tr>`;
  html += `</tbody></table></div>`;
  el.innerHTML = html;
}

/* ---------------------- Utilidades ---------------------- */
function toTitle(str){
  if (!str) return "Sin dato";
  return str.toString().toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
}

window.CGES = window.CGES || {};
Object.assign(window.CGES, {
  renderMonthlyTrend, renderViolenceDonut, renderModusDonut,
  renderHBar, renderHeatmapTable, toTitle, PALETTE,
});
