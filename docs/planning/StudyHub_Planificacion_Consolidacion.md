# Consolidación técnica del Planificador Inteligente

1 de noviembre de 2026 · `feat/studyhub-2` · base `a1cceae`.
Commit de entrega: `git log -1 --format=%H -- docs/planning/StudyHub_Planificacion_Consolidacion.md`.

**Núcleo manual validado con Supabase local real; todavía no activar planificación cloud ni publicar.** El bloqueo de ejecución local quedó cerrado. Permanecen decisiones de procedencia, integración de entregables y crecimiento que no deben resolverse mediante conversiones automáticas.

No hubo push, merge, despliegue, acceso a producción, inferencias ni importación del Cubo LED real. `main` sigue en `4210809303a0dad2825c3bde2324196eda5992a4`. Las banderas se conservaron; no se activó `VITE_WORKSPACE_PLANNING_CLOUD_READY`.

## Pruebas ejecutadas

| Verificación | Resultado y evidencia |
|---|---|
| Supabase local y handler real | **22 comprobaciones aprobadas**; [resultado](consolidation-staging.json) |
| Copia y reversión SQL | **6 comprobaciones aprobadas**, en el mismo resultado |
| Regresión completa | **276/276 pruebas**, 35 archivos; [resumen](consolidation-verification.json) |
| Compilación | Correcta, 92 módulos, JS 578,00 kB / gzip 161,76 kB. Persiste aviso de fragmento mayor de 500 kB |
| Capacidad | 300 elementos, 299 dependencias y cambios repetidos; [medición](consolidation-capacity.json) |
| Chrome | Flujo local con datos sintéticos, descrito abajo |
| Responsive del historial | 320, 390, 740, 1024 y 1440 píxeles CSS medidos, sin desbordamiento ni botones/enlaces/resúmenes visibles del plan menores de 44 × 44; [mediciones](evidence/consolidation-layout.json) |
| No ejecutado | Staging cloud gestionado del planificador, IA, móvil físico, lector de pantalla y red lenta |

Docker falló inicialmente al abrir `dockerInference`; su registro indicó todos los motores detenidos. El usuario cerró y abrió Docker y respondió el motor Linux 29.4.3. No se restablecieron datos de fábrica ni se borraron volúmenes.

Se reutilizaron los siete contenedores `supabase_*_studyhub-staging` y la red `studyhub-staging-local`. El nuevo `studyhub-staging-plan` ejecutó Edge Runtime oficial v1.77.8 con **el handler real y sus importaciones compartidas**, sin transporte sintético de aplicación. El bootstrap restringe la red al Kong local y no contiene claves de proveedores. La alternativa pasa código por entrada estándar a rutas fijas, sin mounts de Windows ni `docker cp`.

Auth, PostgreSQL, PostgREST y Storage fueron reales. Las claves generadas por Storage local se usaron en memoria, sin imprimirlas ni leer `.env`. Se crearon dos cuentas `example.test` y dos sesiones independientes de la primera cuenta. Se limpiaron sus usuarios/archivos y se detuvieron solo el handler y los servicios iniciados por el ejecutor. Los contenedores de otros proyectos no recibieron órdenes de parada.

Comprobaciones de integración:

- Auth, aislamiento de lectura/escritura, rechazo de eventos de otra identidad, guardia de escrituras directas y RPC reservada al servidor.
- CAS concurrente: una escritura gana y la otra recibe `409`; otro cliente lee la historia exacta.
- Archivo privado, referencia versionada, aprobación y verificación. Reemplazarlo provoca `422` al intentar acreditar la versión antigua; registrar la sustitución invalida la verificación actual sin cambiar el pasado.
- Reintento de confirmación perdida sin duplicar comandos; restauración como versión nueva conservando eventos.
- Repositorio, gateway y adaptador reales: edición offline, reconstrucción del cliente, conflicto conservado, copia divergente antes de recuperar nube y sincronización posterior. El almacenamiento de los clientes se aisló en memoria; **no fueron dos dispositivos físicos**.
- Entregables anteriores y campos históricos desconocidos conservados.
- Importación con autor `local` y copia antigua rechazadas sin alterar la fila remota.

