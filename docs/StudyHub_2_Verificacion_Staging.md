# StudyHub 2.0 — Verificación local de staging

27 de octubre de 2026 · Rama `feat/studyhub-2` · Base `443c32a`.
El commit de este informe se obtiene con `git log -1 --format=%H -- docs/StudyHub_2_Verificacion_Staging.md` y se indica en la entrega del chat.

## Veredicto

**Lista con condiciones para la decisión de publicación. El bloqueo de verificación local de staging está cerrado.** Se ejecutaron Auth, Postgres/RLS, Storage, concurrencia, sincronización, migración/restauración SQL y el manejador de la Edge Function dentro del motor oficial con transporte sintético. Se encontró y corrigió una pérdida de actualizaciones concurrentes.

No se ha verificado el despliegue cloud ni la inferencia real de Gemini/Cloudflare. No habilitar las banderas de IA real hasta completar una prueba autorizada con los modelos, permisos y cuotas del entorno de destino. Mantener la condición previa de revisión con móvil físico y lector de pantalla, que esta ejecución no sustituye. La publicación y activación final siguen requiriendo la decisión del usuario.

No se hizo merge, push ni despliegue. `main` se conserva en `4210809303a0dad2825c3bde2324196eda5992a4`. No se utilizaron cuentas, claves, snapshots ni servicios de producción. No se realizaron inferencias pagas.

## Entorno y problema de arranque resuelto

- Docker Desktop ya estaba instalado. Se inició y se verificó su motor Linux, versión **29.4.3**. Aunque `wsl --status` indicaba que WSL no estaba instalado, Docker sí funcionó; no fue necesario instalar WSL ni elevar permisos.
- Supabase CLI **2.122.0**, descargada mediante npm y fijada en los scripts de esta entrega. No se añadió como dependencia de la aplicación ni se modificó su lockfile.
- Proyecto desechable `.tmp/studyhub-staging`, con `project_id = "studyhub-staging"`. Solo se copiaron las cuatro migraciones y la función del repositorio; no se copiaron enlaces ni secretos. Las claves locales se obtienen en memoria desde `supabase status` y no se imprimen ni se incluyen en Git.
- Postgres **17.11.0.006**, Auth, REST, Storage y Kong reales. Red Docker propia `studyhub-staging-local`. Solo se dirigieron pruebas al endpoint `http://127.0.0.1:54321`.
- La CLI falló primero con EOF al crear Edge Runtime y después quedó atascada en `docker cp - ...:/`. Los montajes de archivos de Windows también quedaron bloqueados. No se reinició Docker ni se interrumpieron los contenedores de otros proyectos.
- Solución reproducida: `prepare-local-staging.ps1` inicia los servicios sin el bootstrap de Edge Runtime. `start-staging-edge.ps1` inicia la imagen oficial **edge-runtime:v1.77.8**, pasando el código al contenedor desechable sin montaje ni copia por stdin. El manejador, `requestStore.ts` y `areaSuggestions.ts` son los archivos reales, sin modificar. Un bootstrap exclusivo de pruebas valida las sesiones contra Auth local y sustituye únicamente las respuestas de los proveedores. Bloquea cualquier otro destino externo.
- Esto verifica el código de la función en Deno/Edge Runtime con Auth y almacenamiento reales; **no equivale a verificar la configuración JWT del despliegue gestionado de Supabase**. La validación de sesión del bootstrap es una llamada real a Auth local.
- La CLI publica los puertos de sus servicios en las interfaces del equipo, incluso con la opción de red de loopback. No se usaron datos reales. Al terminar se detuvieron únicamente los servicios StudyHub, eliminando sus puertos de escucha. El motor sintético usa explícitamente `127.0.0.1:54328`.
- El contenedor original `supabase_edge_runtime_studyhub-staging` quedó sin arrancar, en estado `Created`, por el bloqueo de archivos de Docker. No contiene cuentas de producción ni sirve peticiones. Puede limpiarse después de reiniciar Docker Desktop cuando los otros proyectos permitan hacerlo; no bloqueó las pruebas realizadas por la alternativa. No se prescribe reinstalar Docker o WSL. El script de preparación reanuda directamente los siete contenedores locales existentes para evitar que la CLI vuelva a inspeccionar ese contenedor atascado; comprueba la salud de la base, Auth y Storage antes de continuar.

