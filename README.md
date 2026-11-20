# Mesa de juego · Old Gods of Appalachia

Web sencilla para que el Director de Juego cree, rellene e imprima fichas de personaje de *Old Gods of Appalachia* sobre la plantilla oficial (anverso y reverso), y lleve el registro de jugadores, partidas y sesiones con sus estadísticas.

No necesita servidor ni instalación: son archivos estáticos (HTML + CSS + JS) que se publican gratis con **GitHub Pages**.

**Acceso:** <https://sukoruiz.github.io/fichas-ogoa/>

## Uso

Las pestañas de arriba de la barra lateral cambian de vista: **Jugadores · Partidas · Estadísticas · Layouts**.

### Fichas

No hay una lista con todas las fichas: se trabaja siempre desde un **jugador** o una **partida**.

- **Abrir una ficha**: desde la página de su jugador, desde la pestaña *Jugadores y fichas* de una partida (icono del ojo o *Ver fichas*) o desde *Fichas sin jugador*. La barra lateral muestra solo las fichas de ese contexto (las del jugador, o las de los jugadores de la partida) y el botón **←** vuelve al jugador o a la partida.
- **Crear, importar, exportar e imprimir** se hace desde la página del jugador o de la partida (no desde el visor):
  - Jugador: *+ Nueva ficha*, *Asignar una ficha existente…* (sin jugador o de otro jugador), *Importar*, *Exportar*, *Imprimir / PDF*, y en cada ficha: abrir, imprimir, exportar, duplicar, quitar del jugador y borrar.
  - Partida: en *Jugadores y fichas*, el personaje de cada jugador (o *+ Nueva ficha…*), y *Ver fichas*, *Importar*, *Exportar*, *Imprimir / PDF* de todas las fichas de la partida.
- **Jugador de una ficha**: se asigna desde **Jugadores** (no desde la ficha). Si el jugador solo tiene esa ficha, pasa a ser su personaje en las partidas donde aún no tenía ninguno. Si una ficha cambia de jugador, sale de las partidas del jugador anterior (las sesiones jugadas no cambian).
- **Fichas sin jugador**: al final de la lista de jugadores (si hay alguna). Allí se abren, se asignan a un jugador, se exportan o se imprimen.
- **Importar fichas** (`.json`): si la ficha ya existe (la misma ficha, o una con el mismo nombre y el mismo jugador), pregunta si se **sobrescriben** sus datos, se crea **otra** o se **omite**; con varias, se puede aplicar la respuesta a todas. Importada desde un jugador, la ficha queda asignada a ese jugador; desde una partida, pasa a ser el personaje de su jugador si este está en la partida sin personaje.
- Los campos se rellenan directamente sobre la plantilla. Todo se guarda solo mientras escribes.
- Las cajas grandes (habilidades especiales, cifras, equipo, trasfondo, arcos, notas) admiten **Markdown**: haz clic para editar y clic fuera o `Esc` para terminar.
  `**negrita**`, `*cursiva*`, `- lista`, `1. lista`, `### título`, `---`, `> cita`. Si el texto no cabe, la letra se reduce sola.
  El icono **?** de abajo a la izquierda abre una ayuda con ejemplos y cómo se ven.
- **Might / Speed / Intellect**: a la izquierda el total (reserva actual); a la derecha, el valor inicial y sus incrementos, uno por línea (`10`, `+4`, `+7`); debajo, la ventaja (*Edge*). Si el total está vacío, se sugiere la suma de la lista (no se imprime).
- **Retrato**: haz clic en la zona del retrato o arrastra una imagen. *Ver entera* encaja la imagen completa en la zona sin deformarla; *Rellenar* la amplía hasta cubrir la zona (a lo alto o a lo ancho) y se puede arrastrar para encuadrarla.

### Imprimir, PDF e imagen

*Imprimir / PDF* (de una ficha o de todas las de un jugador o partida) abre una ventana con:

