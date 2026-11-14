# Fichas de personaje · Old Gods of Appalachia

Web sencilla para que el Director de Juego cree, rellene e imprima fichas de personaje de *Old Gods of Appalachia* sobre la plantilla oficial (anverso y reverso).

No necesita servidor ni instalación: son archivos estáticos (HTML + CSS + JS) que se publican gratis con **GitHub Pages**.

**Acceso:** <https://sukoruiz.github.io/fichas-ogoa/>

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

En **Firebase (Firestore)**, proyecto `fichas-ogoa`:

- `characters/{id}`: datos de cada ficha (+ fecha y correo de la última edición).
- `portraits/{id}`: el retrato de cada ficha, comprimido a JPEG.

Para entrar hay que **iniciar sesión con Google**, y solo pueden leer o escribir los correos autorizados en las reglas de Firestore. El código de la web es público, pero los datos no.

- **Dar o quitar acceso:** consola de Firebase → Firestore Database → Reglas → edita la lista de correos (cuentas de Google, en minúsculas) → **Publicar**. No hace falta tocar el código.
- **Copia de seguridad:** botón *Exportar todas*, que descarga un `.json` con todas las fichas y retratos. *Importar .json* las vuelve a subir.
- **Fichas antiguas:** si un navegador tenía fichas de la versión anterior (guardadas en el navegador), aparece el botón *Subir a la nube N fichas de este navegador*.
- El personaje de ejemplo (Jasper Stonehill) ya no está en el repositorio. Si hace falta, se importa con *Importar .json*.

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

## Estructura

```
index.html                 página
style.css                  estilos (pantalla e impresión)
app.js                     lógica: campos, Markdown, sesión, importar/exportar
store.js                   acceso a Firebase (login con Google y Firestore)
firebase-config.js         configuración pública del proyecto Firebase
img/anverso.jpg            plantilla oficial (anverso)
img/reverso.jpg            plantilla oficial (reverso)
```

Las plantillas de la ficha son © 2021 DeepNerd Media (Cypher System © Monte Cook Games); la propia hoja permite copiarla para uso personal.