La copia SQL contiene únicamente la fila de la cuenta sintética. Se verificó SHA-256, revocación de acceso, privilegios, eliminación/restauración SQL de esa fila y reversión de la transacción, con igualdad posterior de filas y permisos. Hash final: `b415191378ed6179982b8767a2c7deec068d249a840242675af9d3f312ae0330`. Archivo ignorado: `.tmp/studyhub-staging/evidence/planning-synthetic.sql`.

La reversión ensayada cubre datos y cierre reversible del acceso, **no la retirada de guardias o tablas de seguridad**. JWT y despliegue gestionado requieren ensayo cloud autorizado.

## Defectos corregidos

1. **Clientes antiguos eludían validación de referencias.** Podían cambiar tareas/proyectos manteniendo `projectPlans` intacto. La nueva migración `202611010001_consolidate_planning_guard.sql` exige validación del servidor para cualquier snapshot con planes antes o después del cambio. El gateway también dirige esas escrituras a `studyhub-plan`. Probado en SQL real y regresión.
2. **Autoría incorrecta al eliminar tareas.** El evento heredaba el último autor. Ahora registra la identidad actual o `local`, sin reescribir eventos previos.
3. **Migración anunciada sin sincronización.** Un resultado `synced: false` ya no cierra la migración como exitosa. Antes de importar planes a una cuenta se valida la transición; no se reasignan autores ni se encolan historias ajenas silenciosamente.
4. **Borrador de importación bloqueado.** Reproducido en Chrome: retenía una revisión antigua sin posibilidad de revisarla. Los formularios mutables ofrecen reconciliación explícita; no se modifica automáticamente la versión base del JSON ni se aplica la propuesta.
5. **Aprobación parcial perdía contexto.** Se conservan motivo y selección al recalcular la vista previa; el borrador queda identificado por propuesta. Verificado en tests y Chrome.
6. **Límite engañoso.** Aviso al 80% del espacio o 400 eventos. El error aclara que el cambio no se guardó y exportar no libera capacidad. Nunca se recortan eventos.

La primera regresión completa detectó dos expectativas antiguas de la llamada de eliminación; se actualizaron para comprobar también el autor. La última ejecución completa pasó todas las pruebas.

## Entregables: duplicación y decisión pendiente

| Aspecto | Entregables anteriores | Planificador |
|---|---|---|
| Fuente | `deliverables` y `deliveryStages` | Contenido versionado de `projectPlans` |
| Avance | Peso × 0 / 0,35 / 0,75 / 1 según estado | Solo peso verificado con criterios y evidencia válida |
| Verificación | Estado, fecha y dependencias | Actor, motivo, criterios, evidencia propia revisada y bloqueos |
| Historia | Estado actual | Comandos, propuestas y versiones |

No hay equivalencia segura para fusionarlos: un `verified` antiguo no acredita las evidencias del planificador y un nombre igual no demuestra identidad. Se añadió aviso contextual con enlace a los entregables anteriores. No se sumaron indicadores, copiaron estados ni crearon duplicados. **Esto no impide que una persona duplique manualmente un entregable en ambos lugares**; la integración definitiva sigue pendiente de producto.

Alternativas:

- **Recomendada:** adopción explícita de un catálogo canónico por proyecto, con vista previa de correspondencias por ID, archivo inmutable del modelo anterior y una única colección editable. Los estados originales conservan su procedencia, sin convertirse en nuevas verificaciones. Requiere decidir cuándo adoptar las reglas nuevas y cómo presentar el avance histórico.
- **Puente conservador:** catálogo anterior como autoridad y planificación vinculada por ID, sin crear un segundo entregable. Requiere una máquina de estados única y definir la relación entre aceptación anterior y verificación por evidencia.

No se aplicó ninguna migración de entregables ni fórmula nueva. El futuro asistente no debe escribir un mismo entregable en ambos modelos.

## Compatibilidad y procedencia

