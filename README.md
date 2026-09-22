# StudyHub

StudyHub es una aplicación web personal para organizar proyectos de estudio, administrar tareas, registrar sesiones de enfoque y conservar reflexiones de aprendizaje. Está construida con Vite, JavaScript moderno, HTML y CSS, sin frameworks de interfaz.

## Ejecutar localmente

Requisitos: Node.js 22 o una versión LTS compatible y npm.

```bash
npm install
npm run dev
```

Vite mostrará una dirección local, normalmente `http://localhost:5173`.

## Compilar y revisar la versión de producción

```bash
npm run build
npm run preview
```

La compilación queda en `dist/`.

## Pruebas

```bash
npm test
```

Las pruebas automatizadas cubren el estado versionado, fechas/calendario, los modos con tiempo y sin límite, duraciones personalizadas, reconstrucción del cronómetro, pausa y reanudación, varias sesiones con sus reflexiones, prevención de doble conteo, finalización de tareas, recarga, eliminación en cascada, exportación/importación, migración local, trabajo sin conexión y aislamiento entre cuentas.

## Desplegar en Netlify

El archivo `netlify.toml` ya define el comando y la carpeta de publicación.

### Desde un repositorio Git

1. Sube este proyecto a GitHub, GitLab o Bitbucket.
2. En Netlify, elige **Add new site → Import an existing project**.
3. Selecciona el repositorio. Netlify leerá automáticamente:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Despliega el sitio.

### Despliegue manual

1. Ejecuta `npm install` y `npm run build`.
2. Arrastra la carpeta `dist/` a Netlify Drop.

La navegación usa rutas hash (`#/projects/...`), por lo que una recarga directa funciona sin reglas SPA adicionales.

## Cómo usar la aplicación

- **Proyectos:** crea, edita o elimina proyectos; elige icono y color. Las tarjetas calculan tareas pendientes, completadas y progreso a partir de los datos reales.
- **Proyecto:** crea tareas con o sin fecha, cambia su estado desde el chip, filtra la lista y selecciona días del calendario. Las tareas sin fecha no aparecen en el calendario.
- **Modo enfoque:** abre una tarea y elige **Sin límite** para contar desde cero hasta que la detengas, o **Con tiempo** para escribir cualquier combinación válida de horas y minutos. La cuenta regresiva conserva el tiempo extra si continúas después de llegar a cero. Pausar no guarda una sesión; detener guarda exactamente el tramo pendiente y abre una reflexión opcional. Puedes omitirla sin perder el tiempo.
- **Reflexiones por sesión:** cada reflexión queda asociada a su sesión y aparece inmediatamente como `Sesión 1`, `Sesión 2`, etc. en la tarea y como `Clase 1`, `Clase 2`, etc. en el registro general del proyecto.
- **Completar:** primero guarda cualquier tiempo pendiente y abre el mismo formulario. La tarea solo se completa después de guardar la reflexión final; las sesiones y reflexiones anteriores se conservan.
- **Archivos de una tarea:** con una cuenta conectada a Supabase, puedes elegir archivos al crear la tarea o abrirla después en modo enfoque y usar **Adjuntar**. Es opcional, admite varios documentos de hasta 20 MB cada uno y muestra los archivos de esa tarea con un botón para descargarlos. Subir de nuevo un archivo con el mismo nombre sustituye la versión anterior, sin crear un duplicado.
- **Copias:** usa **Exportar copia** e **Importar copia** desde la barra lateral o el menú del perfil. La importación valida la versión antes de reemplazar los datos.
- **Empezar de cero:** los datos de ejemplo iniciales están identificados. Puedes limpiarlos desde el aviso o desde Ajustes.

## Persistencia

La fuente de verdad está separada de la interfaz:

- Con las variables de Supabase configuradas, `CloudStorageAdapter` sincroniza un snapshot atómico por usuario y conserva una caché/cola local independiente por cuenta.
- Sin configuración cloud, `LocalStorageAdapter` mantiene el funcionamiento local compatible con la versión anterior.
- El estado incluye `schemaVersion`, `revision` y `updatedAt` para migraciones futuras.
- El repositorio concentra todas las operaciones de proyectos, tareas, sesiones y reflexiones.
- El cronómetro guarda timestamps solo al iniciar, pausar, reanudar, detener o completar; los ticks visuales no escriben cada segundo.
- Al exportar un cronómetro activo, la copia lo convierte en una instantánea pausada para evitar tiempo fantasma al restaurarla.
- La importación JSON reemplaza el estado validado y lo sincroniza también con la nube.
- Si no hay conexión, los cambios quedan en una cola local y se reintentan al volver a estar en línea.
- Los adjuntos se guardan en un bucket privado de Supabase Storage, separado por usuario y tarea. No se incrustan en el estado JSON ni en las copias exportadas; se descargan solo cuando se solicitan. Subir, listar, descargar o borrar una tarea con adjuntos requiere conexión.

Los datos cloud se almacenan en Supabase Postgres y se recuperan al iniciar sesión desde otro dispositivo. El `localStorage` legado nunca se borra automáticamente: en el primer acceso a una cuenta cloud vacía, StudyHub pregunta si debe migrarlo.

## Configuración cloud

StudyHub utiliza Supabase Auth con correo y contraseña, y Row Level Security en Postgres. Cada usuario solo puede consultar o modificar su propia fila. El frontend usa exclusivamente la URL del proyecto y la clave pública publicable; no necesita claves administrativas ni la contraseña de la base de datos.

Configura en desarrollo o Netlify:

```env
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REEMPLAZAR
```

La migración SQL y la guía completa están en `supabase/migrations/` y `docs/cloud-setup.md`. No incluyas claves `sb_secret_`, `service_role`, contraseñas ni tokens privados en variables `VITE_` o en el repositorio.

## Estructura principal

```text
src/
  cloud/         cliente de Supabase y acceso por correo/contraseña
  data/          esquema, adaptador local y repositorio
  state/         store y selectores derivados
  timer/         actualización visual del cronómetro
  ui/            shell, componentes y eventos
  views/         Proyectos, Proyecto y Modo enfoque
  utils/         fechas, identificadores y texto seguro
  styles/        tokens, vistas, componentes y responsive
tests/           pruebas de dominio y utilidades
```

## Decisiones importantes

- Una tarea completada conserva su tiempo y reflexiones.
- Detener una sesión nunca completa la tarea; guardar u omitir su reflexión tampoco altera el tiempo ya acumulado.
- Elegir **Completada** desde un chip abre el mismo flujo de reflexión que el botón del modo enfoque.
- El reloj no se basa en contar intervalos; calcula el tiempo desde timestamps y sobrevive a una recarga.
- Solo puede existir una sesión activa en toda la aplicación.
- Los datos demo son opcionales y se pueden limpiar; una limpieza no vuelve a sembrarlos automáticamente.
