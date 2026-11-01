# Planificación Inteligente de Proyectos — entrega y verificación

1 de noviembre de 2026 · rama `feat/studyhub-2`.

**Resultado: implementación manual lista para revisión local. Activación cloud bloqueada hasta ejecutar la nueva verificación con Supabase desechable. IA desactivada.** No hubo merge, push, publicación, cambios en producción ni inferencias reales.

El commit de esta entrega se identifica con `git log -1 --format=%H -- docs/planning/StudyHub_Planificacion_Entrega.md`. La matriz y las decisiones previas al código están en [StudyHub_Planificacion_Contrato.md](StudyHub_Planificacion_Contrato.md).

## Funcionalidad terminada

- Vista **Plan** dentro de cada proyecto en Mesa de trabajo: resumen, estructura, dependencias, evidencias, conocimientos, riesgos, fuentes/decisiones, escenarios, propuestas e historial.
- Fases e hitos como agrupadores; entregables, actividades y conocimientos genéricos. Las actividades pueden vincularse a tareas existentes para abrir su temporizador y sus adjuntos. Crear un elemento del plan no crea silenciosamente otra tarea ni duplica tiempo.
- Contexto con objetivo, alcance, restricciones, definición de terminado, disponibilidad y supuestos. El ciclo de vida se conserva en el proyecto: completar/reabrir determina si se permite editar el plan.
- Estados Pendiente, En proceso, Bloqueado, Por mejorar, Por corregir, Completado y Verificado. Un bloqueo explica sus causas. Completar es una declaración; verificar requiere criterios, evidencia propia aprobada y decisión identificada.
- Tres indicadores separados: pesos de entregables verificados, cobertura de evidencias y requisitos de conocimiento demostrados. Sin definición/pesos suficientes no hay porcentaje de avance. Tiempo, sesiones, reflexiones y tareas completadas aparecen aparte y no alteran ninguno de esos cálculos.
- Relaciones tipadas, detección de ciclos bloqueantes, riesgos con responsable/cierre y fuentes con versiones. Las contradicciones conservan ambos registros.
- Evidencias como notas, resultados técnicos, referencias o adjuntos privados de tareas. La procedencia externa o declarada no puede aprobarse como prueba propia. Cada criterio puede comprobarse en la estructura; las revisiones muestran actor, fecha y motivo.
- Reemplazar un archivo desde el cliente nuevo invalida su evidencia. Cambiar criterios o la fuente de una aprobación exige revisarla de nuevo. Los dependientes pierden su verificación cuando dejan de satisfacer requisitos.
- Propuestas estructuradas antes/después: creación manual, plantilla/importación por texto JSON, edición del JSON pendiente, selección parcial, rechazo y reconciliación de bases antiguas. Ninguna propuesta se aplica por importarla.
- Historial de comandos y versiones con métricas congeladas; comparación y recuperación como una versión nueva. Restaurar conserva los eventos y exige nueva revisión de las evidencias recuperadas.
- Escenarios por rangos de formación/construcción, dependencias, disponibilidad y bloqueos. Un rango desconocido no se interpreta como cero. Las secuencias pendientes comienzan al día siguiente del requisito, bajo ese supuesto conservador; no son un optimizador de recursos ni una garantía de fechas. No sobrescriben fechas elegidas.
- Exportación del plan/historial JSON y un informe Markdown. Las copias generales incluyen la nueva colección. Formularios con borradores por cuenta/proyecto/elemento y revisión base conservada al recargar.
- Interfaz de proveedor preparada: selección explícita de contexto/fuentes, consentimiento, cancelación, validación de propuesta y proveedor/modelo identificados. No hay transporte activo, extracción automática ni respuestas simuladas presentadas como IA real.

## Datos, compatibilidad y seguridad

`schemaVersion` continúa en 2. Se añade `projectPlans`, opcional en copias antiguas, con `modelVersion: 1`, revisión de comandos, versiones, propuestas y eventos. No se convierten ni fusionan evaluaciones académicas, entregables o historial anteriores. Cada versión almacena su fecha y el resultado del cálculo. Una futura modificación de esas reglas debe versionar el modelo.

Se reutilizan Repository, adaptadores, caché y cola offline. No se crean tablas ni buckets adicionales. El aislamiento sigue siendo la fila `studyhub_states(user_id)` con su PK/RLS y el bucket privado existente.