Se mantienen `schemaVersion: 2` y `modelVersion: 1`. No se transformaron snapshots existentes. Copias sin planes normalizan `projectPlans: []`; se preservan campos desconocidos y la importación anterior sin planes pasa sus pruebas.

**La migración de un plan local a una cuenta aún no está habilitada.** Se probó el rechazo seguro, no una importación exitosa. No se sustituye `local` por un UUID. El mensaje explica la necesidad de registrar procedencia. Una copia cloud antigua tampoco puede reescribir el prefijo histórico.

Para habilitarlo después: paquete versionado con hash del archivo original, fecha, cuenta importadora y origen declarado; historial original archivado sin afirmar que sus autores estaban autenticados. El evento identifica a quien importa, no a quien realizó cada acción. Las verificaciones importadas requieren revisión antes de acreditar avance actual. Remapear adjuntos a objetos privados propios de forma explícita, conservando la referencia original en el archivo.

Eliminar una tarea desvincula el elemento y marca sus adjuntos obsoletos sin borrar versiones. Restaurar una versión que exige una tarea eliminada falla de forma conservadora: no inventa tarea ni archivo. También puede fallar el replay de una cola que creó y eliminó una referencia dentro del mismo lote antes de su primera sincronización: el estado final no prueba esa referencia histórica. Se necesitan eventos o tombstones, no suposiciones.

El versionado de archivos actual comprueba metadata de modificación contra Storage. **No conserva los bytes sobrescritos:** el sistema anterior reemplaza el objeto del mismo nombre. Se conserva referencia histórica e invalidación, no recuperación binaria. Para esa recuperación se recomiendan objetos inmutables por hash y manifiesto de versiones, con política explícita de cuota/retención y enlaces privados.

## Límites y crecimiento

Límites conservados: 300 registros por colección, 100 operaciones por propuesta, 100 planes por snapshot; 500 eventos y 3.000.000 **unidades UTF-16 del JSON** por plan, no exactamente 3 MB; 150.000 unidades por comando; cuerpo HTTP total de 8.000.000 bytes, incluyendo otros planes y datos. La cuota del navegador puede limitar antes.

Ensayo de 300 elementos y 299 dependencias: 300 filas de escenario; estructura inicial de 1.509.840 unidades/13 eventos. Siete cambios más alcanzaron 2.955.614 unidades, 2.972.709 bytes y 20 eventos. El siguiente se rechazó preservando íntegro el estado anterior. Replay medido de 1.635 ms, no garantía de rendimiento. Otro ensayo conservó 500 eventos de un plan pequeño y rechazó el 501 sin recortes.

**Snapshots completos por versión no escalan todavía a proyectos extensos con cambios frecuentes.** El límite puede bloquear cualquier comando que añada historia, incluida la desvinculación de tareas. No se promete edición ilimitada.

Estrategia propuesta, no aplicada:

1. `modelVersion: 2`, eventos inmutables por plan y checkpoints verificables; historia paginada, sin eliminar eventos.
2. CAS por plan, unicidad `(cuenta, plan, commandId)` e inserción de evento/revisión/checkpoint en una transacción. El snapshot general contiene una referencia de lectura, no otra copia editable como segunda autoridad.
3. Comandos acotados en red, cola offline por revisión, fuentes seleccionadas y cuotas visibles; carga/renderizado bajo demanda.
4. Copia y hash de v1, importación paralela, comparación de conteos/orden/replay/métricas y conmutación explícita. Mantener lectura/exportación v1 y reversión hasta aprobar equivalencia. No borrar eventos ni recalcular métricas históricas.

## Experiencia y funciones conservadas

En Chrome, el borrador de riesgo conservó texto y selección tras recargar. La propuesta mostró 100% → 0% antes de aprobar el bloqueo; al aplicarlo retiró la verificación actual y mantuvo la versión anterior. Dos fuentes ficticias se importaron como propuesta: solo se aprobó la primera, conservando motivo y selección durante la vista previa. El historial mantiene v1–v7 y autores `local`. [Captura](evidence/consolidation-history.jpg).

