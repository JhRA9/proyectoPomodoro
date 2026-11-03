# StudyHub 2.0 — Contrato de continuidad y ampliación para aprobación

**Registro de aprobación.** El usuario aprobó posteriormente las etapas A–F para desarrollo en `feat/studyhub-2`, con pruebas exclusivamente desechables, commits locales y conservación del historial. El texto siguiente conserva la propuesta tal como se presentó. El resultado de ejecución y sus límites figuran en [la entrega](StudyHub_Ampliacion_Entrega.md).

2 de noviembre de 2026. Propuesta contrastada con `feat/studyhub-2`, HEAD `a1cceae`, incluyendo los cambios de consolidación aún sin commit. No constituye implementación ni aprobación de publicación.

Este documento se entrega fuera del repositorio: no se modificó código ni se crearon commits durante esta revisión. La sección 18 del nuevo encargo exige presentar este contrato para aprobación antes de modificar el repositorio. La aprobación solicitada comprende el desarrollo descrito, no la activación cloud, publicación, importación de datos reales ni nuevas inferencias.

## 1. Base y documentación efectiva

| Documento leído | Ubicación y correspondencia |
|---|---|
| StudyHub_2_Entrega_Implementacion.md | `docs/`, último commit del archivo `bf367c8`; antecedente de esta rama |
| StudyHub_2_Cierre_Candidato.md | `docs/`, último commit `8c28a96`; incluye actualización histórica |
| StudyHub_2_Verificacion_Staging.md | `docs/`, último commit `8c28a96`; integración local histórica |
| StudyHub_2_Validacion_Cloud_Final.md | `docs/`, último commit `fd3f154`; infraestructura cloud anterior, no validación del nuevo planificador |
| StudyHub_2_Cierre_IA_Real.md | `docs/`, último commit `fd3f154`; tres inferencias sin resultados aceptados |
| StudyHub_Planificacion_Contrato.md | `docs/planning/`, commit `a1cceae` |
| StudyHub_Planificacion_Entrega.md | `docs/planning/`, implementación de `a1cceae`, con enlace local añadido a consolidación |
| StudyHub_Planificacion_Consolidacion.md | `docs/planning/`, documento de trabajo aún sin commit; evidencia del cierre más reciente |
| Cubo_LED_Auditoria_Visual_70_paginas.md | `C:/Users/jonys/Downloads/`, fecha de corte 31/10/2026; contexto externo, no evidencia propia |
| Cubo_LED_Plan_Maestro_v02.md | Misma carpeta, versión 0.2, 31/10/2026; conserva incertidumbres y pesos sin definir |
| StudyHub_Planificador_Dinamico_Propuesta_v02.md | Misma carpeta, versión 0.2; distingue producto, aprendizaje, actividad y certeza |
| Continuación de implementación y mejoras integrales | **No localizado como documento independiente** en repositorio, Downloads y adjuntos de texto examinados. Dos adjuntos lo citan, pero contienen el encargo de continuidad actual. No se infieren requisitos adicionales de su título. |

Los tres documentos externos no están versionados en Git; no se les atribuye un commit. Se tomarán hashes de las fuentes de prueba cuando se construya el caso aislado, sin incluir documentos privados indiscriminadamente en el repositorio.

Confirmación ejecutada durante esta revisión: `npm test -- --reporter=dot`, **276/276 pruebas, 35 archivos, cero fallos**. `git diff --check` correcto. La compilación correcta, 22 verificaciones Supabase local y 6 comprobaciones SQL corresponden a la ejecución anterior del 1 de noviembre, registrada en `consolidation-verification.json` y `consolidation-staging.json`; no se presentan como pruebas repetidas hoy. No hubo llamadas a IA ni acceso a producción. `main` permanece en `4210809303a0dad2825c3bde2324196eda5992a4`.

La entrega A tiene comprobada su base local, pero no está cerrada para activación cloud: importar planes locales aún se rechaza de forma segura; falta unificar entregables y resolver crecimiento del historial. Las pruebas de rechazo no equivalen a una migración exitosa.

## 2. Matriz de reutilización y fuente de verdad

