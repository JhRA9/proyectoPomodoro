# StudyHub 2.0 — Entrega de implementación

Fecha: 26 de octubre de 2026. Rama: `feat/studyhub-2`.

## Resultado y alcance

La experiencia Mesa de trabajo está implementada en la aplicación real, detrás de `workspaceV2`. Se reutilizan `StudyHubRepository`, los adaptadores, autenticación, sincronización, temporizador, archivos y formularios existentes. El prototipo HTML no se incrusta en la aplicación.

La versión estable continúa siendo la experiencia predeterminada. No se fusionó con `main`, no se desplegó en Netlify y no se aplicaron cambios ni migraciones a Supabase real. Tampoco se realizaron inferencias pagas.

Se revisaron los siete documentos obligatorios: Prototipo Progreso, Entrega Progreso, Reglas Propuestas, Pruebas RC1, Auditoría Final RC1, Diagnóstico y Plan de Implementación y Contexto Funcional para Rediseño. La matriz del diagnóstico se reproduce abajo como contrato de conservación. Las decisiones conservadoras del encargo prevalecen sobre las propuestas experimentales de RC1.

## Cómo probar

```sh
git switch feat/studyhub-2
npm ci
npm run dev -- --host 127.0.0.1 --port 5174
```

Abrir `http://127.0.0.1:5174/?localPreview=workspace#/home`.

Este modo existe solamente durante desarrollo. Usa almacenamiento local con el prefijo `studyhub:preview:workspace:`, datos de ejemplo y borradores separados. No inicializa la cuenta cloud ni escribe los datos de la aplicación estable. Las puntuaciones visibles en la captura proceden de una evaluación manual de prueba en ese espacio, no del aprendizaje real del usuario.

Para revisar la experiencia con un entorno de pruebas propio: `?workspaceV2=1#/home`. Esta segunda opción usa el adaptador configurado, por lo que no debe apuntarse a producción para pruebas de escritura. El menú de perfil permite activar la experiencia; Configuración y privacidad permite volver a la estable. `?workspaceV2=0#/projects` fuerza la interfaz estable sin eliminar datos. No usar `localPreview=workspace` junto con esta última prueba: el modo de demostración fuerza V2.

Recorrido recomendado:

1. Inicio → proyecto → Tareas / Aprendizajes / Mi progreso.
2. Abrir Agenda, cambiar proyecto, desplegar calendario, elegir día y consultar Completadas.
3. Abrir una tarea, iniciar/pausar/detener, guardar una reflexión con los campos opcionales vacíos; recargar.
4. Crear una competencia: comienza Sin evaluar. Registrar un ejercicio, escribir un borrador y recargar antes de guardarlo.
5. Registrar una revisión manual. Consultar Historial: un intento y su revisión; porcentaje provisional.
6. Editar la entrega del mismo ejercicio y guardar otra versión. El intento anterior mantiene su solución y rúbrica.
7. Añadir evidencia y registrar método, responsable y resultado de una verificación realmente realizada. La interfaz no ejecuta por sí sola las pruebas declaradas.
8. Guardar balance semanal y exportar un informe Markdown/JSON. Exportar también una copia completa antes de experimentar con la conversión histórica.

## Funcionalidades implementadas

- Navegación Inicio, Proyectos, Enfoque, Resultados, proyectos completados y Configuración y privacidad; perfil completo pulsable y Volver contextual.
- Interfaz oscura RC1 con estilos aislados, composición adaptable, paneles retráctiles y preferencias persistentes.
- Agenda global de tareas pendientes y completadas, filtro por proyecto, calendario desplegable de 42 días y filtro por fecha. Se conservan los siete grupos de urgencia y las ocurrencias diarias.
- Proyecto con Tareas, Aprendizajes y Mi progreso. Los aprendizajes usan las tablas y acciones reales de edición/eliminación e imágenes.
- Enfoque conserva reloj circular, colores verde/azul/rojo, modos con tiempo/sin límite, fecha/hora, notas, historial, sesiones y adjuntos cuando hay servicio cloud.
- Mi progreso: competencias, ejercicios, evidencias, historial paginado y filtrable, revisión semanal, configuración e informes.
- Medidores con geometría compartida, colores diferenciados por área, estado Sin evaluar/Pendiente y cobertura separada del dominio. Los colores existentes no cambian al añadir otra área al final del conjunto.
- Una entrega = un intento. Cada revisión manual/Gemini/Cloudflare conserva sus criterios, resultado original, modelo, rúbrica y trazabilidad. Solicitar después el segundo proveedor conserva el mismo intento.
- Comparación específica Gemini/Cloudflare y resolución explícita con historial de decisiones; sin promedio automático.
- Edición de la entrega para generar una nueva versión sin duplicar el ejercicio ni destruir resultados anteriores.
- Evidencia con procedencia, historial de verificación y eliminación confirmada; eliminar una evidencia no elimina los intentos.
- Recomendaciones convertibles en tareas mediante el formulario existente; detección de una tarea del mismo proyecto con el mismo título normalizado.
- Borradores de formularios de progreso por cuenta y entidad; conservación tras recarga y limpieza después de guardar. No se guardan contraseñas ni archivos del selector en estos borradores.
- Flujos de IA con vista previa del contenido, estados derivados de la solicitud, espera cancelable, respuestas tardías descartadas, fallos parciales y reintentos del mismo intento. No hay respuestas simuladas en producción.

