# StudyHub 2.0 — Diagnóstico de compatibilidad y plan técnico RC1

Fecha de revisión: 25 de octubre de 2026
Estado: listo para decisión de producto y planificación; **sin implementación**.

## 0. Alcance y evidencias

Esta revisión prepara el traspaso del rediseño aprobado “Mesa de trabajo” al proyecto real. No se modificó código de producción, esquema de Supabase, datos, despliegue ni reglas de cálculo.

Se revisaron:

- `StudyHub_2_Prototipo_Progreso.html` — RC1 interactivo recuperado.
- `StudyHub_2_Entrega_Progreso.md` — especificación consolidada RC1.
- `StudyHub_2_Reglas_Propuestas.md` — reglas deliberadamente pendientes.
- `StudyHub_2_Pruebas_RC1.json` — 16 grupos funcionales registrados como correctos.
- `StudyHub_Contexto_Funcional_Para_Rediseno.md` — inventario del producto real.
- `StudyHub_2_Auditoria_Final_RC1.md` — auditoría independiente; equivale al informe independiente solicitado. La entrega lo menciona con el nombre anterior `StudyHub_2_Revision_Independiente.md`.
- Repositorio real en `main`, commit `4210809303a0dad2825c3bde2324196eda5992a4`.

Línea base comprobada:

- 23 archivos de pruebas correctos.
- 118 pruebas correctas.
- `npm run build` correcto.
- No se detectaron cambios locales en código; el documento funcional previo sigue sin seguimiento por Git.

---

# 1. Diagnóstico de compatibilidad

## 1.1 Veredicto

**Compatible con adaptación incremental, no con sustitución total.** La arquitectura existente permite adoptar la interfaz RC1 manteniendo las reglas de dominio en `StudyHubRepository`, los selectores, los cálculos y los adaptadores. No se recomienda reescribir la aplicación ni trasladar reglas a las vistas.

La maqueta es compatible directamente con:

- estilo oscuro, Mesa de trabajo, navegación y jerarquía;
- pestañas de proyecto, progreso y revisión semanal;
- formulario de ejercicios y evaluación manual/IA;
- reloj de enfoque y controles existentes;
- evidencias, informes, recomendaciones y estados vacíos;
- presentación de áreas con medidores y galería horizontal.

Necesita adaptación explícita para no perder:

- CRUD y cascadas de proyectos/tareas;
- proyectos completados y reapertura;
- agenda actual, recurrencia, fechas y horas locales;
- temporizador exacto, sesiones y reflexiones;
- adjuntos privados, imágenes y copias;
- autenticación, RLS, caché y cola offline;
- importación educativa y exportación de informes;
- progreso de proyectos de entregables.

## 1.2 Arquitectura actual que debe permanecer

```text
Vistas / componentes
        ↓ acciones
src/ui/app.js
        ↓ comandos
StudyHubRepository
        ↓ valida y normaliza
Store observable + adapter
        ├─ localStorage
        └─ Supabase snapshot + caché/cola offline
```

Decisión técnica: las vistas RC1 deben consumir comandos y selectores existentes. No deben manipular colecciones, sumar tiempo, completar ocurrencias ni calcular progreso directamente.

## 1.3 Compatibilidad de datos

El estado v2 ya contiene proyectos, tareas, sesiones, aprendizajes, competencias, ejercicios, evidencias, evaluaciones, etapas, entregables, solicitudes IA, revisiones semanales y temporizador activo. El rediseño visual no necesita migración de datos por sí solo.

Sí será necesaria una migración versionada si se adopta el contrato RC1 de evaluación:

