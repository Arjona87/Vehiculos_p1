/* =========================================================================
   map.js — Mapa dinámico de robos de vehículo georreferenciados
   Usa lat/lon ya reproyectados en data.js (a partir de wkt_geom, EPSG:32613).
   Nunca recibe ni muestra campos sensibles: solo fecha, colonia, sector,
   modalidad, violencia y marca/submarca (ver gobernanza de datos, data.js).
   ========================================================================= */

let LEAFLET_MAP = null;
let MARKERS_LAYER = null;

// Municipios del AMG (idéntico al listado documentado en CAPAS_MAPA_COMPLETO.md)
const MUNICIPIOS_AMG = [
  'Guadalajara', 'Zapopan', 'San Pedro Tlaquepaque',
  'Tlajomulco de Zuñiga', 'Tonala', 'El Salto',
  'Juanacatlan', 'Ixtlahuacan de los Membrillos', 'Zapotlanejo',
];

function normalizaNombre(str) {
  return (str || "").toLowerCase().replace(/ú/g, "u").replace(/á/g, "a");
}

function initMap() {
  if (LEAFLET_MAP) return LEAFLET_MAP;

  LEAFLET_MAP = L.map("map", { zoomControl: true }).setView([20.676, -103.39], 11);

  // Capa base "Relieve" — EXACTAMENTE la misma que usa ETA (Esri World_Topo_Map).
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    { attribution: '© Esri, HERE, Garmin, Intermap, increment P Corp.' }
  ).addTo(LEAFLET_MAP);

  // Fronteras municipales (idénticas a ETA): Jalisco completo (punteado, fondo)
  // + AMG resaltado en verde fluorescente. Se cargan de forma asíncrona.
  fetch("jalisco_municipios.geojson")
    .then(r => r.json())
    .catch(() => window.__CGES_MUNICIPIOS_GEOJSON_INLINE__ || { type: "FeatureCollection", features: [] })
    .then(jaliscoBorders => {
      const jaliscoLayer = L.geoJSON(jaliscoBorders, {
        style: { color: "#000000", weight: 2, opacity: 0.1, fillOpacity: 0.1, dashArray: "3,3" },
        onEachFeature: (feature, layer) => {
          const nombre = feature.properties.NOMGEO || feature.properties.name || feature.properties.NOM_MUN;
          layer.bindPopup(`${nombre}`);
        },
      });

      const amgFeatures = jaliscoBorders.features.filter(f => {
        const nombre = f.properties.NOMGEO || f.properties.name || f.properties.NOM_MUN;
        return MUNICIPIOS_AMG.some(mun => normalizaNombre(nombre).includes(normalizaNombre(mun)));
      });

      const amgLayer = L.geoJSON({ type: "FeatureCollection", features: amgFeatures }, {
        style: { color: "#66FF66", weight: 2, opacity: 0.2, fillOpacity: 0.2, fillColor: "#66FF66" },
        onEachFeature: (feature, layer) => {
          const nombre = feature.properties.NOMGEO || feature.properties.name || feature.properties.NOM_MUN;
          layer.bindPopup(`<strong>Municipio AMG:</strong> ${nombre}`);
        },
      });

      L.layerGroup([jaliscoLayer, amgLayer]).addTo(LEAFLET_MAP);
    })
    .catch(err => console.warn("No se pudieron cargar las fronteras municipales:", err));

  MARKERS_LAYER = L.layerGroup();
  LEAFLET_MAP.addLayer(MARKERS_LAYER);

  return LEAFLET_MAP;
}

function markerColor(record) {
  return record.conViolencia ? "#F5821F" : "#2E6DB4";
}

function popupHtml(record) {
  // Solo metadatos mínimos y no sensibles — nunca folio, nombre o placa.
  const fecha = record.fecha
    ? new Date(record.fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })
    : "Fecha no disponible";
  return `
    <div style="font-family:Inter,sans-serif; font-size:12.5px; min-width:190px;">
      <div style="font-weight:700; color:#13294B; margin-bottom:4px;">${fecha}</div>
      <div><b>Municipio:</b> ${window.CGES.toTitle(record.municipio)}</div>
      <div><b>Colonia:</b> ${window.CGES.toTitle(record.colonia)}</div>
      <div><b>Sector:</b> ${record.sector}</div>
      <div><b>Modalidad:</b> ${window.CGES.toTitle(record.modus)}</div>
      <div><b>Violencia:</b> ${record.conViolencia ? "Sí" : "No"}</div>
      <div><b>Vehículo:</b> ${window.CGES.toTitle(record.marca)} ${window.CGES.toTitle(record.submarca)}</div>
    </div>`;
}

function renderMapMarkers(records) {
  initMap();
  MARKERS_LAYER.clearLayers();

  const withGeo = records.filter(r => r.lat && r.lon);
  withGeo.forEach(r => {
    const marker = L.circleMarker([r.lat, r.lon], {
      radius: 6,
      color: "#fff",
      weight: 1,
      fillColor: markerColor(r),
      fillOpacity: 0.9,
    });
    marker.bindPopup(popupHtml(r));
    marker.addTo(MARKERS_LAYER);
  });

  const totalStat = document.getElementById("map-total-stat");
  if (totalStat) {
    totalStat.textContent = `${withGeo.length} de ${records.length} eventos georreferenciados en el mapa`;
  }

  if (withGeo.length) {
    const bounds = L.latLngBounds(withGeo.map(r => [r.lat, r.lon]));
    LEAFLET_MAP.fitBounds(bounds.pad(0.12));
  }
}

window.CGES = window.CGES || {};
Object.assign(window.CGES, { initMap, renderMapMarkers });
