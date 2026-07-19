/* =========================================================================
   map.js — Mapa dinámico de robos de vehículo georreferenciados
   Usa lat/lon ya reproyectados en data.js (a partir de wkt_geom, EPSG:32613).
   Nunca recibe ni muestra campos sensibles: solo fecha, colonia, sector,
   modalidad, violencia y marca/submarca (ver gobernanza de datos, data.js).
   ========================================================================= */

let LEAFLET_MAP = null;
let MARKER_CLUSTER = null;

function initMap() {
  if (LEAFLET_MAP) return LEAFLET_MAP;

  LEAFLET_MAP = L.map("map", { zoomControl: true }).setView([20.676, -103.39], 11);

  // Capa base en tonos oscuros/azulados (CARTO dark, acorde a la paleta institucional)
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: "abcd",
      maxZoom: 19,
    }
  ).addTo(LEAFLET_MAP);

  MARKER_CLUSTER = L.markerClusterGroup({
    maxClusterRadius: 45,
    iconCreateFunction: function (cluster) {
      const count = cluster.getChildCount();
      const size = count > 80 ? 44 : count > 25 ? 38 : 32;
      return L.divIcon({
        html: `<div style="
          width:${size}px;height:${size}px;border-radius:50%;
          background:rgba(19,41,75,.88); color:#fff; display:flex;
          align-items:center;justify-content:center; font-weight:700;
          font-family:Inter,sans-serif; font-size:12px;
          border:2px solid #F5821F;">${count}</div>`,
        className: "",
        iconSize: [size, size],
      });
    },
  });
  LEAFLET_MAP.addLayer(MARKER_CLUSTER);

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
      <div><b>Colonia:</b> ${window.CGES.toTitle(record.colonia)}</div>
      <div><b>Sector:</b> ${record.sector}</div>
      <div><b>Modalidad:</b> ${window.CGES.toTitle(record.modus)}</div>
      <div><b>Violencia:</b> ${record.conViolencia ? "Sí" : "No"}</div>
      <div><b>Vehículo:</b> ${window.CGES.toTitle(record.marca)} ${window.CGES.toTitle(record.submarca)}</div>
    </div>`;
}

function renderMapMarkers(records) {
  initMap();
  MARKER_CLUSTER.clearLayers();

  const withGeo = records.filter(r => r.lat && r.lon);
  const layers = withGeo.map(r => {
    const marker = L.circleMarker([r.lat, r.lon], {
      radius: 6,
      color: "#fff",
      weight: 1,
      fillColor: markerColor(r),
      fillOpacity: 0.9,
    });
    marker.bindPopup(popupHtml(r));
    return marker;
  });

  MARKER_CLUSTER.addLayers(layers);

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