- Situación actual: `storeAiEvaluation()` crea una entidad `evaluation` por respuesta de proveedor.
- Consecuencia actual: Gemini + Cloudflare pueden contarse como dos evaluaciones y participar dos veces en validación, historial y promedio.
- Contrato RC1: una entrega del usuario es **un intento**; Gemini y Cloudflare son dos revisiones del mismo intento.
- Cambio mínimo recomendado: introducir `evaluationAttempts` y `providerReviews`, o convertir `evaluations` en intentos con `reviews[]`, `canonicalResult` y referencias de versión.
- La migración debe agrupar con seguridad solo registros cuya identidad de solicitud/evidencia pueda demostrarse. Si no puede demostrarse, se mantienen como intentos históricos separados y se marca la procedencia.

Supabase guarda un snapshot JSON por usuario. El cambio puede resolverse inicialmente con migración del estado de aplicación y compatibilidad de copias; no obliga por sí mismo a rediseñar tablas SQL. Aun así, cualquier cambio de `schemaVersion` exige actualización de validación, importación de copias, pruebas de nube y rollback.

## 1.4 Conflictos de reglas detectados

1. **Intentos de IA:** el código actual no agrupa dos proveedores dentro de un intento. Es el bloqueo técnico más importante.
2. **Progreso general:** producción promedia competencias validadas cuando existen al menos dos; RC1 propone `Sᵢ × Rᵢ` dividido por todas las áreas. Son reglas diferentes. No se sustituye una por otra sin aprobación.
3. **Independencia:** hoy participa como criterio de rúbrica y como requisito de evidencia independiente para validar. La propuesta RC1 además la pondera numéricamente dentro de `Rᵢ`; eso puede penalizarla dos veces.
4. **Evidencia:** el modelo distingue tipos, pero necesita procedencia de verificación, actor, fecha, versión/hash y relación exacta con el intento para soportar una regla canónica auditable.
5. **Áreas evaluables:** las competencias existen, pero falta versionar formalmente el conjunto usado como denominador de cobertura/progreso general.
6. **Borradores RC1:** sobreviven al recorrido interno de la maqueta, pero no a una recarga. La aplicación real ya tiene borradores de aprendizaje; los nuevos formularios de evaluación requieren persistencia equivalente, aislada por usuario/proyecto/pantalla.
7. **Estados de red RC1:** son simulaciones con temporizadores. La implementación debe derivarlos de eventos reales y usar claves de idempotencia.

## 1.5 Compatibilidad funcional por nivel

| Nivel | Elementos | Tratamiento |
|---|---|---|
| Directo | tema, jerarquía, formularios, pestañas, medidores, galería, ayudas, enfoque | Reemplazo visual gradual con los mismos comandos/selectores |
| Adaptación | rutas, Agenda, calendario, completadas, informes, ajustes, navegación Volver | Enlazar a datos reales y rutas hash; conservar preferencias |
| Migración | intento/revisiones de IA, resultado canónico, reglas versionadas | Nueva versión de estado, migración y pruebas de compatibilidad |
| Bloqueado por decisión | combinación de proveedores y porcentaje general | Mostrar revisiones separadas y estado `Pendiente` |
| Expansión nueva | calendario global, completadas globales, sugerencia IA de áreas, comparación, progreso global | Backlog separado; no presentarlo como heredado |

---

# 2. Matriz de conservación

