# Planificación Inteligente — contrato de implementación

31 de octubre de 2026 · feat/studyhub-2 · decisión previa al código.

Fuentes leídas completas: Cubo_LED_Auditoria_Visual_70_paginas.md, Cubo_LED_Plan_Maestro_v02.md y StudyHub_Planificador_Dinamico_Propuesta_v02.md, proporcionadas en Downloads. Se contrastaron con cierre de candidato, verificación local, cierre cloud, procedimiento de publicación y arquitectura de evaluación. Las fuentes son contexto de diseño: no certifican la ejecución del montaje propio ni autorizan cambios de infraestructura.

## Matriz de trazabilidad

| Fuente / requisito | Capacidad actual | Cambio | Aceptación |
|---|---|---|---|
| Auditoría pp. 1–70: referencia externa no es evidencia propia | Evidencia académica y adjuntos privados | Fuentes versionadas y procedencia obligatoria; aprobación humana separada | Fotograma externo no verifica entregable |
| Auditoría pp. 19–30; Maestro G02–M10: contradicciones, medidas y bloqueos | Tareas y dependencias de entregables simples | Hechos con fuentes, relaciones tipadas, riesgos y resolución explícita | Falta de pieza bloquea dependientes, sin borrar historial |
| Auditoría pp. 41–70; Maestro E01–E11: aceptación técnica | Estado verificado previo | Criterios enumerados y evidencia aprobada por criterio | Completar o subir una foto no aumenta avance |
| Maestro §6; Propuesta §1/4 | Indicador de dominio y entregables existente | Tres métricas separadas, actividad aparte, pesos sin valores implícitos | Sin pesos/definición: sin estimar; sesiones no cambian avance |
| Maestro S01–I08; Propuesta §5 | Competencias/evaluaciones reales | Requisitos de conocimiento, evidencias y vínculo a actividades | Nuevo requisito Sin evaluar; no adopta notas prestadas |
| Maestro §3/8; Propuesta §3/5 | Fechas locales y recurrencias | Rangos de formación/construcción, disponibilidad, escenarios explícitos | Estimar no modifica fechas objetivo/límite |
| Propuesta §2/3/7 | Historial de intentos, CAS y copias | Plan versionado; propuestas con diff, aprobación parcial, reversión por nueva versión | Base obsoleta falla; rechazar no cambia contenido |
| Propuesta §6/7 | Servicios Gemini/Cloudflare, banderas y fallos parciales | Interfaz de proveedor desactivada; importación manual revisable | Sin red IA; nunca aceptar una salida automáticamente |
| Encargo: privacidad y servidor | Snapshot por user_id, RLS, CAS/RPC, Storage privado | Colección aditiva y endpoint con validación/replay; guardia SQL frente a clientes antiguos | Dos cuentas aisladas; escrituras de planes solo por servidor validado |
| Encargo: UX y conservación | Mesa de trabajo, borradores, temporizador | Vista Plan separada, formularios semánticos, mismos adaptadores | Cinco anchos, teclado, copias y suite anterior |

## Decisiones de modelo y seguridad

- `projectPlans` es una colección opcional aditiva en el snapshot v2. Ausente equivale a vacía; no se transforma historia académica ni entregables antiguos automáticamente.
- Un plan por proyecto: revisión monotónica de comandos, versiones inmutables de contenido y métricas, eventos append-only, propuestas conservadas. Fases, hitos, actividades, entregables y conocimientos son elementos genéricos; dependencias, fuentes, hechos/decisiones, riesgos y evidencias son registros relacionados por ID.
- Todo cambio de alcance se propone y se aprueba explícitamente. La aceptación parcial produce una versión; el remanente queda ligado a la base anterior y exige reconciliación explícita. Cambiar pesos muestra el cambio del denominador. Restaurar una versión crea otra; nunca trunca eventos.
- Verificación humana exige criterios completos y evidencia propia aprobada. Declaraciones, referencias externas, evidencia rechazada/obsoleta/incompleta y evaluación IA no equivalen a verificación. Un cambio posterior de evidencia invalida la verificación derivada. Cada cifra expone sus IDs y se congela por versión y fecha.
- Dependencias bloqueantes/secuenciales/conocimiento/recurso/aprobación impiden disponibilidad mientras su origen no esté verificado. Informativas no bloquean. Ciclos bloqueantes se rechazan: resolver retirando o reclasificando explícitamente una relación con motivo.
- No se crean tablas compartidas ni buckets públicos. Se mantiene índice PK `studyhub_states(user_id)` y aislamiento de fila existente. No hace falta un índice JSON global: se carga un snapshot por cuenta y se busca por projectId en memoria.
- Cloud: validación compartida cliente/servidor, replay de comandos para impedir estados verificados falsificados, RPC de escritura solo para service_role con CAS y propietario autenticado obtenido por la Edge Function. Trigger rechaza cambios de planes desde escrituras directas/cliente antiguo. El cliente cloud no habilita escritura de planes hasta activar explícitamente la bandera del endpoint instalado; resto de funciones continúa disponible.
- Adjuntos: reutilizar tarea/Storage privado; guardar referencias y huella de la versión del archivo, nunca URLs firmadas durables ni bytes en diagnósticos. El archivo de referencia se abre desde la tarea; referencia externa no se aprueba como prueba propia.
- Copias JSON incluyen planes/historial; los bytes privados de Storage se respaldan aparte como ya exige el procedimiento de publicación. Importar un plan es una propuesta, no restaurar una copia completa.
- Migración preparada, no aplicada remotamente: guardia + RPC. Reversión visual oculta Plan sin borrar datos. Reversión SQL revoca el nuevo endpoint, conserva la guardia y los datos; retirar protección requiere copia y reconciliación, no una eliminación automática.
- IA: interfaz preparada, sin transporte activo por defecto, sin inferencias, claves ni reintentos. No hay extracción automática de PDFs o promesas de diagnóstico técnico. Las fuentes/notas se capturan manualmente y las propuestas JSON se validan y revisan.

## Límites explícitos de esta entrega

Las estimaciones son escenarios deterministas con supuestos; no predicción estadística ni certificación de competencia. No se ejecutan acciones sobre hardware. Datos del Cubo LED se usan solamente como fixtures sintéticos. Publicación, instalación del endpoint cloud y activación de IA permanecen bloqueadas a autorización posterior. Móvil físico, lector de pantalla y red lenta se documentarán como pendientes si no se ejecutan.