| Requisito | Base real que se conserva | Ampliación y autoridad única | Aceptación |
|---|---|---|---|
| CRUD, proyectos, recurrencias, agenda, tiempo y reflexiones | `StudyHubRepository`, `src/state/selectors.js`, formularios y adaptadores actuales | Se vinculan por ID desde Plan; no se crean copias de tareas, sesiones ni horas | Regresión completa y flujo tarea → sesión → reflexión → recarga |
| Contexto, objetivos, etapas, hitos, actividades y subtareas | `src/planning/engine.js`: brief, items, parentId | Ampliar tipos y parentescos permitidos para objetivos y subtareas; el árbol usa estos mismos registros | CRUD, jerarquías, referencias eliminadas y ciclos |
| Entregables | Colecciones antiguas `deliverables`/`deliveryStages` y elementos actuales del plan | **Adopción explícita por proyecto:** catálogo del plan como autoridad tras conversión; registros antiguos archivados sin edición. Antes de adoptar, se conserva el modo anterior y no se permiten dos catálogos activos | Correspondencias por ID, sin deduplicación por nombre; ambas vistas editan la misma entidad; historial original intacto |
| Dependencias, bloqueos, riesgos, fuentes y decisiones | Motor de comandos, replay y propuestas | Relaciones tipadas entre entidades existentes del mismo proyecto; datos faltantes y procedencia explícitos | Ciclos bloqueantes rechazados, informativos permitidos, cambios atómicos |
| Competencias y conocimientos | `competencies`, `evaluation/progress.js`, requisitos del plan | Requisitos del plan referencian competencias existentes; no nace otro catálogo de competencias ni otro dominio académico | Sin evaluar hasta resultados propios; conocimiento requerido no implica demostrado |
| Entrega técnica/académica compartida | `exercises`, `submissionVersion`, `evaluations`, `evaluation/attempts.js` | Ampliar la entrega existente con propósito técnico/académico/ambos y vínculos. Versiones enviadas inmutables; revisiones académicas y decisiones técnicas separadas, referidas a la misma entrega | Una entrega y sus archivos, un intento, varias revisiones; uso exclusivamente técnico no altera indicadores académicos |
| Evidencias | `state.evidence`, evidencia del plan y verificación histórica | Catálogo compartido de evidencia; Plan conserva vínculos a criterios y decisiones de verificación, no otra copia editable del contenido | Cambios invalidan solo decisiones dependientes; evidencias históricas preservadas |
| Categorías | Actualmente `task.category` es texto; no existe catálogo reutilizable con icono/color | Catálogo por cuenta con ID estable; tareas y proyectos referencian IDs. Comandos de crear, editar, reasignar y eliminar | No perder etiquetas antiguas; referencias seguras al eliminar; aislamiento por cuenta |
| Archivos | `TaskFileStore`, bucket privado, límites y limpieza existentes | Extender almacenamiento para versiones inmutables y referencias compartidas; bytes fuera del snapshot; originales y vistas previas separados | Hash de subida/descarga, permisos, reemplazo, revocación y limpieza sin borrar un archivo todavía referenciado |
| Avance | `planMetrics` y componente `workspace/gauges.js` | Medidor central reutiliza el cálculo del plan. El valor antiguo queda identificado como histórico tras adopción | Sin calcular cuando faltan alcance/pesos/criterios; tareas y horas no otorgan avance |
| Historial y revisión semanal | Eventos/versiones del plan, intentos, `project.weeklyReviews` | Selectores agregan hechos con enlaces a sus registros; comando específico de revisión semanal. La colección superior `weeklyReviews` no se convierte en una segunda autoridad | Sin duplicar eventos; reflexión libre preservada; imprevisto genera propuesta pendiente |
| Árbol interactivo | items, parentId, dependencies, blockers | Proyección gráfica y lista accesible del mismo modelo; posiciones, zoom y expansión son preferencias de vista | Explorar no cambia revisión ni datos; selección, búsqueda, dependencias cruzadas y siguiente actividad habilitada |
| Exportación | Copia JSON, `evaluation/report.js`, exportación actual del plan | Servicio de paquete de revisión ZIP con selección, cierre de referencias, manifiesto y hashes; separado de restauración | Completo/parcial, privacidad, archivos faltantes y límites de memoria |
| Asistente | `PlanningProvider`, propuestas, vista previa y comandos | Contexto seleccionado, conversación y propuesta revisable; proveedor real bloqueado hasta validación y autorización independiente | Manual funciona sin IA; aceptación parcial/edición/rechazo, base obsoleta, fallos y cancelación |
| Persistencia y seguridad | Repository, adaptadores, cola, CAS, `studyhub-plan`, guardas SQL y RLS | Extensiones versionadas; todos los cambios pasan por dominio y validación de servidor | Dos cuentas, dos clientes, replay, idempotencia, conflictos recuperables y restauración |

## 3. Decisiones de datos propuestas