| Funcionalidad | Archivo/componente actual | Pantalla del diseño nuevo | Cambio requerido | Prueba de conservación |
|---|---|---|---|---|
| Crear/editar/eliminar proyecto | `repository.js`; `projectsView.js`; `app.js` | Inicio / Proyectos / formulario | Revestir formularios y menús; mantener comandos y confirmación | Crear, editar sin cambiar ID y eliminar con cascada completa |
| Completar/descompletar proyecto | `repository.js#setProjectStatus`; `completedProjectsView.js` | Proyectos completados separado | Añadir acceso equivalente en navegación nueva | Completar lo oculta; reabrir restaura tareas, sesiones y progreso |
| Crear/editar/eliminar tarea | `repository.js`; `projectView.js`; `app.js` | Proyecto > Tareas; Enfoque | Adaptar modal y menú sin mutación directa | Un clic crea una tarea; edición no duplica; borrado limpia relaciones |
| Categorías y pestañas de tarea | `projectView.js`; preferencias UI | Proyecto > Tareas | Mapear Por hacer/Completadas y categoría al nuevo diseño | Completadas no aparecen en activas; filtro recordado por proyecto |
| Temporizador sin límite/con tiempo | `repository.js`; `timerController.js`; `focusView.js` | Enfoque | Conservar reloj circular y modos | Reconstrucción tras recarga y sobretiempo correctos |
| Pausar/detener/completar | `repository.js` | Enfoque | Solo cambiar presentación | Pausa no crea sesión; detener crea una; completar no duplica |
| Sesiones y tiempo acumulado | `focusSessions`; selectores; `focusView.js` | Enfoque / Aprendizajes | Conectar resúmenes RC1 a datos reales | Suma exacta tras varias sesiones, navegación y recarga |
| Reflexión por sesión | `saveReflection`; `completeTaskWithReflection`; `learningDrafts.js` | Notas / Historial | Integrar formularios y ayudas RC1 | Una reflexión por sesión; omitir no pierde tiempo |
| Editar/eliminar aprendizaje | `updateLearningEntry`; `deleteLearningEntry` | Aprendizajes / Historial | Añadir acciones en la nueva tabla/lista | Editar no cambia tiempo; eliminar no borra sesión |
| Imágenes de aprendizaje | `learningImages.js`; vistas de reflexión | Notas / Historial | Mantener compresión, límites y ajuste | Pegar/cargar hasta 4; imagen no desborda; texto queda debajo |
| Adjuntos de tarea | `taskFiles.js`; `focusView.js`; creación de tarea | Tarea / Enfoque | Mantener panel privado y estados de red | Carga opcional; mismo nombre reemplaza; descarga autorizada |
| Fecha/hora límite | `time.js`; formularios; selectores | Tareas / Agenda / Enfoque | Mostrar 12 h sin alterar `HH:mm` almacenado | Día local estable; sin hora huérfana; etiqueta AM/PM correcta |
| Recurrencia diaria | `recurrence.js`; `repository.js` | Tareas / Agenda / Enfoque | Representar ocurrencia, no duplicar entidad | Completar hoy no cierra serie; próximo día reaparece |
| Agenda global existente | `components.js`; `app.js`; selectores | Agenda | Revestir los grupos actuales | Vencidas/hoy/mañana/3 días/semana/posteriores/sin fecha son excluyentes |
| Calendario de proyecto | `projectView.js`; `time.js` | Proyecto / Agenda contextual | Preservar navegación y filtro por día | Mes/Hoy funcionan; recurrencias aparecen; sin fecha no aparece |
| Importación educativa | `learningPathImport.js`; `repository.js#importLearningPath` | Importar ruta / vista previa | Integrar acceso en nueva navegación | Vista previa, confirmación, deduplicación y todo comienza Sin evaluar |
| Copia JSON | `schema.js`; `repository.js#importEnvelope` | Ajustes / Copias | Mantener separado de importación educativa | Exporta sin secretos/adjuntos; importar advierte reemplazo |
| Informes y exportación de evaluación | `report.js`; `progressView.js` | Resultados / Informe | Adaptar filtros y formato RC1 | Markdown/JSON respetan periodo y no inventan resultados |
| Sincronización y offline | `cloudAdapter.js`; `localAdapter.js`; shell | Estado de cuenta / Ajustes | Mantener indicadores y cola | Guardado local no dice sincronizado; reconexión vacía cola |
| Autenticación y cierre de sesión | `authGate.js`; `supabase.js`; shell | Perfil y ajustes | Adaptar panel de cuenta | Aislamiento por usuario; cerrar sesión no borra datos |
| Competencias/subcompetencias | `repository.js`; `progressView.js` | Mi progreso > Competencias | Aplicar galería/gestión RC1 | Nueva competencia = Sin evaluar; relaciones válidas |
| Criterios y rúbrica | `constants.js`; `updateRubric` | Ajustes de evaluación | Conservar pesos/versiones existentes | Pesos suman 100; evaluación histórica conserva su versión |
| Historial de evaluación | `evaluations`; `progressView.js` | Historial | Migrar a intento + revisiones sin perder datos | Filtro/paginación; una entrega con dos IA ocupa una fila de intento |
| Evaluación manual | `recordManualEvaluation` | Evaluar > Manual | Adaptar formulario y justificación | Criterios 0–4, nota trazable y una sola evaluación |
| Gemini/Cloudflare | `aiEvaluation.js`; Edge Function; `storeAiEvaluation` | Evaluar / Comparación | Agrupar revisiones, idempotencia y estados reales | Un intento, hasta dos revisiones; fallo parcial no duplica |
| Evidencias | `createEvidence`; `deleteEvidence`; `progressView.js` | Evidencias | Añadir procedencia/verificación versionada | Destino y competencias válidos; no autovalida dominio |
| Recomendación a tarea | `app.js`; `repository.js#createTask` | Resultado > Sugerencia | Confirmación antes de crear; detector de duplicado | Una aceptación crea una tarea y abre Enfoque |
| Etapas/entregables/pesos | `repository.js`; `progress.js`; `progressView.js` | Mi progreso de Entregables | Revestir sin usar fórmula académica | Dependencias bloquean; sin pesos se muestran cantidades |
| Barras laterales y preferencias | `app.js`; `app.css`; `responsive.css` | Shell Mesa de trabajo | Adoptar composición RC1 preservando rieles | Mostrar/ocultar, alto completo, preferencia persistente, móvil accesible |
| Búsqueda y perfil | shell; `projectsView.js` | Barra superior/lateral | Conservar normalización y caja de perfil completa | Buscar no muta; cualquier zona del perfil abre menú |