El endpoint `studyhub-plan` autentica al usuario, valida el snapshot, reproduce los comandos añadidos, comprueba las versiones de archivos aprobados con el token del usuario y guarda mediante una RPC CAS exclusiva del servidor. Una guardia SQL rechaza cambios directos a `projectPlans`; se revoca el borrado directo del snapshot para impedir borrar/recrear y saltarse el historial. Borrar proyectos mediante los comandos existentes conserva su comportamiento de cascada autorizado.

La bandera `VITE_WORKSPACE_PLANNING_CLOUD_READY=false` impide habilitar esta escritura antes de instalar y probar las protecciones. `workspaceV2` sigue protegiendo la nueva experiencia. No debe activarse la bandera contra un entorno sin migración y endpoint validados.

Las copias locales conservan planes. Restaurar una copia cloud antigua no puede reescribir un historial posterior ni importar autorías ajenas como propias: puede producir un conflicto explícito. La migración de planes locales con autor `local` hacia una cuenta y la recuperación cloud completa de historias que referencian tareas ya eliminadas requieren un procedimiento específico, aún pendiente; no se relaja la validación para aceptarlas automáticamente. Los archivos privados se respaldan por separado del JSON, como antes.

Límites defensivos actuales: 100 planes por snapshot; 300 registros por colección del plan; 100 operaciones por propuesta; 500 eventos y 3 MB por plan; 8 MB por solicitud del endpoint. Al alcanzar un límite se rechaza el cambio conservando el estado anterior. No se compacta ni elimina historia automáticamente. Las versiones de contenido son copias completas: proyectos extensos necesitan validar el tamaño antes de activar cloud.

## Resultados comprobables

| Verificación | Resultado y alcance |
|---|---|
| Suite completa | **261/261**, cero fallos; reporte resumido en `verification.json` |
| Planificador | **41 pruebas** de reglas, repositorio, servidor y transporte con datos/respuestas sintéticas |
| Compilación | Correcta, 92 módulos; JS 575,45 kB / gzip 160,87 kB. Persiste advertencia de paquete superior a 500 kB |
| Secretos | Escaneo por patrones de fuentes y dist sin hallazgos; no es garantía exhaustiva |
| Navegador real, modo local | Crear plan → proponer → aprobar → registrar evidencia → aprobar evidencia → verificar → recargar; datos sintéticos identificados |
| Separación de métricas | Registro: avance 0%; evidencia aprobada: cobertura 100%, avance 0%; decisión de verificar: avance 100%. No representa construcción real del Cubo LED |
| Borrador | Texto y selección de criterios conservados tras recargar |
| Responsive | Formulario y resumen en **320, 390, 740, 1024 y 1440 píxeles CSS medidos**; sin desbordamiento horizontal ni objetivos táctiles nuevos menores de 44 px en esos recorridos. Todos los apartados revisados adicionalmente en 320/1440 |
| Teclado | Tab lleva de Resumen a Estructura; Enter activa el apartado. Estilos de foco y reducción de movimiento presentes |
| Concurrencia/offline | Pruebas sintéticas con dos clientes: conflicto visible, nube sin sobrescribir, borrador local y copia de conflicto preservados; sincronización a otro cliente |
| Handler | Autenticación rechazada, propietario derivado de sesión, replay, CAS 409, confirmación perdida, adjunto obsoleto y bandera desactivada, con Auth/HTTP controlados en tests |
| Supabase real del planificador | **No ejecutado**. Docker no respondió; el arranque quedó pendiente y no hubo servicio local en 54321. No se aplicó la nueva migración ni se sirvió el handler en Deno |
| IA real, móvil físico, lector de pantalla, red lenta | **No ejecutados** |

Capturas y mediciones: [evidence/layout-checks.json](evidence/layout-checks.json), [resumen escritorio](evidence/plan-summary-1440.png), [formulario móvil](evidence/plan-form-320.png). La escala del navegador exigió ajustar el viewport y comprobar `innerWidth`; no se confundió el tamaño solicitado al navegador con los píxeles CSS reales. Hubo interrupciones del control de una pestaña; se recuperó con una pestaña nueva y se completaron las mediciones. No se ampliaron permisos de la extensión.

## Prueba local pendiente, preparada