1. **Versión del modelo.** Mantener lectura del contenedor histórico y añadir versiones explícitas para planificación, categorías, entregas y archivos. No introducir campos incompatibles en un plan v1 que su validador rechaza. Los planes convertidos tendrán `modelVersion: 2`; el lector v1 y su historial permanecen disponibles.
2. **Una autoridad por proyecto.** Proponer `planningAuthority` y un registro de adopción con revisión base, fecha, actor, mapa de IDs y hash de la copia original. No inferir correspondencias por títulos. Los proyectos nuevos del módulo usan el catálogo canónico; los antiguos requieren vista previa y aceptación para adoptar. Los comandos antiguos se adaptan a esa autoridad o se bloquean con explicación. No sincronizar bidireccionalmente dos catálogos editables.
3. **Historia de avance.** Conservar porcentajes y reglas históricas. Un estado antiguo `verified` sin evidencia suficiente no se transforma en verificación nueva. La vista previa explica cualquier cambio de denominador o de lectura actual; no modifica métricas históricas.
4. **Relaciones.** IDs estables y referencias tipadas a tareas, competencias, entregas, evidencias y archivos. Validar cuenta y proyecto, no solo existencia del ID. Jerarquía y dependencias bloqueantes sin ciclos. Referencias eliminadas conservan tombstones mínimos para replay, sin inventar entidades activas.
5. **Categorías.** Catálogo `categories` con nombre, icono, color y procedencia; `task.categoryId` y vínculos de proyectos. Conservar el texto histórico. La migración no fusiona automáticamente etiquetas parecidas de diferentes proyectos; ofrece unificar/reasignar mediante vista previa. Eliminar categoría nunca elimina tarea o proyecto.
6. **Entregas.** Extender `exercises` con propósito y referencias tipadas, manteniendo el uso académico predeterminado de registros antiguos. Guardar versiones de entrega para conservar también intentos técnicos sin evaluación académica. Los intentos/revisiones existentes se enlazan sin duplicarlos ni recalcular sus firmas históricas. Una revisión técnica no genera nota; una nota IA no verifica producto.
7. **Evidencia compartida.** Separar contenido y procedencia de la evidencia de la decisión sobre cada criterio. Adoptar registros históricos mediante mapas explícitos, conservando IDs originales o alias documentados si hay colisión. Los registros de revisión originales no se editan.
8. **Archivos.** Metadatos con ID, versión, propietario/proyecto, nombre, MIME, tamaño, hash de contenido y procedencia. El hash actual de TaskFileStore deriva del nombre, no acredita los bytes. Las versiones nuevas usan objetos privados inmutables; el mismo nombre actualiza la versión visible del archivo, sin duplicarlo en la lista. La reutilización entre propósitos usa referencias al mismo objeto autorizado.
9. **Imágenes históricas.** `learningImages.js` reduce dimensiones y comprime a WebP/JPEG. Esas imágenes siguen disponibles como derivadas; no se inventa su original. Los nuevos originales se conservan aparte cuando se solicite fidelidad. No extraer ni enviar fotografías a IA automáticamente.
10. **Importación local a cuenta.** Archivo original verificable, origen declarado, hash y evento de importación. La cuenta importadora no se atribuye los eventos anteriores. Las verificaciones importadas requieren revisión antes de aportar avance actual. Si falta un archivo original, se conserva la referencia como incompleta, sin fingir su subida.
11. **Crecimiento.** Eventos inmutables y checkpoints del modelo v2, con consulta paginada y revisiones por plan. No guardar una copia completa del contenido por cada cambio. Extender el adaptador existente y su cola con comandos por plan; almacenamiento persistente local para segmentos históricos y servidor con eventos separados. El snapshot general conserva una referencia/proyección identificada, nunca una segunda autoridad editable.

La consolidación midió 300 elementos y 299 dependencias: siete modificaciones adicionales llevaron el plan a 2.955.614 unidades UTF-16; el siguiente cambio fue rechazado sin pérdida. El límite actual es 3.000.000 unidades UTF-16, **no exactamente 3 MB**, además de 500 eventos y un límite HTTP global. No se resolverá aumentando límites a ciegas ni eliminando eventos. El modelo v2 debe superar los casos extensos antes de ampliar su uso; v1 conserva sus protecciones.

## 4. Migraciones, persistencia y reversión