---

# 3. Revisión técnica de reglas pendientes

## 3.1 Contrato mínimo recomendado de evaluación

```text
EvaluationAttempt
  id, projectId, exerciseId, evidenceVersion, rubricVersion
  submittedAt, difficulty, helpLevel, competencyIds
  reviews[] -> ProviderReview
  canonicalResult -> null | CanonicalAssessment

ProviderReview
  id, attemptId, provider, model, promptVersion
  scores, percentage, strengths, weaknesses, recommendations
  status, latency, usage, receivedAt

CanonicalAssessment
  source: manual | selected_provider | approved_consensus_rule
  percentage, scores, resolvedBy, resolvedAt
  ruleSetId, explanation
```

Reglas innegociables:

- una solución enviada una vez es un intento;
- usar ambas IA añade dos revisiones, no dos ejercicios;
- reintentar el proveedor fallido actualiza/agrega su revisión en el mismo intento;
- cambiar solución, evidencia o rúbrica crea un intento nuevo;
- las dos revisiones originales nunca se sobrescriben por un promedio;
- si no hay regla canónica aprobada, `canonicalResult=null` y la UI muestra `Pendiente de conciliación`.

## 3.2 Decisiones de cálculo

| Tema | Estado actual | Recomendación técnica | Estado de aprobación |
|---|---|---|---|
| Porcentaje general | Promedio de competencias validadas si hay ≥2 | No reemplazar todavía; nuevo dial RC1 muestra Pendiente | **Pendiente** |
| Áreas evaluables | Competencias activas sin versión del conjunto | Crear `areaSetVersion`; cobertura usa áreas aplicables de esa versión | **Pendiente** |
| Cobertura vs dominio | Cobertura ya se calcula aparte | Mantenerla separada y etiquetarla “áreas evaluadas”, nunca dominio | Recomendación lista |
| Últimos intentos | Promedio de las últimas 3 evaluaciones | Tras migración, usar últimos 3 **intentos canónicos**, no revisiones | **Pendiente** |
| Independencia | Criterio 40 % + requisito de validación | No añadir otro factor numérico; usarla como criterio y condición de elegibilidad documentada | **Pendiente** |
| Mejora rápida | RC1 penaliza rango/consistencia | No aplicar penalización por rango; mostrar tendencia y calibrar con datos reales | **Pendiente** |
| Área nueva | Hoy entra Sin evaluar | Incluir en cobertura de la nueva versión; excluir de media de dominio hasta evaluarla | **Pendiente** |
| Evidencia | Tipo y relación, sin verificador completo | Añadir actor, método, fecha, versión/hash y estado de verificación | **Pendiente** |
| Dos proveedores | Dos evaluaciones actuales; RC1 propone umbral 15/1 | No promediar automáticamente; conservar ambas y pedir resolución humana o regla aprobada | **Pendiente** |
| Entregables | Regla propia 100/75/35/0 y pesos | Mantener separada de conocimientos | Confirmado por producto actual |