- **Fichas** a incluir, **caras** (todas o solo una), **margen** (sin margen por defecto, o 3, 5 o 10 mm) y **resolución** del PDF y las imágenes.
- **Doble cara**: las caras de cada ficha van seguidas (anverso, reverso…); si una ficha tiene un número impar de caras se añade una en blanco para que la siguiente empiece en hoja nueva. Opcionalmente se giran 180° las caras pares, por si la impresora deja el reverso cabeza abajo. Para hojas apaisadas, en la impresora elige «doble cara · voltear por el borde corto».
- Cada cara va en el **papel de su layout** (A4, A3 o Carta), con su orientación, centrada y lo más grande posible.
- **Imprimir…** usa el diálogo del navegador: el texto sale nítido (vectorial) y *Guardar como PDF* da un PDF. Si pregunta por los márgenes, elige *Ninguno*.
- **Descargar PDF** crea el PDF directamente y **Imagen** descarga una imagen por cara (JPG o PNG; si son varias, en un `.zip`). En estos dos cada cara va como imagen a la resolución elegida.
- `Ctrl+P` en el visor imprime la ficha abierta, también cada cara en su papel y sin margen.
- El área que puede imprimir cada impresora tiene un pequeño borde; si corta algo, usa 3 o 5 mm de margen.

### Layouts de ficha

Un layout es el diseño de la hoja: las imágenes de sus páginas (una o varias, apaisadas o verticales) y dónde va cada dato. Todos los layouts comparten los datos de la ficha, así que la misma ficha se puede ver con cualquiera; lo que un layout no muestra se conserva.

- **Qué layout se usa**: lo decide la partida en la que juega el personaje (no se elige en la ficha). Si está en varias, el de la partida activa con la sesión más reciente; si no está en ninguna, el primero (Oficial OGOA English).
- **Incluidos**: *Oficial OGOA English* (2 páginas apaisadas, A4), *Periódico OGOA Español* (2 páginas verticales, A4) y *Periódico A3 OGOA Español* (2 caras A3 apaisadas, cada una con dos páginas A4 para doblar como cuadernillo; tiene una caja extra de *Notas breves*).
- **Papel**: cada layout dice en qué papel se imprime (A4, A3 o Carta); se cambia en modo *Editar*.
- **Pestaña Layouts**:
  - **+** crea un layout nuevo. Con **+ Página** se sube la imagen de cada página (PNG o JPG; se comprime a JPEG para que quepa en la base de datos).
  - Sobre la imagen se **dibujan las zonas** arrastrando el ratón, y a cada una se le asigna un campo de la ficha. Las habilidades y los ataques son una sola zona de tabla con filas y columnas; las líneas verticales se arrastran para ajustar las columnas.
  - Clic en una zona para seleccionarla; se mueve arrastrándola y se cambia de tamaño con su esquina. Flechas: 1 px (Mayús: 10 px); Alt + flechas: tamaño; Supr: borrar.
  - El editor tiene dos modos. **Ver** (el de entrada) dibuja la página con los datos de la ficha que elijas, sin poder tocar nada. **Editar** permite cambiar páginas y zonas; solo se entra pulsándolo.
  - Los cambios se guardan solos al momento (la línea de estado de la barra lateral lo indica). Un layout incluido que se edita se guarda como versión modificada, para todos. **Volver al original** la descarta. Si una actualización de la web trae una versión nueva de ese layout (otra plantilla o zonas nuevas), la modificada anterior se ignora y se ve la nueva.
  - **Duplicar**, **Exportar** (un `.json` con imágenes y zonas) e **Importar** (icono de subida junto al +) sirven para copiar layouts o pasarlos a otra web. Si al importar ya hay un layout con el mismo nombre (o es el mismo), pregunta si se **sobrescribe** (las partidas que lo usan siguen con él) o se crea uno nuevo.
  - En modo **Ver**, el botón **Abrir ficha** junto al selector de ficha la abre en el visor para editarla. El selector agrupa las fichas por jugador.

### Jugadores, partidas y estadísticas

- **Jugadores**: nombre, contacto, notas y si está activo; sus fichas (ver arriba), sesiones, asistencia y horas jugadas. Encima de la lista hay un buscador (por jugador o por nombre de ficha).
  Un jugador que ya aparece en partidas no se puede borrar (cuenta en las estadísticas): desmarca *Activo*. Si se borra uno, sus fichas quedan en *Fichas sin jugador*.
