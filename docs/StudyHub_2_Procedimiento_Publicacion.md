# StudyHub 2.0 — Procedimiento de publicación y reversión

29 de octubre de 2026. Procedimiento preparado; **no autoriza ni ejecuta producción**.

## Condiciones de entrada

- Decisión explícita de publicación; referencia, cuenta y ventana identificadas por el responsable.
- Candidato y lockfile fijados a un commit. Conservar el artefacto estable y sus variables públicas por separado. Nunca incluir secretos en Git, copias JSON o informes.
- Para IA activa: tres inferencias reales satisfactorias y cuota/coste aprobados. Una evaluación de dos proveedores son dos inferencias; sugerir áreas requiere otra. No activar IA por haber superado pruebas sintéticas.
- Documentar móvil físico, lector de pantalla y rendimiento en red lenta como pendientes hasta ejecutarlos.

## 1. Copia verificable y quiescencia

1. Anunciar una ventana de mantenimiento. En **cada dispositivo y perfil de navegador**, detener temporizadores, guardar borradores, sincronizar y exportar JSON. Registrar por cuenta/dispositivo si hay cola offline o error pendiente. No borrar caché ni cerrar a la fuerza una pestaña con datos sin exportar.
2. Detener nuevas evaluaciones y esperar las solicitudes en curso. Si alguna no termina, conservar su identificador y estado para recuperar la respuesta sin repetir la inferencia.
3. Guardar las copias locales fuera del repositorio, con acceso restringido. Incluir borradores locales no incorporados en la copia JSON según la versión del cliente. No asumir que todos los clientes antiguos exportan la misma información.
4. Con autorización específica y conexión al destino verificado, obtener una copia consistente de la base de datos (esquema, datos, funciones, permisos/RLS, políticas y configuración de Auth necesaria). Registrar versiones y migraciones realmente presentes, no solo el ledger: staging aplicó algunas migraciones mediante SQL explícito.
5. Copiar por separado **los bytes de todos los objetos privados de Storage**, con bucket, ruta, propietario, tamaño, tipo y SHA-256. Un dump SQL o un backup JSON de StudyHub no contiene necesariamente esos archivos. Incluir snapshots, sesiones, reflexiones/imágenes, recurrencias, ejercicios, evidencias, evaluaciones, entregables y registro de solicitudes.
6. Crear manifiesto con fecha UTC, commit, esquema/modelo, recuentos por tabla y hashes de cada archivo. Cifrar el respaldo sensible fuera de Git. Registrar quién puede restaurarlo.
7. Restaurar una copia en un destino aislado autorizado. Comparar recuentos, claves/referencias, revisiones e integridad de objetos; comprobar lectura por la cuenta correcta y denegación cruzada. La copia no se considera verificada solo porque el comando terminó.

**Punto de parada:** si falta un dispositivo con cola pendiente, una copia privada o la restauración verificable, no activar la barrera ni publicar.

## 2. Compatibilidad y actualización de clientes

1. Inventariar clientes antiguos abiertos y versiones offline. La aplicación ya cargada no se actualiza por publicar JavaScript nuevo.
2. Aplicar únicamente las migraciones faltantes, después de comparar esquema y hashes con el candidato. No ejecutar `db push` indiscriminadamente ni apuntar scripts de staging al destino real.
3. Preparar el cliente con `VITE_STUDYHUB_SNAPSHOT_RPC=true`. Mantener inicialmente las banderas de IA apagadas. La interfaz estable también debe usar RPC; apagar `workspaceV2` por sí solo no debe reintroducir escrituras directas.
4. Instalar la función RPC y la barrera de `supabase/transitions/enable_snapshot_cas.sql` durante la ventana, con copia y reversión preparadas. El SQL es transaccional: revoca escrituras directas de `authenticated`, mantiene lectura por RLS y valida propietario usando `auth.uid()`.
5. Publicar el cliente preparado. Pedir recarga a todos los dispositivos inventariados. Los clientes antiguos que aún usen upsert deben fallar al escribir; **no quitar la protección para permitirles guardar**. Conservar sus copias y reconciliar con el estado actual usando el cliente compatible.
6. Reconciliar conflictos por revisión antes de reanudar trabajo. No importar automáticamente una copia antigua por encima de datos nuevos. Conservar ambos conjuntos y un registro de decisiones.

## 3. Función real, IA y comprobaciones