## 3.3 Resultado canónico y desacuerdos

Propuesta para aprobación:

1. Manual: su revisión es el resultado canónico, con autor y justificación.
2. Un proveedor seleccionado: puede ser canónico solo si el usuario aprueba que ese proveedor sea la fuente de esa evaluación.
3. Ambos proveedores: mostrar dos resultados. No existe puntuación canónica automática hasta aprobar una regla.
4. Diferencia relevante: estado `Discrepancia`; requiere revisión humana. Nunca usar media silenciosa.
5. Fallo parcial: conservar la revisión recibida; la combinación queda pendiente. Reintentar no crea otro intento.
6. Los umbrales RC1 de 15 puntos totales y 1/4 por criterio quedan como experimento, no como producción.

## 3.4 Evidencia y validación

Una evidencia debe registrar:

- objetivo y competencias;
- versión o hash del contenido evaluado;
- tipo (`reported`, `attached`, `test_passed`, `external_verified`);
- quién o qué verificó;
- fecha y método;
- estado `reported`, `verified`, `rejected` o `expired`;
- vínculo al intento y a la versión de criterios.

Una declaración propia puede apoyar el contexto, pero no convertirse en verificación externa. Una nota alta de IA no valida por sí sola la evidencia ni la competencia.

## 3.5 Trazabilidad y versionado

Cada intento debe conservar `rubricVersion`, `ruleSetId`, `areaSetVersion`, versión/hash de evidencia, proveedor/modelo, versión de prompt y resultado original. Una resolución canónica debe registrar el responsable y la explicación. Los cálculos históricos no deben cambiar silenciosamente al publicar una fórmula nueva; se recalculan solo con versión visible o permanecen asociados a su regla original.

---

# 4. Pruebas visuales reales del RC1

Se abrió el HTML RC1 en Chrome y se aplicaron viewports reales. El prototipo está embebido en un marco de previsualización; por el margen del marco, los lienzos internos observados fueron 212, 268, 548, 775 y 1108 px para viewports solicitados de 320, 390, 740, 1024 y 1440 px respectivamente.

## 4.1 Resultado por ancho

| Viewport | Modo | Resultado |
|---:|---|---|
| 320 × 900 | Móvil | Sin desbordamiento horizontal global; textos visibles envuelven; navegación se reorganiza. |
| 390 × 900 | Móvil | Agenda sustituye el contenido, puede cerrarse y el calendario se expande sin recorte. |
| 740 × 900 | Escritorio adaptable | Navegación pasa a franja superior; contenido queda en una columna; sin texto crítico recortado. |
| 1024 × 900 | Escritorio | Sidebar de 154 px + contenido; ancho interno 775 px; sin desbordamiento ni texto crítico recortado. |
| 1440 × 1000 | Escritorio | Sidebar + área amplia; medidor principal y cuatro secundarios visibles; sin desbordamiento global. |

## 4.2 Interacciones verificadas