- **Partidas**: estado (activa, en pausa, terminada), fechas, **periodicidad prevista** (semanal, quincenal…), **duración prevista por sesión**, **horas totales previstas**, hora habitual de inicio y **layout de las fichas**. La lista lateral muestra la **fecha de la última sesión jugada** (y, dentro de cada estado, ordena por ella; tiene buscador). Debajo, dos pestañas: **Jugadores y fichas** (quién juega y con qué personaje) y **Sesiones**.
- **Horas totales previstas** (objetivo de la partida): en cuántas horas de juego debería jugarse entera. La partida muestra el avance:
  - horas reales acumuladas frente al objetivo (%, lo que falta) y lo que se esperaría llevar hoy según el plan;
  - **plan**: sesiones previstas (objetivo ÷ duración prevista por sesión) y fecha de fin prevista (con la periodicidad prevista desde la fecha de inicio);
  - **ritmo real**: duración media real por sesión, días medios entre sesiones y horas al mes;
  - **al ritmo actual**: sesiones que faltan y fecha de fin estimada, y cuánto antes o después de lo previsto.
- **Sesiones** (dentro de cada partida, *+ Nueva sesión*): fecha, estado (jugada, planificada, cancelada), horario previsto, horario real (inicio, fin y pausas, o solo la duración) y asistencia. La asistencia sale marcada con los jugadores de la partida: desmarca a quien faltó (cuenta como ausencia) o quítalo con ✕ si no estaba convocado; también se puede añadir a alguien que no es de la partida.
- **Estadísticas**: de todas las partidas o de una, y de todo el tiempo o de un año: partidas, sesiones, horas reales y teóricas (y la diferencia), duración media, asistencia, periodicidad (días entre sesiones: media, mediana y mayor hueco), última y próxima sesión. Gráficos de horas por sesión (real frente a teórica), horas por mes y asistencia por jugador, y tablas por partida (con su objetivo y avance), por jugador y por sesión. Con una partida elegida, además, el avance hacia el objetivo y un gráfico de **horas acumuladas** con el plan previsto y la estimación al ritmo actual.

Cómo se calcula:

- *Horas teóricas*: el horario previsto de la sesión; si no tiene, la duración prevista de la partida.
- *Horas reales*: inicio a fin real menos las pausas; si no hay horario, la duración escrita a mano. Las sesiones jugadas sin ningún dato real no suman horas reales (se avisa).
- Solo cuentan las sesiones **jugadas**. Las planificadas son futuras y las canceladas se cuentan aparte.
- *Asistencia*: presentes entre convocados (los jugadores que figuran en cada sesión).
- *Avance*: siempre sobre todas las sesiones de la partida (el filtro de año no le afecta). Si aún no hay sesiones con horario real, el ritmo usa la duración y la periodicidad previstas.

## Dónde se guardan las fichas

En **Firebase (Firestore)**, proyecto `fichas-ogoa`:

- `characters/{id}`: datos de cada ficha (+ fecha y correo de la última edición).
- `portraits/{id}`: el retrato de cada ficha, comprimido a JPEG.
- `players/{id}`: jugadores. Cada ficha guarda el enlace (`data.playerId`) y una copia del nombre (`data.player`).
- `campaigns/{id}`: partidas, con sus jugadores y personajes (`members`).
- `sessions/{id}`: sesiones de juego, con horarios y asistencia.
- `layouts/{id}`: layouts creados o modificados desde la web (páginas y zonas).
- `layoutImages/{id}__{página}`: la imagen de cada página subida, aparte por tamaño.

Al entrar por primera vez con esta versión, el nombre de jugador que tuviera escrito cada ficha se convierte en un jugador y la ficha queda enlazada (no se borra nada; los nombres iguales sin distinguir mayúsculas se agrupan).

Para entrar hay que **iniciar sesión con Google**, y solo pueden leer o escribir los correos autorizados en las reglas de Firestore. El código de la web es público, pero los datos no.

