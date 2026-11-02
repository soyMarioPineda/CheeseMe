# CheeseMe

Esta extensión de Chrome salió de una conversación que ni siquiera era mía, solo la escuché por accidente en una fiesta. Dos chicas estaban hablando de cómo llevaban el control de los seguidores y seguidos de sus novios en Instagram. Lo gracioso es que una literalmente anotaba todo en una libreta o en las notas de su celular, y luego lo comparaba después para ver qué había cambiado.

Llegué a mi casa y tenía que construirlo.

Así que aquí está. Es open source.

Básicamente, entras al perfil de Instagram de alguien, ejecutas la extensión y esta genera todos los archivos que necesitas: seguidores, seguidos, personas que sigues y no te siguen de vuelta, personas que te siguen y tú no sigues, y seguidores en común. También genera un archivo de Excel para guardar versiones y rastrear cambios con el tiempo.

Ojalá algún día encuentren este repositorio.

## Cómo instalarla en tu navegador

La extensión todavía no está en la Chrome Web Store, así que se instala a mano en modo desarrollador. Toma un par de minutos.

Funciona en Chrome y en navegadores basados en Chromium: Edge, Brave, Opera, Arc, etc.

### 1. Descarga el código

- **Sin git:** en esta página de GitHub, haz click en el botón verde **Code → Download ZIP** y descomprime el archivo donde quieras.
- **Con git:**

  ```bash
  git clone https://github.com/soyMarioPineda/CheeseMe.git
  ```

No borres ni muevas la carpeta después de instalar la extensión: el navegador la carga directamente desde ahí.

### 2. Carga la extensión

1. Abre la página de extensiones de tu navegador:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
2. Activa el **Modo de desarrollador** (en Chrome está arriba a la derecha; en Edge, en el menú de la izquierda).
3. Haz click en **Cargar descomprimida** (*Load unpacked*).
4. Selecciona la carpeta **`followtracker/extension`**, la que tiene el archivo `manifest.json` adentro. No elijas la carpeta principal del repositorio.
5. Haz click en el ícono del rompecabezas 🧩 de la barra del navegador y fija **CheeseMe** para tenerla siempre a la mano.

### 3. Úsala

1. Inicia sesión en [instagram.com](https://www.instagram.com).
2. Abre el perfil que quieres revisar: el tuyo o el de cualquier cuenta que puedas ver (pública, o privada si la sigues).
3. Abre la extensión y haz click en **Escanear Completo**.
4. Espera a que termine; tarda más o menos 1 minuto por cada 1.500 cuentas. Puedes cerrar la ventanita de la extensión mientras tanto; el escaneo sigue en la pestaña de Instagram, solo no cierres ni recargues esa pestaña.
5. Revisa los resultados y, si quieres guardarlos, haz click en **Exportar CSV**. El archivo se abre en Excel o Google Sheets.

### Actualizarla

Cuando haya una versión nueva, descarga el código otra vez (o haz `git pull`), reemplaza la carpeta y, en la página de extensiones, haz click en el botón de recargar ↻ de CheeseMe.

### Problemas comunes

- **"Debes estar en instagram.com"**: abre la extensión estando en una pestaña de Instagram.
- **"Instagram está limitando las peticiones"**: hiciste muchos escaneos seguidos. Espera unos minutos y vuelve a intentarlo.
- **"Es una cuenta privada y no la sigues"**: Instagram no muestra las listas de cuentas privadas que no sigues.
- **El número no coincide exactamente con el del perfil**: Instagram no devuelve las cuentas desactivadas o restringidas, así que puede haber una pequeña diferencia.