- Teclado: recorrido por campos, áreas, selects y proveedores en orden funcional.
- Foco: contorno visible de 2 px (1,6 px computados por escala del marco), color lila.
- Escape: cierra la ayuda abierta.
- Volver: regresa a Mi progreso sin descartar el borrador.
- Borrador: el campo editado sobrevivió a salir y volver a la evaluación.
- Carrusel: “Áreas siguientes” movió `scrollLeft` de 2,4 a 235,2; flechas tienen nombre accesible.
- Agenda: abre/cierra, mantiene la pantalla de origen y expande/contrae calendario.
- Contraste muestreado: título 15,89:1; texto secundario 9,58:1; botón primario 9,07:1; texto de perfil 9,13:1. La muestra supera AA, pero no sustituye una auditoría WCAG completa.
- Movimiento reducido: existe regla `prefers-reduced-motion` para scroll y spinner de solicitud.

## 4.3 Defectos reproducibles

| Gravedad | Defecto | Reproducción | Criterio de corrección |
|---|---|---|---|
| Media | Objetivos táctiles menores de 44 × 44 px | En 390 px, flechas de área ≈35,7 × 39,3; botones principales ≈39,3 px de alto; varios `summary` ≈18,6 px | Área activable mínima 44 × 44 en móvil/coarse pointer, sin agrandar visualmente de forma innecesaria |
| Media | Borrador de evaluación se pierde al recargar | Escribir “Borrador de prueba RC1”, volver y reabrir: se conserva; recargar: vuelve a “Consultar y filtrar datos” | Persistir por usuario/proyecto/pantalla y restaurar tras recarga; limpiar al guardar/cancelar explícitamente |
| Baja | Revisión táctil física no ejecutable en este entorno | Los clics simulados funcionan, pero no hubo dispositivo táctil real | Ejecutar smoke test en al menos un móvil físico antes de producción |
| Baja | Lector de pantalla no auditado | El árbol accesible presenta nombres/roles, pero no se usó NVDA/VoiceOver | Recorrido completo con lector y registro de anuncios/orden |

No se encontraron bloqueos visuales críticos, superposición de contenido ni recorte de textos esenciales en los cinco anchos probados.

---

# 5. Expansiones nuevas separadas

| Expansión | Relación con el producto actual | Datos/regla requerida | No debe confundirse con |
|---|---|---|---|
| Calendario global colapsable | Agenda global existe; calendario solo por proyecto | Puede derivarse de tareas/recurrencias; preferencia de expansión local | Calendario de proyecto existente |
| Completadas globales | Agenda activa excluye completadas | Vista derivada y filtros; sin mezclarlas con urgencias | Pestaña Completadas por proyecto |
| Áreas sugeridas por IA | Competencias manuales/importadas existen | Entidad/borrador de sugerencia, confirmación y deduplicación | Competencia aceptada o evaluada |
| Velocímetros | Nueva presentación de progreso existente | Solo datos canónicos; Sin evaluar/Pendiente sin cero ficticio | Nueva fórmula automática |
| Comparación de proveedores | Hoy hay resultados separados sin intento común | Attempt + reviews + resolución canónica | Dos evaluaciones independientes |
| Posible combinación | Simulada en RC1 | Política aprobada, explicable y versionada | Promedio silencioso |
| Sugerencia contextual de tarea | Crear tarea desde recomendación ya existe parcialmente | Contexto mínimo, privacidad, confirmación, duplicados | Evidencia o evaluación nueva |
| Nuevo progreso general | Fórmula RC1 es propuesta | Regla calibrada, versionada y aprobada | Cobertura, horas o avance de entregables |

---

# 6. Plan de implementación por fases

## Fase 0 — Cerrar contrato de producto

- Archivos: documentación de reglas y ADR nuevo; sin código funcional.
- Modifica: decisiones D1–D10 de la sección 7.
- Preserva: todos los comportamientos actuales.
- Pruebas: escenarios de cálculo escritos antes de implementar.
- Riesgo: construir una interfaz que implique una regla inexistente.
- Rollback: no aplica.
- Aceptación: regla de intentos/revisiones, canónico, cobertura, evidencia y versionado aprobada por escrito.