## Resultados ejecutados

Evidencia resumida sin claves: [staging-results.json](studyhub2/staging-results.json).

| Verificación | Resultado comprobado |
|---|---|
| `scripts/verify-local-staging.mjs` | **passed**, 22 comprobaciones de integración |
| Auth | Dos cuentas sintéticas, inicio de sesión real y eliminación al terminar |
| RLS | Rechazo de lectura, escritura, borrado y cambio de propietario entre cuentas; acceso anónimo bloqueado |
| Storage | Bucket privado; subir, descargar, reemplazar, firmar y limpiar; otra cuenta no lee, firma, enumera, sube ni elimina archivos ajenos |
| Historial en PostgREST | Dos evaluaciones antiguas conservadas y un intento con dos revisiones; migración conservadora y reversión del snapshot |
| Concurrencia de solicitudes | Una reserva ganadora; otra en procesamiento; caché, conflicto de contenido, reintento y separación por cuenta |
| Dos clientes | Dos sesiones autenticadas independientes con SDK, gateway y repositorio reales; una escritura gana y la otra queda recuperable |
| Offline | Cambios locales sobreviven a la reconstrucción del cliente y se sincronizan al reconectar |
| Conflictos | Sobreviven a recarga; recuperación explícita conserva copia local antes de cargar la nube |
| Respuesta perdida | Se descarta deliberadamente la respuesta después de un guardado real; el reintento recupera exactamente el mismo snapshot, sin repetir proyecto ni revisión |
| Sincronizar ahora | Trae los cambios del segundo cliente al repositorio abierto, sin recargar la página |
| Edge Runtime | Sesión real, caché durable, dos revisiones separadas, solicitudes concurrentes, fallo parcial, cancelación y recuperación tardía, sugerencias sintéticas |
| `scripts/verify-staging-history.mjs` | **passed**, 5 comprobaciones SQL/copias |
| Copia SQL | `pg_dump` real de `studyhub_states`, SHA-256 verificado; se aplican las migraciones v2 y se restaura el archivo SQL original |
| Compatibilidad | Campos históricos/desconocidos, evaluaciones, revisiones y datos anteriores conservados; igualdad completa de la fila después de restaurar |
| Batería final | **194 pruebas correctas, 30 archivos** |
| Compilación | Correcta, **88 módulos**, JS 518,57 kB / gzip 142,52 kB |
| Formato | `git diff --check` sin errores; avisos normales LF/CRLF |

El SHA-256 de la última copia SQL verificada fue `2a6432d2d04f83f83fe0df0867dc2f48d4ae1b65a3eb0d8ba210345d3be6b94e`. La copia contiene únicamente fixtures y permanece ignorada por Git en `.tmp/studyhub-staging/evidence/history-before.sql`. La restauración comprobada es de **datos del snapshot**, no una eliminación/reversión de tablas de seguridad. Las migraciones y RLS permanecen instaladas.

La pérdida de conectividad, almacenamiento del navegador y pérdida de respuesta se controlan en el ejecutor; los clientes usan HTTP real contra el servidor local. No se ha afirmado que estas pruebas fueran dos navegadores físicos. La batería de interfaz y tamaños del cierre anterior se conserva; no se repitió un rediseño ni se declaró una nueva validación táctil.

## Defecto reproducido y corrección

La primera prueba de concurrencia falló con `Only one concurrent snapshot may win: 2 !== 1`. El gateway usaba `upsert` incondicional, por lo que ambos clientes creían haber guardado aunque uno sobrescribía al otro.

Ahora la escritura compara atómicamente la revisión remota leída. La revisión base se conserva por cuenta para la cola offline. Una cola antigua sin revisión conocida se protege como conflicto en lugar de sobrescribir datos. Los reintentos reconocen únicamente snapshots idénticos y no pueden retroceder versiones. Las subidas se serializan y una respuesta anterior no borra una edición más reciente de la cola.