## Modelo de datos y compatibilidad

Se conserva `schemaVersion: 2`, el contenedor compatible de copias y snapshots. Se añade una versión independiente `evaluationModelVersion: 2`; los registros nuevos usan `attemptVersion: 2`. Los normalizadores preservan los campos adicionales.

| Entidad | Campos/adaptación |
|---|---|
| Evaluación/intento | `reviews`, `requestedProviders`, `canonicalResult`, `resolutionHistory`, `evidenceSnapshot`, `evidenceSignature`, `ruleSetId`, `areaSetVersion`, `errors`, `provenance` |
| Revisión | Resultado original, proveedor/modelo, criterios, rúbrica y versión, versión del prompt, recepción y referencia a la solución |
| Ejercicio | `submissionVersion`; editar conserva ID e incrementa versión |
| Proyecto | `areaSetVersion`, historial del conjunto de áreas y `weeklyReviews` |
| Evidencia | `verification`, `verificationHistory`: método, actor, fecha, versión, descripción y firma de la solución |
| Solicitudes IA | Reserva de solicitud pendiente, fallo/éxito, consumo reportado; los fallos cuentan para el límite local |

La firma local es una representación exacta del contenido y la rúbrica, no una prueba criptográfica de autoría. Puede contener código; por eso los informes que excluyen código también excluyen firmas, snapshots y código anidado. Las copias completas contienen los datos de estudio y deben tratarse como privadas.

Las operaciones del repositorio se serializan para evitar que dos respuestas concurrentes sobrescriban mutuamente sus revisiones. Se mantienen los adaptadores y sus controles de cuenta/revisión.

### Reglas de indicadores

Una revisión IA aporta una nota provisional. Dos proveedores conservan notas separadas hasta una resolución trazable. La independencia continúa como criterio y condición de validación, sin un factor de penalización adicional. El dominio general conserva el promedio existente de al menos dos competencias validadas; no se adopta `Sᵢ × Rᵢ`. Los registros nuevos necesitan evidencia identificada y vinculada a la solución para participar como dominio validado. Una nota IA nueva sin verificar tampoco hereda la validación de intentos antiguos.

La tendencia no penaliza mejoras rápidas. Las áreas nuevas empiezan Sin evaluar y modifican la cobertura versionada, no aportan ceros a la media. Los umbrales 15/1 son referencia experimental, no una regla de dominio. Las reglas de pesos y dependencias de entregables permanecen separadas. Estos indicadores no constituyen un modelo científico validado de competencia profesional.

## Migración y reversión

No hay migración automática al activar la interfaz. Los registros históricos se presentan mediante una adaptación conservadora en memoria. Cada registro antiguo permanece independiente, aunque coincidan ejercicio y fecha.

En Configuración y privacidad:

1. Preparar copia: conserva el snapshot íntegro, lo serializa, lo vuelve a leer y comprueba igualdad exacta; también permite descargarlo.
2. Convertir historial: exige que el estado no haya cambiado desde la copia. Envuelve cada evaluación histórica con su original, sin fusionarla con otras.
3. Revertir conversión: solo se permite si no hay cambios posteriores a esa revisión. Restaura el historial previo conservando las demás entidades.

La comprobación de copia detecta inconsistencias accidentales; no es una firma de autenticidad frente a modificaciones deliberadas. Si se trabajó después de convertir, la reversión rápida se bloquea para no perder trabajo. Primero exportar el estado actual y comparar ambas copias; no restaurar una copia antigua a ciegas. La interfaz estable de esta rama puede leer los nuevos campos, pero no muestra todas las revisiones: volver visualmente no debe confundirse con desplegar un binario histórico que desconozca el modelo.

## Integración de IA y cambios de servidor preparados