Crear plan, añadir elemento/evidencia y verificar ya tenían evidencia de navegador en la entrega anterior; esta ronda amplió modificación, imprevistos, recuperación y aceptación parcial. La nueva matriz responsive corresponde al historial, no a todos los formularios repetidos en cinco tamaños. No hubo rediseño ni cambios de CSS.

| Función previa | Conservación |
|---|---|
| CRUD, proyectos completados/reapertura, recurrencias y agenda | Regresión completa; eliminación vinculada ahora registra autor |
| Temporizador, sesiones, reflexiones, imágenes y aprendizajes | Pruebas existentes pasan; lógica intacta |
| Adjuntos privados | RLS/reemplazo real y pruebas de limpieza |
| Evaluaciones, intentos/revisiones, medidores y horas | Sin nuevas fórmulas ni resultados; cero inferencias |
| Rutas educativas, copias e informes | Pruebas pasan; propuesta sigue separada del backup |
| Auth, caché, cola, CAS y conflictos | Integración real; guardia reforzada en cuentas con planes |
| Diseño estable y banderas | Conservados; planificación cloud desactivada |

## Asistente conversacional posterior

Reutilizar `PlanningProvider` para producir propuestas: `conversación → fuentes seleccionadas → contexto con revisión base → propuesta estructurada → validación → vista previa → selección humana → CAS`.

Cada solicitud necesita ID estable, propietario autenticado, plan/revisión, proveedor/modelo/versión de contrato y fuentes con versión/hash. Registrar cancelación, respuesta tardía y fallo parcial sin aplicar propuestas obsoletas. El mismo ID no duplica propuestas; otra revisión exige reconciliación.

Documentos y respuestas son datos no confiables: no conceden permisos, ejecutan instrucciones ni verifican evidencia. Enviar solo fragmentos seleccionados necesarios, excluyendo claves, sesiones, archivos no autorizados e historial ajeno. Las referencias externas no se convierten en prueba propia.

La IA no aprueba sus propuestas, atribuye autorías retrospectivas, inventa mediciones o porcentajes ni cambia fechas comprometidas sin revisión. Resolver primero catálogo canónico y almacenamiento versionado; no crear otra fuente de progreso dentro del chat. No se activó transporte IA en este encargo.

## Repetición, reversión y pendientes

Con Docker Linux operativo y el proyecto desechable existente:

```powershell
node scripts/run-planning-local.mjs
node scripts/measure-planning-capacity.mjs
npm test
npm run build
```

El ejecutor verifica el identificador, rechaza un proyecto enlazado, usa únicamente contenedores nombrados, aplica SQL local y sirve el handler en `127.0.0.1:54329`. Limpia sus fixtures y servicios iniciados. Si faltan servicios, usar primero `scripts/prepare-local-staging.ps1`. No mezclar `supabase migration up` con este ensayo directo de SQL: no modifica el registro de migraciones de la CLI.

Revisión visual: Vite con URL/clave Supabase vacías y bandera cloud desactivada; `/?localPreview=workspace#/projects`, proyecto sintético → Plan. La vista actual `127.0.0.1:5176` está separada de cuentas cloud.

Antes de activar cloud: decidir integración de entregables; implementar procedencia de importación; resolver escala v2; preparar referencias eliminadas e historia binaria si se requiere; actualizar clientes antiguos; ensayar despliegue/JWT y copias en staging cloud autorizado. Móvil físico, lector de pantalla y red lenta siguen pendientes.

Reversión operativa: cerrar escrituras mediante bandera y `disable_planning_writes.sql`, manteniendo datos y guardias. Apagar el endpoint en cuentas con planes implica dejarlas en lectura; no redirigirlas a escrituras antiguas sin validación. Las cuentas sin planes mantienen su camino anterior.

**Recomendación:** continuar la revisión local sobre un núcleo comprobado. No publicar ni habilitar todavía el asistente con escritura cloud. Los bloqueos siguientes son de procedencia, compatibilidad y escala; no requieren una nueva inferencia para diagnosticarse.