- **Dar o quitar acceso:** consola de Firebase → Firestore Database → Reglas → edita la lista de correos (cuentas de Google, en minúsculas) → **Publicar**. No hace falta tocar el código.
- **Copia de seguridad:** icono *Copia de seguridad* (abajo a la izquierda, en todas las vistas), que descarga un `.json` con todas las fichas, retratos, jugadores, partidas, sesiones y layouts guardados. El icono de al lado, *Importar*, la vuelve a subir: los jugadores con el mismo nombre se reutilizan y, por cada ficha, partida o layout que ya exista, pregunta si se sobrescribe, se crea otro o se deja como está. También importa fichas sueltas y layouts. Las copias antiguas, solo con fichas, siguen sirviendo.
- **Fichas antiguas:** si un navegador tenía fichas de la versión anterior (guardadas en el navegador), aparece el botón *Subir a la nube N fichas de este navegador*.
- El personaje de ejemplo (Jasper Stonehill) ya no está en el repositorio. Si hace falta, se importa desde la página de un jugador (*Importar*).

### Reglas de Firestore

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function autorizado() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email.lower() in [
          'correo.del.administrador@gmail.com',
          'correo.del.master@gmail.com'
        ];
    }
    match /{document=**} {
      allow read, write: if autorizado();
    }
  }
}
```

En *Authentication → Configuración → Dominios autorizados* debe estar `sukoruiz.github.io` (y `localhost` para probar en local).

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (por ejemplo `fichas-ogoa`).
2. Desde esta carpeta:
   ```bash
   git remote add origin https://github.com/TU_USUARIO/fichas-ogoa.git
   git push -u origin main
   ```
3. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)` → **Save**.
4. En un minuto estará en `https://TU_USUARIO.github.io/fichas-ogoa/` (la de este repositorio: <https://sukoruiz.github.io/fichas-ogoa/>).

Después, cada `git push` a `main` actualiza la web automáticamente en uno o dos minutos.

## Probar en local

Con Python instalado, desde esta carpeta (hace falta servirlo por http, no abrir el archivo directamente):

```bash
python -m http.server 8000
```

y abre <http://localhost:8000>.

*Descargar PDF* e *Imagen* cargan al usarlas, desde jsDelivr, las librerías `html2canvas`, `jsPDF` y `JSZip` (hace falta conexión).

## Estructura

```
index.html                 página
style.css                  estilos (pantalla e impresión)
app.js                     visor de fichas (campos, Markdown, retrato), acciones sobre fichas, importar/exportar, sesión
mesa.js                    jugadores (y sus fichas), partidas, sesiones y vista de estadísticas
export.js                  imprimir y exportar fichas a PDF o imagen (papel del layout, sin margen, doble cara)
ui.js                      ventana de pregunta (sobrescribir / crear / omitir) y utilidades
stats.js                   cálculos (horas, asistencia, periodicidad, avance hacia el objetivo) y gráficos
sheet.js                   Markdown, ajuste de letra y ficha de solo lectura (modo Ver, impresión y exportación)
editor.js                  editor de layouts (pestaña Layouts)
layouts/index.js           lista de layouts incluidos + los guardados en Firestore; tamaños de papel
layouts/fields.js          catálogo de campos, tablas y formato de un layout
layouts/ogoa-oficial-en.js layout "Oficial OGOA English"
layouts/periodico-es.js    layout "Periódico OGOA Español"
layouts/periodico-a3-es.js layout "Periódico A3 OGOA Español"
store.js                   acceso a Firebase (login con Google y Firestore)
firebase-config.js         configuración pública del proyecto Firebase
manifest.webmanifest       nombre e iconos de la web (para instalarla como app)
img/oficial-en-*.jpg       plantilla oficial en inglés (anverso y reverso)
img/periodico-es-*.png     plantilla "periódico" en español (anverso y reverso)
img/periodico-a3-es-*.png  plantilla "periódico" A3 en español (anverso y reverso)
img/icon.svg               icono de la web (cabaña en las montañas bajo la luna)
img/icon-*.png, img/apple-touch-icon.png   el mismo icono en PNG
```

Las plantillas de la ficha son © 2021 DeepNerd Media (Cypher System © Monte Cook Games); la propia hoja permite copiarla para uso personal.
