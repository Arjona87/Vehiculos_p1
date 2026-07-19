# Dashboard — Robo de Vehículos AMG (CGES, Gobierno de Jalisco)

Dashboard HTML estático (sin backend) que analiza el delito de robo de vehículo particular en el Área Metropolitana de Guadalajara (AMG), alimentado en vivo desde Google Sheets, con mapa dinámico de eventos georreferenciados.

## Estructura del proyecto (carpeta única, sin subcarpetas)

```
index.html          → estructura de todas las secciones del dashboard
style.css           → paleta institucional CGES y estilos
data.js             → conexión a Google Sheets, mapeo de columnas, privacidad, geolocalización, agregados
charts.js           → inicialización y actualización de gráficas (ECharts)
map.js              → mapa dinámico (Leaflet + clustering)
main.js             → orquestación de filtros globales y renderizado
fallback.json       → datos de respaldo (sintéticos/agregados, sin datos personales) si falla el fetch en vivo
CGES_logo.png       → logo institucional
data-mapping.md     → mapeo de columnas confirmado contra el Google Sheet real
README.md           → este archivo
```

## Cómo funciona

1. Al cargar la página, `data.js` hace un `fetch` al endpoint público de Google Sheets (`gviz/tq`) usando el ID configurado en `APP_CONFIG.SHEET_ID`.
2. Cada fila se normaliza y se limpia de cualquier campo sensible (ver `SENSITIVE_COLUMNS` en `data.js` y `data-mapping.md`).
3. La geometría (`wkt_geom`, en UTM 13N) se reproyecta a WGS84 en el navegador con `proj4js`, para poder graficarse en el mapa.
4. `main.js` calcula agregados (KPIs, series, rankings, heatmap) y los reparte a `charts.js` (gráficas) y `map.js` (mapa).
5. Los filtros globales (año, mes, sector, violencia, marca) recalculan todo en el cliente, sin volver a pedir el Sheet.
6. Si el fetch en vivo falla (permisos, cuota, cambio de estructura), el dashboard cae automáticamente a `fallback.json` y lo indica en la barra de estado superior.

## Cómo actualizar el Google Sheet ID

Editar en `data.js`:

```js
const APP_CONFIG = {
  SHEET_ID: "TU_NUEVO_ID_AQUI",
  SHEET_TAB_NAME: null, // o el nombre exacto de la pestaña si el Sheet tiene varias
  ...
};
```

El Sheet debe estar compartido como **"Cualquiera con el enlace puede ver"** para que el `fetch` funcione desde GitHub Pages.

## Cómo agregar un nuevo año

No requiere tocar código: basta con agregar las filas del año nuevo al mismo Google Sheet (mismos encabezados de columna). El selector de año y el comparativo mensual multi-año se actualizan automáticamente. Ver detalle en `data-mapping.md`, sección 5.

## Cómo agregar/editar una colonia o sector si cambia la división territorial

El dashboard no tiene un catálogo fijo de colonias o sectores — los calcula dinámicamente a partir de los valores que existan en las columnas `COLONIA` y `ZonaGeo` del Sheet. Si cambia la división territorial (nuevos sectores, colonias renombradas), solo hay que asegurarse de que el Sheet use los nuevos valores; el dashboard los reflejará automáticamente en rankings, gráficas y filtros.

## Cómo publicar / actualizar en GitHub Pages

1. Subir todos los archivos de esta carpeta a la raíz de un repositorio de GitHub (o a la rama que se use para Pages).
2. En la configuración del repositorio → **Pages**, seleccionar la rama y la carpeta raíz (`/`) como fuente.
3. GitHub generará una URL tipo `https://usuario.github.io/nombre-repo/`.
4. Cualquier cambio a `index.html`, `.css` o `.js` se refleja con un simple `git push`; no hay paso de build ni compilación.

## Notas de gobernanza de datos (obligatorio, no opcional)

Este dashboard es un sitio **público**. Nunca se debe:
- Mostrar, exportar o incluir en tooltips/popups campos como placa, número de serie (VIN), nombre de usuarios que capturaron el reporte, direcciones exactas, o cualquier dato que permita identificar a una persona física.
- Eliminar o comentar la lista `SENSITIVE_COLUMNS` en `data.js` sin antes revisar con el área jurídica/de datos de la CGES.

## Próximas iteraciones sugeridas (no incluidas en v1)

- Poblar las secciones de "Detenidos y aseguramientos" y "Vehículos recuperados" en cuanto el Sheet incorpore una columna explícita de estatus (ver `data-mapping.md`, punto 4).
- Agregar distancia robo↔recuperación cuando exista un identificador que vincule ambos eventos.
- Soporte multi-pestaña en `data.js` si Fiscalía entrega los años futuros en tabs separados en vez de filas nuevas.
- Exportación de vistas filtradas a PDF/imagen (actualmente fuera de alcance de v1).