## Fase 1 — Caracterización y red de seguridad

- Archivos: `tests/` solamente, fixtures versionados y pruebas de rutas/vistas actuales.
- Modifica: cobertura de pruebas; no cambia comportamiento.
- Preserva: CRUD, cascadas, temporizador, recurrencia, importaciones, nube y entregables.
- Pruebas: flujos E2E/DOM de conservación y snapshots de datos v2.
- Riesgo: falsos positivos por acoplamiento a HTML antiguo.
- Rollback: retirar pruebas demasiado específicas, no código de producto.
- Aceptación: pruebas fallan si se rompe cualquiera de las filas de la matriz.

## Fase 2 — Shell Mesa de trabajo y navegación

- Archivos: `src/ui/app.js`, `components.js`, `router.js`, `app.css`, `responsive.css`, `tokens.css`.
- Modifica: estructura visual, navegación, Agenda como panel y Volver con destino.
- Preserva: rutas actuales, búsqueda, perfil, barras colapsables, preferencias y acceso a copias/importación.
- Datos: ninguno.
- Pruebas: rutas, foco, teclado, 320/390/740/1024/1440, preferencias y menús.
- Riesgo: ocultar acciones existentes o reanimar toda la página.
- Rollback: bandera visual `workspaceV2`; volver al shell actual sin migrar datos.
- Aceptación: todas las acciones actuales siguen accesibles; sin cambio de dominio.

## Fase 3 — Proyecto, tareas, aprendizaje y Enfoque

- Archivos: `projectView.js`, `focusView.js`, `components.js`, CSS de proyecto/enfoque.
- Modifica: presentación y composición RC1.
- Preserva: CRUD, tabs, calendario del proyecto, temporizador, reflexiones, imágenes, adjuntos y recurrencia.
- Datos: ninguno.
- Pruebas: sesiones múltiples, completar, recarga, imágenes, archivos, fecha/hora local y ocurrencia diaria.
- Riesgo: doble sesión por re-render o acciones escondidas.
- Rollback: vistas antiguas detrás de la misma bandera.
- Aceptación: tiempos y relaciones antes/después son idénticos.

## Fase 4 — Modelo de intento y revisiones

- Archivos: `schema.js`, `repository.js`, `progress.js`, `report.js`, `aiEvaluation.js`, Edge Function, pruebas cloud/evaluación.
- Modifica: agrupación de revisiones, idempotencia, procedencia y resultado canónico.
- Preserva: rúbricas históricas, evaluación manual, respuestas originales, consumo por proveedor y secretos servidor.
- Datos: migración v2 → v3 y compatibilidad de backup; no desplegar hasta probar ida/rollback.
- Pruebas: una IA, ambas, fallo parcial, reintento, respuesta tardía, solución cambiada, importación v2, aislamiento de cuenta.
- Riesgo: contar revisiones como intentos o perder historial.
- Rollback: exportar copia v2 previa; migración reversible que conserve registros originales.
- Aceptación: ambas IA = 1 intento + 2 revisiones; ningún porcentaje canónico sin política válida.

## Fase 5 — Mi progreso RC1

- Archivos: `progressView.js`, `progress.css`, `progress.js`, `report.js`.
- Modifica: medidores, galería, historial, comparación, ayudas y recomendaciones.
- Preserva: competencias, ejercicios, evidencia, revisión semanal y entregables.
- Datos: solo metadatos de versión aprobados en Fase 0.
- Pruebas: sin evaluar, parcial, discrepancia, 15 áreas, 48 intentos, filtro/paginación y entregables sin pesos.
- Riesgo: mostrar cifra decorativa o aplicar fórmula académica a entregables.
- Rollback: medidores consumen selectores actuales; nuevo general permanece Pendiente.
- Aceptación: toda cifra enlaza a intentos canónicos; estado insuficiente nunca se muestra como 0 %.

## Fase 6 — Expansiones globales