- Desplegar exclusivamente los fuentes reales de `supabase/functions/studyhub-evaluate`. No usar `prepare-cloud-staging.ps1`, `staging-edge-wrapper.ts` ni archivos de `.tmp` como paquete de producción.
- Las opciones JWT dependen de la firma del destino. La función siempre debe validar la sesión con Auth; si se adapta la validación del gateway, comprobar JWT ausente/falso y sesión correcta en ese destino antes de habilitarla.
- Configurar claves solo en servidor. No usar `VITE_` para credenciales privadas. Verificar cuenta/proyecto de cada clave, modelo, cuota y facturación efectiva; la cuota diaria de StudyHub no es un límite monetario del proveedor.
- Con IA desactivada, comprobar con una cuenta de pruebas autorizada: Auth, CRUD, dos clientes con CAS, adjunto privado, temporizador/reflexión, descarga y restauración. No usar datos personales para el smoke test.
- Habilitar `workspaceV2` y después las banderas de IA solo con decisión explícita. Registrar commit/artefacto, versión de función, variables públicas y hora. Conservar resultados originales de proveedores y resoluciones sin promedios automáticos.
- Verificar que no haya nuevas escrituras directas, conflictos silenciosos, solicitudes duplicadas, exposición de objetos ni errores de Auth. Definir responsable y ventana de observación.

## 4. Reversión

1. Ante pérdida/mezcla de datos, acceso cruzado, duplicación de inferencias o fallos persistentes de sincronización: suspender nuevas acciones y apagar IA; guardar evidencias, colas y copia del estado posterior al fallo.
2. Preferir apagar `workspaceV2` conservando el cliente compatible con RPC y la barrera CAS. No eliminar tablas, historial ni archivos para volver al diseño estable.
3. Restaurar artefactos únicamente si son compatibles con el esquema actual. Para historia migrada, usar la copia verificada y reconciliar registros posteriores; no sobrescribir sesiones nuevas. No fusionar intentos antiguos sin identidad suficiente.
4. Volver al protocolo de escrituras directas es excepcional: requiere ventana sin clientes activos, exportar todas las colas y nueva copia; `disable_snapshot_cas.sql` restaura permisos y reintroduce el riesgo de sobrescritura antigua. No ejecutarlo como recuperación automática.
5. Verificar Auth, RLS, archivos, recuentos y cambios posteriores antes de reabrir. Mantener ambos respaldos hasta que el responsable confirme integridad.

## 5. Ensayo mínimo de IA en staging

`node scripts/verify-real-inferences.mjs` muestra el plan sin red. `--execute` exige claves de staging por variables de proceso y `.tmp/real-ai-preflight.json` con evidencia reciente (máximo dos horas), planes gratuitos sin desbordamiento facturable, modelos y cuota comprobada. Nunca rellenar esas comprobaciones con supuestos. Si Cloudflare no muestra el saldo, debe declararse `remainingNeurons: null`: solo se permite el ensayo bajo Workers Free con límite diario de 10.000, rechazo al agotarlo y API directa sin Gateway facturable, verificados expresamente. Esto no garantiza disponibilidad: puede devolver error de cuota, pero no autoriza excedentes pagos.

El esquema de preflight requiere `projectRef`, `authorized`, `checkedAt`; por proveedor: `plan`, `paidOverflowDisabled`, `model`, `modelAccessible`, `accountId`, `evidence`; además Gemini `remainingRequests`, Cloudflare `remainingNeurons` y `maximumEstimatedNeurons`. Usar los modelos definidos en `scripts/real-inference-plan.mjs`.

Para saldo Cloudflare desconocido exige además `hardFreeCapVerified`, `directApiWithoutGateway`, `dailyFreeAllocation` y `hardCapEvidence`. La cuota de Gemini observada en el dashboard puede llevar retraso; no es una reserva atómica. No habilitar facturación ni cambiar de modelo para sortear un error.

El ensayo reserva como máximo tres inferencias en un ledger local exclusivo **antes** de enviar contenido. Si se interrumpe, no eliminar el ledger ni repetir el comando: consultar primero los registros durables por los request IDs. Una respuesta parcial detiene el ensayo y conserva lo recibido; no se cambia de modelo ni se reintenta automáticamente. Reutilizar la respuesta local y el registro durable para validar persistencia evita otra inferencia. Las sugerencias permanecen propuestas, sin aceptación automática.

Después de inspeccionar una evaluación parcial, `verify-remaining-area-inference.mjs --execute` puede consumir exclusivamente el tercer slot aún no utilizado. Exige el reporte y ledger de esa misma ejecución y crea otro bloqueo exclusivo. Nunca repite las revisiones. Ambos bloqueos de la ejecución del 29 de octubre ya están consumidos. **No volver a ejecutar ni eliminar estos bloqueos para intentar otra vez.** Una nueva ronda requiere un presupuesto de solicitudes explícito y una revisión de la causa del fallo.

Las correcciones del handler pueden desplegarse únicamente a la referencia de staging mediante `prepare-real-cloud-staging.ps1 -Deploy -PreserveProviderSecrets`. Esta opción conserva las claves reales existentes, no las lee ni las copia, y registra otro manifiesto sin sobrescribir el primer paquete ensayado. No ejecutar después el paquete sintético ni sus suites de inferencia sobre este staging con claves reales.

No se ejecutó este procedimiento contra producción. La autorización posterior para reutilizar claves permite copiarlas a staging, pero no elimina la restricción sobre cargos ni autoriza publicar.