| Cambio | Preparación y ejecución permitida | Criterio de salida / reversión |
|---|---|---|
| Cierre anterior | Revisar y registrar los cambios ya presentes en un commit separado después de aprobación; conservar evidencia 22+6 | Sin secretos, regresión actual y rama correcta; no repetir staging intacto sin motivo |
| Plan v1 → v2 | Copia exacta con hash; convertir en espacio aislado; reproducir eventos y comparar contenido, orden y métricas | Repetir conversión no duplica; original permanece legible; ningún cambio de autoridad antes de igualdad comprobada |
| Catálogo canónico | Vista previa por proyecto y adopción explícita, después de validar compatibilidad | Solo una colección editable; copia histórica y referencias externas conservadas |
| Categorías/evidencias/entregas | Cambios aditivos versionados y mapa de correspondencias | Copia antigua legible, sin autores/notas/archivos inventados; misma migración idempotente |
| Persistencia cloud v2 | Tablas de eventos/checkpoints y manifiestos privados, RLS, RPC transaccional y CAS. Preparar SQL y probar solo en Supabase local desechable | Un comando gana, el duplicado recupera resultado, otro contenido con mismo ID se rechaza; cuentas aisladas |
| Archivos originales | Carga inmutable → verificación de bytes → confirmación de referencia mediante dominio. Recuperación de cargas interrumpidas y huérfanos con registro explícito | No prometer transacción atómica entre Storage y SQL; nunca eliminar objetos aún referenciados; históricos no se sobrescriben |
| Local → cuenta | Importación explícita con procedencia y manifiesto de archivos | Sin reasignar `local` a un UUID; contraste del estado final y rechazo seguro ante incoherencia |
| Clientes anteriores | Bandera, versión mínima y guardas: no pueden modificar una cuenta adoptada por la ruta antigua | Conservar cola y copia para reconciliar; no hacer fallback a escritura sin validación |
| Reversión | Detener escrituras nuevas, conservar logs/objetos/guardas y volver a lectura/interfaz estable compatible | Si hay cambios posteriores, conservarlos y reconciliar; nunca restaurar una copia vieja a ciegas ni bajar revisiones |

El SQL y la estructura v2 serán parte de la implementación aprobada, no están aplicados. Las pruebas cloud históricas de StudyHub no certifican estas migraciones futuras. No se tocará producción ni se activará el endpoint remoto durante este encargo.

## 5. UX acordada para implementar

- Mantener RC1, sección Plan, Inicio, Proyectos y Enfoque existentes. Cinco apartados principales: **Resumen, Árbol, Entregas y evidencias, Historial, Asistente**. Riesgos, fuentes, decisiones y escenarios permanecen accesibles mediante los paneles de detalle correspondientes, no se eliminan al reagrupar.
- Resumen: medidor central «Avance del proyecto»; cobertura, dominio académico y tiempo separados, con explicación de qué datos los justifican. Sin datos suficientes: «Sin calcular». Conservar colores por competencia y geometría compartida.
- Árbol: buscar, expandir, zoom, desplazar y abrir ficha. Lista estructurada equivalente para teclado; controles de zoom accesibles y foco recuperable. Preferencias gráficas no producen comandos del plan.
- Entrega: elegir uso técnico, académico o ambos; relacionar objetivos/actividades y competencias; escribir esperado/obtenido, explicación, código, dificultades y correcciones; adjuntos opcionales. Mostrar qué revisión es técnica y cuál académica.
- Archivos: «Original», «Vista previa» o «Original histórico no disponible», según evidencia real. Reemplazar crea versión; descargar especifica la versión. Revocar acceso futuro no puede retirar una copia ya descargada.
- Categorías: administrador reutilizable, vista previa de referencias y opción de reasignación antes de eliminar.
- Historial y revisión semanal: mostrar registros enlazados y su procedencia, sin duplicar eventos. «Registrar como imprevisto» crea propuesta; sin IA no se afirmará comprender automáticamente texto libre.
- Asistente: contexto visible y seleccionado, autorización de envío no persistida como consentimiento permanente, estado de servicio explícito. Propuesta antes/después; aprobación parcial, edición, rechazo y reconciliación. Ninguna respuesta fallida se presenta como éxito.
- Exportación: selección explícita de período/objetivo/entregable, datos académicos, código y originales privados. Vista previa de tamaño y exclusiones. Mantener aparte «Restaurar copia JSON».
- Borradores por cuenta/entidad, botones de al menos 44 × 44, foco visible, Escape y clic exterior solo donde corresponda. Cerrar un menú no borra borradores ni cierra otro formulario. Volver conserva contexto y no dispara guardados duplicados.

## 6. Paquete de revisión

Formato propuesto `studyhub-project-review/1`: ZIP con `manifest.json`, `project.json`, `context.md`, historial y archivos autorizados. El manifiesto identifica versión, fecha, proyecto, filtros, referencias, archivos, tamaño y SHA-256; lista también exclusiones, ausencias y errores. No incorpora tokens, enlaces firmados durables, contraseñas ni campos desconocidos mediante volcado indiscriminado.