`VITE_WORKSPACE_AI_V2_READY=false` es el valor recomendado hasta completar staging. La interfaz muestra una limitación explícita y permite evaluación manual. La bandera no es un mecanismo de autorización; el servidor valida la identidad autenticada.

Preparados, sin ejecutar en remoto:

- `supabase/migrations/202610250001_evaluation_requests.sql`: registro duradero por usuario/solicitud y contador diario; RLS activado, acceso directo revocado a anon/authenticated, RPC limitada a service_role.
- `requestStore.ts`: verificación de usuario, hash SHA-256 del contenido, recuperación de respuesta guardada, rechazo de IDs con otra solución, solicitudes en proceso y estados inválidos.
- Función `studyhub-evaluate`: conserva el contrato anterior; para V2 reclama el ID antes de inferir y guarda la respuesta antes de confirmar éxito. Si falta infraestructura, falla antes de invocar al proveedor.

El límite de servidor preparado es 100 solicitudes por cuenta/día UTC; el proyecto conserva su límite diario local configurable. No es una garantía de coste cero ni un control de presupuesto monetario. El uso real se prueba solo con autorización y límites del entorno de staging.

Cancelar detiene la espera y el guardado tardío del cliente; no garantiza cancelar una inferencia ya recibida por el proveedor. Si el servidor termina, reintentar recupera la respuesta cacheada. Si la ejecución termina abruptamente después de reclamar el ID y antes de guardar, queda `processing` y se bloquea otra inferencia. Requiere inspección administrativa; no expira automáticamente para evitar cobros duplicados por incertidumbre.

Para habilitar posteriormente: hacer copia del entorno de pruebas, aplicar la migración allí, desplegar la función allí, configurar secretos solo en el servidor, validar acceso de dos cuentas y concurrencia, probar respuesta/reintento/cancelación/fallo parcial y después habilitar la bandera en ese entorno. Nada de esto se ejecutó contra datos reales.

Reversión de servidor: desactivar la bandera, detener nuevos envíos V2 y volver a la función anterior solo tras verificar solicitudes pendientes. Conservar las tablas y sus respuestas para auditoría; no eliminarlas como parte de una reversión habitual. La migración es aditiva y no transforma proyectos, tareas o archivos existentes.

## Pruebas ejecutadas

Línea base: 118 pruebas en 23 archivos. Resultado final: **163 pruebas en 26 archivos**, más compilación de producción correcta y `git diff --check` sin errores. La sintaxis TypeScript de ambas fuentes de la función se transformó con esbuild. Esto no sustituye ejecutar Deno/Postgres/RLS en staging.

Las pruebas añadidas cubren: identidad de intentos, dos revisiones, solicitudes concurrentes, segundo proveedor solicitado después, reintento parcial, no doble conteo, edición/versionado, cuota fallida recuperable, resolución trazable, evidencia ligada a la solución, IA sin validación automática, conservación histórica, copias/reversión, recarga, exportación privada, colores por área, navegación, calendario, borradores, escape de contenido y manejo de red/cancelación con transporte simulado. Las simulaciones están en pruebas, no sustituyen el servicio de la aplicación.

Comprobaciones reales de navegador con datos aislados:

- Creación de competencia y ejercicio; borrador recuperado tras recarga; evaluación manual y porcentaje provisional en historial/medidor.
- Iniciar → notas → detener → reflexión con campos opcionales vacíos → recargar: una sesión de 10 segundos y una reflexión conservadas; tarea En curso.
- Agenda, calendario global, navegación por teclado con Enter, panel lateral y estados de servicio no disponible.
- Inicio, Proyecto, Progreso y Enfoque en 320, 390, 740, 1024 y 1440 px sin desbordamiento horizontal global. Mediciones en `studyhub2/responsive-checks.json`.
- Calendario global a 320 px: botones 44 × 44 y desplazamiento interno. Captura final de escritorio en `studyhub2/workspace-desktop.png`.
- Consola de la pestaña final sin errores capturados.

No se ejecutó una auditoría con NVDA/VoiceOver ni pruebas en un móvil físico. Tampoco se hicieron operaciones reales de Auth, Storage, RLS o inferencias; sus contratos se comprobaron con las pruebas existentes y nuevas simulaciones de red.

## Matriz de conservación

“Conservado” indica comandos/adaptadores reutilizados y pruebas ejecutadas; no implica una nueva certificación remota en producción.

