# Fichas de personaje · Old Gods of Appalachia

Web sencilla para que el Director de Juego cree, rellene e imprima fichas de personaje de *Old Gods of Appalachia* sobre la plantilla oficial (anverso y reverso).

No necesita servidor ni instalación: son archivos estáticos (HTML + CSS + JS) que se publican gratis con **GitHub Pages**.

## Uso

- **+ Nueva ficha** crea una ficha en blanco. Todo se guarda solo mientras escribes.
- Los campos se rellenan directamente sobre la plantilla.
- Las cajas grandes (habilidades especiales, cifras, equipo, trasfondo, arcos, notas) admiten **Markdown**: haz clic para editar y clic fuera o `Esc` para terminar.
  `**negrita**`, `*cursiva*`, `- lista`, `1. lista`, `### título`, `---`, `> cita`. Si el texto no cabe, la letra se reduce sola.
- **Retrato**: haz clic en la zona del retrato o arrastra una imagen. Con "Rellenar" puedes arrastrar la imagen para encuadrarla.
- **Jugador**: se escribe en la barra lateral. Sale en la lista de fichas pero **no se imprime**.
- **Imprimir**: elige ambas caras, solo anverso o solo reverso. Formato apaisado (A4 o Carta).
  Para imprimir a doble cara, activa "dos caras / voltear por el lado corto" en el diálogo de impresión.

## Dónde se guardan las fichas

Las fichas se guardan **en el navegador** que las crea (IndexedDB), no en GitHub.

- Para pasar fichas a otro ordenador o navegador: **Exportar todas** (descarga un `.json`) y luego **Importar .json** en el otro.
- Haz de vez en cuando *Exportar todas* como copia de seguridad: si se borran los datos del navegador, se pierden las fichas.
- La primera vez que se abre la web en un navegador se carga el ejemplo `ejemplos/jasper-stonehill.json`.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (por ejemplo `fichas-ogoa`).
2. Desde esta carpeta:
   ```bash
   git remote add origin https://github.com/TU_USUARIO/fichas-ogoa.git
   git push -u origin main
   ```
3. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)` → **Save**.
4. En un minuto estará en `https://TU_USUARIO.github.io/fichas-ogoa/`.

## Probar en local

Con Python instalado, desde esta carpeta:

```bash
python -m http.server 8000
```

y abre <http://localhost:8000>.

## Estructura

```
index.html                 página
style.css                  estilos (pantalla e impresión)
app.js                     lógica: campos, Markdown, guardado, importar/exportar
img/anverso.jpg            plantilla oficial (anverso)
img/reverso.jpg            plantilla oficial (reverso)
ejemplos/jasper-stonehill.json   personaje de ejemplo
```

Las plantillas de la ficha son © 2021 DeepNerd Media (Cypher System © Monte Cook Games); la propia hoja permite copiarla para uso personal.