- Archivos: shell/selectores/componentes Agenda; posibles módulos de sugerencias.
- Modifica: calendario global, completadas globales, áreas sugeridas y tarea contextual.
- Preserva: agenda activa y calendario por proyecto.
- Datos: preferencia local; sugerencias pendientes separadas de entidades aceptadas.
- Pruebas: grupos temporales, zonas locales, filtros, confirmación y deduplicación.
- Riesgo: mezclar urgencias/completadas o aceptar sugerencias como aprendizaje real.
- Rollback: banderas independientes por expansión.
- Aceptación: cada expansión puede desactivarse sin afectar datos base.

## Fase 7 — Endurecimiento y salida

- Archivos: pruebas, CSS, documentación operativa; configuración solo si la prueba lo exige.
- Modifica: accesibilidad, objetivos táctiles, rendimiento y persistencia de borradores.
- Preserva: datos y reglas.
- Pruebas: NVDA/VoiceOver, móvil físico, contraste completo, reduced motion, offline/reconexión, build, 118+ pruebas.
- Riesgo: regresiones de último minuto.
- Rollback: despliegue previo de Netlify y bandera visual.
- Aceptación: matriz completa aprobada, migración ensayada y sin defectos críticos/altos.

---

# 7. Decisiones precisas que necesitan aprobación

La aprobación visual ya permite planificar. Antes de programar Fases 4–6 se necesita responder cada código:

- **D1 — Unidad:** aprobar que una entrega del usuario sea un intento y cada IA produzca una revisión hija. Recomendación: **sí**.
- **D2 — Una IA:** decidir si la revisión del único proveedor seleccionado puede ser canónica automáticamente. Recomendación: **sí, con procedencia visible y regla versionada**.
- **D3 — Ambas IA:** decidir el canónico. Recomendación: **no combinar automáticamente; resolución humana o regla futura aprobada**.
- **D4 — Umbrales 15/1:** decidir si se experimentan, se descartan o se aprueban. Recomendación: **experimentar sin alimentar progreso**.
- **D5 — Porcentaje general:** elegir entre regla actual, RC1 o una tercera calibrada. Recomendación: **mantener Pendiente y conservar cobertura separada hasta calibrar**.
- **D6 — Independencia:** decidir si cuenta como criterio y requisito, o además como factor numérico. Recomendación: **criterio + requisito; no tercer castigo numérico**.
- **D7 — Mejora rápida:** decidir medida de consistencia. Recomendación: **tendencia visible; no penalizar el rango de mejoras todavía**.
- **D8 — Áreas:** aprobar versionado del conjunto y tratamiento de nuevas áreas. Recomendación: **nueva área = Sin evaluar; entra en cobertura de la nueva versión, no en promedio de dominio**.
- **D9 — Evidencia:** definir quién puede verificar y cuándo expira. Recomendación: **usuario puede declarar; tests/servicio/revisor identificado verifican; toda verificación deja trazabilidad**.
- **D10 — Entregables:** confirmar que conservan reglas 100/75/35/0, pesos y dependencias separadas del progreso académico. Recomendación: **sí**.

Mientras D2–D9 no estén aprobadas:

- se muestran resultados de proveedor por separado;
- una evaluación dual sigue siendo un solo intento;
- una discrepancia queda Pendiente;
- el medidor general no inventa porcentaje;
- entregables siguen con su regla propia;
- horas, tareas, certificados externos y cuentas prestadas no elevan competencias.

---

# 8. Conclusión

RC1 está listo para estimación y para una implementación incremental después de cerrar las decisiones anteriores. El diseño no requiere reescribir StudyHub. La estrategia segura es conservar el dominio actual, introducir la nueva composición detrás de una bandera y migrar el modelo de evaluación en una fase independiente y reversible.

El hallazgo más importante es objetivo: el código actual no cumple todavía “un intento con dos revisiones”. El hallazgo visual principal es táctil, no estructural. No hay justificación para cambiar datos, publicar o aplicar la fórmula RC1 en esta etapa.