1. Abrir Docker Desktop y esperar a que el motor Linux esté operativo. La señal verificable es que `docker info` responda. Si queda en blanco o iniciando, resolver ese arranque antes de continuar; no reiniciar/eliminar volúmenes de otros proyectos.
2. Ejecutar `scripts/prepare-planning-staging.ps1`. Copia código/migraciones únicamente al proyecto desechable `.tmp/studyhub-staging`, cuyo identificador valida. Este paso sí se ejecutó; no toca la base de datos.
3. Usar la CLI Supabase 2.122.0 del procedimiento anterior para `start --workdir .tmp/studyhub-staging`, después `migration up --local --workdir .tmp/studyhub-staging`. No usar `--linked`, tokens cloud ni claves reales.
4. Servir `functions serve studyhub-plan --workdir .tmp/studyhub-staging`. Si hay un antiguo contenedor sintético ocupando el mismo puerto, detener exclusivamente ese servicio local identificado antes de servir la función real.
5. En otra consola ejecutar `scripts/run-planning-staging.ps1`. Obtiene claves generadas por el entorno local sin imprimirlas y llama a `scripts/verify-planning-staging.mjs`.
6. Exigir resultado `passed`: Auth, dos cuentas sintéticas, RLS, guardia de escrituras directas, RPC exclusiva, CAS concurrente, archivo privado/versionado, recuperación e idempotencia. El ejecutor solo acepta `http://127.0.0.1:54321`, crea fixtures y limpia únicamente sus cuentas/archivo. No llama a proveedores.

El rechazo del ejecutor sin configuración local se comprobó y es una protección, **no una prueba de integración aprobada**. Falta además probar la revocación/reversión SQL en una copia desechable y el empaquetado real Deno de las importaciones compartidas. Las pruebas históricas de Supabase no se cuentan como prueba de estas nuevas piezas.

## Activación y reversión futura

Antes de cualquier activación autorizada: exportar JSON por cuenta, conservar copia verificable del snapshot/revisión y copiar los objetos privados. Comparar conteos/hash de copias, instalar migración y endpoint en staging, ejecutar la prueba anterior y ensayar restauración. Actualizar clientes antiguos y sus colas pendientes antes de abrir escrituras; una copia vieja nunca debe ganar por fuerza sobre CAS.

La primera reversión es desactivar la bandera cloud y `workspaceV2`, conservando todos los datos. `supabase/transitions/disable_planning_writes.sql` revoca la RPC nueva manteniendo guardia e historial. No borra planes, evidencias ni archivos. Volver a conceder escritura o retirar la guardia exige una revisión posterior; no hay una migración destructiva automática.

Un cliente antiguo que sustituya un archivo por fuera del flujo nuevo no actualiza inmediatamente las métricas guardadas: el siguiente guardado de plan detecta la versión inválida. Por ello la actualización de clientes y el ensayo de Storage son condiciones previas a habilitar cloud. No se afirma una comprobación continua de archivos en segundo plano.

## Conservación y veredicto

| Capacidad anterior | Tratamiento |
|---|---|
| Proyectos, cierre/reapertura, tareas, recurrencias | Conservados; eliminación de tareas desvincula el plan e invalida sus referencias sin truncar versiones |
| Temporizador, sesiones, reflexiones, imágenes | Lógica conservada; solo lectura para actividad separada |
| Adjuntos privados | Almacenamiento y descargas existentes; referencia versionada y aviso de sustitución añadidos |
| Evaluaciones, intentos/revisiones y medidores académicos | Sin nuevas fórmulas ni migración de resultados; indicadores del plan independientes |
| Importación educativa, copias e informes | Conservados; importación de propuestas separada, planes incluidos en copia general; restricciones cloud explicadas arriba |
| Auth, caché, cola, CAS, privacidad | Reutilizados; nueva escritura protegida y aún desactivada |
| Interfaz estable | Conservada detrás de las banderas existentes; estilos nuevos limitados a Plan |

Los ajustes de diagnóstico de proveedores que ya estaban pendientes al comenzar este encargo se conservan en un commit separado. Sus pruebas de regresión están en la suite; no implican que las inferencias reales hayan sido reintentadas ni resueltas.

**Recomendación:** revisar el flujo manual local ahora. **No publicar todavía la planificación cloud**: falta ejecutar SQL/RLS/Storage/handler real y reversión en el entorno desechable, resolver la migración de planes locales a cuentas y validar límites de tamaño con un proyecto extenso. IA continúa bloqueada a la autorización y validación de proveedores ya pendientes. Esta entrega no importa el proyecto real del Cubo LED ni atribuye aprendizaje, mediciones o avances ficticios al usuario.

Para revisar sin credenciales: iniciar Vite con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` vacíos, `VITE_WORKSPACE_PLANNING_CLOUD_READY=false`; abrir `/?localPreview=workspace#/projects`, entrar en un proyecto y pulsar **Plan**. La vista previa local utiliza datos separados de las cuentas cloud.