Una exportación parcial incluye los ancestros y referencias necesarios como contexto, diferenciados del contenido seleccionado. No introduce expedientes ajenos para cerrar referencias. Si falta permiso o archivo, el paquete informa la omisión y no se anuncia como completo.

Límite inicial propuesto: conservar 20 MiB por adjunto y limitar la exportación del navegador a 100 MiB de originales seleccionados, con lectura acotada, cancelación y límite adicional del paquete final. Probar el pico de memoria; si no es seguro, rechazar con explicación y ofrecer reducir alcance, sin omitir contenido silenciosamente. El límite podrá reducirse por evidencia del ensayo, no ampliarse sin medir. Proyectos superiores requieren exportación por partes o servicio posterior autorizado; no se promete descarga ilimitada.

## 7. Pruebas de aceptación y etapas

| Etapa | Pruebas obligatorias antes de cerrarla |
|---|---|
| A · cierre previo | Conservar 276 pruebas, evidencia local 22+6 y backup/reversión; registrar honestamente importación local bloqueada, límites y pendientes cloud. Commit separado del trabajo ya realizado |
| B · modelo y persistencia | Adopción sin pérdida ni doble autoridad; categorías compartidas y eliminación segura; entrega con varios propósitos y revisiones independientes; referencias/ciclos/tombstones; migraciones idempotentes y reversión. Repetir Auth/RLS/Storage/CAS reales localmente por los cambios nuevos |
| C · indicadores e historia | Pesos/criterios desconocidos → Sin calcular; tareas/horas no modifican avance; estado completado ≠ verificado; invalidación selectiva conserva ramas no afectadas y métricas históricas; revisión semanal enlaza hechos sin fabricar resultados |
| D · árbol y ZIP | Explorar árbol no cambia revisión; teclado/lista equivalentes; dependencias cruzadas y búsqueda; 300 y 1.000 nodos como escenarios de ensayo, no promesa previa de capacidad. ZIP completo/parcial, hashes, archivos ausentes, privacidad, cancelación y límites de memoria |
| E · asistente | Contratos y transporte sintético separados de inferencia; contexto autorizado, idempotencia, respuesta tardía, cancelación, revisión obsoleta, rechazo y aceptación parcial. **No cerrar integración real hasta validar proveedores y recibir autorización específica** |
| F · consolidación | Suite completa, build, flujo de navegador a 320/390/740/1024/1440; medición de carga, memoria y replay con historia extensa; Cubo y software aislados; comparación contra toda la matriz de conservación |

Casos extensos incluyen frontera de 500 eventos de v1 y continuación v2 con más de 500 eventos sin recortes, caracteres multibyte, múltiples planes, carga de snapshot y fallo del almacenamiento local. Medir antes/después; documentar límites efectivos en vez de atribuir rendimiento sin ejecución.

Caso Cubo LED: fuentes del tutorial marcadas externas; declaraciones del estudiante como declaraciones, no verificación. Pesos sin definir y Python Sin evaluar. Probar dependencia de pieza faltante, propuesta de corrección, evidencia sintética identificada, conservación de versiones y ZIP. Fotografías propias solo si el usuario las aporta expresamente; fixtures sintéticos no certifican montaje. Segundo caso de software ficticio con pruebas automatizadas declaradas/ejecutadas claramente diferenciadas.

Separar resultados en: unitarios/contratos sintéticos, Supabase local real, Supabase cloud y proveedores reales. Móvil físico, lector de pantalla y red lenta siguen pendientes hasta ejecución comprobable. Una medición de viewport no los sustituye.

## 8. Condiciones y aprobación solicitada

Se solicita aprobar este contrato completo, especialmente: adopción explícita del catálogo canónico por proyecto; plan v2 con historia separada y checkpoints; entrega compartida reutilizando ejercicios/intentos; categorías por ID; archivos originales inmutables; límite inicial de exportación.

La aprobación permite desarrollar y probar en `feat/studyhub-2`, registrar commits locales y completar las etapas sin pedir autorización para cada corrección rutinaria. No permite merge, push, Netlify, Supabase de producción, importación del Cubo real ni inferencias nuevas. La parte real de E permanece bloqueada por los fallos de proveedores del 29 de octubre y su autorización específica.

Documento faltante: entregar «Continuación de implementación y mejoras integrales» si existe como versión independiente. Su ausencia no autoriza eliminar funciones ni inventar requisitos; con aprobación, se puede avanzar en el alcance explícito y contrastarlo cuando se entregue.

Estado final de esta revisión: **contrato presentado, desarrollo nuevo pendiente de aprobación; versión estable y cambios anteriores conservados**.