Los conflictos mantienen los datos locales y muestran un mensaje explícito. En Configuración/perfil está **Guardar copia local y cargar nube**: descarga JSON, conserva además una copia local independiente y carga la versión remota. No mezcla cambios automáticamente ni fuerza una escritura. La copia puede revisarse antes de restaurarla. También se corrigió **Sincronizar ahora** para recibir cambios remotos, además de subir los pendientes.

No se agregó una migración SQL ni cambió el formato de los snapshots. Se agregaron claves de almacenamiento local por cuenta para la revisión base y las copias de conflicto. La cola local usa un envoltorio versionado `queueVersion: 2` que une cada snapshot a su revisión base y escritor; así otra pestaña no puede sustituir accidentalmente esa base. Las colas antiguas siguen legibles y se protegen como conflicto si carecen de una base verificable. Se conservan los adaptadores, repositorio, historial y reglas existentes. Se añadieron siete pruebas de regresión y se repitió toda la batería.

**Compatibilidad de clientes:** versiones antiguas ya publicadas aún usan el `upsert` anterior. Esta corrección protege los clientes nuevos entre sí; no puede convertir un cliente antiguo abierto en un escritor seguro. Al publicar, cerrar/actualizar las pestañas antiguas antes de trabajar desde varios dispositivos. La reversión visual dentro de esta rama conserva la compatibilidad. Antes de volver a un binario antiguo, sincronizar o exportar las colas pendientes: ese binario no entiende `queueVersion: 2`. No se probó ni se promete fusión automática de ediciones concurrentes.

## Repetir las verificaciones

Desde esta rama, con Docker Desktop abierto:

```powershell
./scripts/prepare-local-staging.ps1
./scripts/start-staging-edge.ps1
./scripts/run-local-staging.ps1 -Check integration
./scripts/run-local-staging.ps1 -Check history
npm test
npm run build
./scripts/stop-local-staging.ps1
```

El ejecutor de historial exige que no existan otros snapshots en la instancia local; se niega a respaldar/restaurar una tabla con datos ajenos. Ejecutar las pruebas secuencialmente. Ambos ejecutores eliminan solo sus usuarios y archivos sintéticos; un error de limpieza hace fallar la ejecución. No usar `link`, `db push`, referencias remotas ni claves de producción. Los logs locales pueden contener claves desechables impresas por la CLI: no compartirlos ni agregarlos a Git.

La preparación se basa en el [procedimiento local oficial de Supabase](https://supabase.com/docs/guides/local-development/cli/getting-started). No es necesario aceptar un plan ni comprar servicios para repetir estas pruebas.

## Qué falta para proveedores reales y publicación

Para una prueba real, harían falta **autorización explícita de gasto y un límite monetario fijado por el usuario**, una clave Gemini de un proyecto separado, un modelo disponible, y un token Cloudflare con permiso Workers AI, su identificador de cuenta de pruebas y modelo disponible. Configurarlos solo como secretos del servidor. No enviar claves por el chat ni usar prefijo `VITE_` para secretos.

Propuesta de límite técnico para esa prueba, aún no autorizada: una evaluación Gemini, una Cloudflare y una solicitud de sugerencias; perfil rápido, máximo 14.000 caracteres de entrada por evaluación, 1.800 tokens de salida por evaluación y 2.500 para sugerencias; contexto sintético sin archivos privados; ningún reintento automático que produzca otra inferencia. Los precios y el límite monetario deben verificarse y acordarse antes de ejecutarla.

Quedan sin ejecutar: inferencia real, cuotas/latencias reales, despliegue gestionado de la función, configuración efectiva de un entorno cloud, móvil físico y lector de pantalla. Persiste el aviso de tamaño de bundle superior a 500 kB; el build no falla. No se identificó otro defecto funcional reproducible dentro de estas verificaciones locales.

La próxima decisión puede basarse en estos resultados: publicar conservando IA deshabilitada mientras se valida el entorno externo, o completar primero esa validación autorizada. **Esta entrega no publica ni activa nada.**