| Contrato del diagnóstico | Resultado en V2 | Evidencia automatizada principal |
|---|---|---|
| CRUD proyecto y cascada | Conservado, Inicio/Proyectos y formularios reales | `repository`, `task-files-app` |
| Completar/reabrir proyecto | Conservado, sección independiente | `project-completion` |
| CRUD tarea | Conservado, Proyecto/Enfoque | `repository`, `task-creation-files` |
| Categorías y pestañas | Conservado, activas/completadas y filtros | `task-categories`, `project-task-tabs` |
| Temporizador ambos modos | Conservado con reloj circular | `timer-modes` |
| Pausar/detener/completar | Conservado, una finalización por tramo | `completion-action`, `session-reflections` |
| Sesiones y acumulación | Conservado | `session-reflections`, `repository` |
| Reflexión por sesión | Conservada con borrador | `session-reflections`, `learning-notes` |
| Editar/eliminar aprendizaje | Conservado sin borrar el tiempo | `learning-notes` |
| Imágenes de aprendizaje | Componentes originales reutilizados | `learning-notes`, `routing-and-security` |
| Adjuntos privados | Conservados, requieren cloud como antes | `task-files`, `task-files-ui`, `task-files-app`, `task-creation-files` |
| Fecha/hora local y AM/PM | Conservadas | `time`, `repository` |
| Recurrencia diaria | Conservada; calendario deriva ocurrencias | `recurring-tasks`, `workspace-ui` |
| Agenda y grupos excluyentes | Adaptada con completadas/calendario global | `sidebar-layout`, `workspace-ui` |
| Calendario de proyecto | Conservado junto al global | `time`, `recurring-tasks` |
| Importación educativa | Acceso independiente, vista previa y deduplicación | `learning-path-import` |
| Copia JSON | Conservada; campos nuevos compatibles | `repository`, `workspace-attempts` |
| Informes Markdown/JSON | Conservados; incluyen revisiones y privacidad anidada | `evaluation-progress`, `workspace-attempts` |
| Sincronización/offline | Adaptador, caché y cola conservados | `cloud-persistence`, `cloud-security` |
| Auth/cierre de sesión | Conservados; perfil/configuración | `settings-menu`, `cloud-security`, `migration-dialog` |
| Competencias/subcompetencias | Conservadas, cobertura versionada, medidores | `evaluation-progress`, `workspace-attempts`, `workspace-ui` |
| Criterios/rúbrica | Pesos y versiones conservados | `evaluation-progress`, `workspace-attempts` |
| Historial | Intentos/revisiones, filtro, paginación, adaptación histórica | `workspace-attempts` |
| Evaluación manual | Atómica, provisional, deduplicada por entrega | `workspace-attempts` |
| Gemini/Cloudflare | Integración preparada y protegida hasta staging | `ai-evaluation-client`, `workspace-ui`, `workspace-request-store` |
| Evidencias | Procedencia/verificación versionada y eliminación | `evaluation-progress`, `workspace-attempts` |
| Recomendación a tarea | Formulario existente y detección de título duplicado | Revisión de enlace/comando; duplicado por título normalizado |
| Entregables/pesos/dependencias | Reutilizados, separados del dominio académico | `evaluation-progress` |
| Laterales/preferencias | Revestidos, rieles y controles móviles | `sidebar-layout`, `workspace-ui`, mediciones de navegador |
| Búsqueda/perfil | Normalización existente, perfil completo pulsable | `settings-menu`, `task-categories`, navegación de navegador |

## Pendientes y recomendación

Lista para **revisión integral local**, con todas las pruebas de código ejecutadas correctamente. No se recomienda todavía fusionar o publicar la nueva experiencia sin validar la integración de servidor en staging y recorrerla con el usuario.

Pendientes externos concretos: aplicar/probar SQL y Edge Function en staging; verificar RLS con dos cuentas reales, adjuntos privados y recuperación de solicitudes con proveedores reales; validar modelos/credenciales/cuotas disponibles; prueba táctil física y lector de pantalla. Los servicios existentes no se sustituyeron por mocks permanentes.

La sugerencia automática de nuevas áreas por IA figuraba como expansión separada en el diagnóstico y no tiene un servicio existente definido. No se añadió un botón ficticio para ella: las áreas se crean manualmente o se importan desde una ruta educativa. No se implementó una nueva fórmula científica ni una combinación automática de proveedores.

Las copias de esta entrega son compatibles dentro de esta rama. Antes de un futuro despliegue se debe verificar la política de convivencia con clientes antiguos: un cliente anterior puede conservar campos adicionales, pero no representa ni aplica todas las reglas nuevas de intentos. Desactivar la interfaz V2 de esta rama es la reversión visual prevista.
