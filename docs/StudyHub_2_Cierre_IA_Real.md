# StudyHub 2.0 — Cierre de las pruebas de IA real

29 de octubre de 2026 · Rama `feat/studyhub-2`. Continúa el informe cloud del 28 de octubre; sus resultados anteriores son históricos, no una afirmación sobre esta ejecución.

**Veredicto: bloqueada la publicación con IA activa.** Las claves funcionan y el registro está confirmado, pero ninguna de las tres inferencias previstas produjo un resultado aceptado. No se simulan evaluaciones, no se aumentó el presupuesto ni se habilitaron servicios de pago. La candidatura con IA desactivada conserva las condiciones del informe anterior.

Commit exacto de este cierre: `git log -1 --format=%H -- docs/StudyHub_2_Cierre_IA_Real.md`. Base `4c8b16cda9d388d644cf1b7512c63dd85df81b87`. `main` sigue en `4210809303a0dad2825c3bde2324196eda5992a4`. No hubo merge, push ni despliegue de StudyHub/Netlify. Solo se actualizó la Edge Function del staging autorizado.

## Resultados comprobados

| Comprobación | Resultado |
|---|---|
| Registro público con buzón de pruebas autorizado | Registro aceptado, correo confirmado y login posterior correcto. `cloud-authorized-registration-results.json`. No se desactivó confirmación. |
| Handler real sin transporte sintético | Desplegado a `uchsgbpohigrtwpsxlnx`; hashes en los manifiestos `cloud-real-handler-*-package.json`. Autenticación obligatoria mediante Auth. |
| Auth y validación del handler | 12 checks antes de configurar claves; 11 tras la corrección con claves reales: todos correctos. La diferencia es el estado «no configurado», que ya no corresponde. Ningún check de esta suite hace inferencias. |
| Conexión a proveedores | GET de metadatos autenticado correcto para ambos; no equivale a una inferencia correcta. |
| Revisión Gemini real | Falló: mensaje original de alta demanda del modelo. Ninguna nota guardada. |
| Revisión Cloudflare real | Falló: JSON rechazado por el validador. No se reparó ni convirtió en evaluación. |
| Sugerencia Gemini real | Falló: el handler anterior recibió respuesta HTTP no satisfactoria y devolvió su aviso de continuar manualmente. No conservaba el código exacto: no se afirma que fuera la misma saturación. |
| Presupuesto | Exactamente tres solicitudes de inferencia: dos Gemini (revisión y áreas) y una Cloudflare. Dos POST de aplicación. Sin reintentos ni modelos alternativos. |
| Suite automatizada final | **214/214**, cero fallos; incluye 8 pruebas del límite de ensayo y 4 nuevas pruebas del diagnóstico de proveedor. |
| Build | Correcta, 88 módulos, 3,08 s. Mantiene aviso de chunk >500 kB (JS 518,73 kB, gzip 142,57 kB). No es una medición de red lenta. |
| Revisión de secretos | 160 archivos de texto versionables y artefactos examinados por patrones: cero hallazgos. No equivale a una auditoría exhaustiva. |

Evidencias en `docs/studyhub2/cloud-real-inference-results.json`, `cloud-real-area-results.json`, `cloud-real-inference-preflight.json`, `cloud-real-handler-results.json` y `cloud-closure-release-checks.json`.

## Plan, cuota y coste

- Google AI Studio: clave nueva de pruebas en `gen-lang-client-0979111398`, nivel gratuito. Gemini 3.8 Flash mostraba 0/5 RPM, 0/250K TPM y 0/20 RPD en la vista de máximos de 28 días. La página advierte retraso de hasta 15 minutos; el dato no es una reserva de cuota.
- Cloudflare: cuenta de staging observada con Workers **Free $0 / Current plan**, modelo `@cf/openai/gpt-oss-120b`. La [documentación oficial](https://developers.cloudflare.com/workers-ai/platform/pricing/) permite 10.000 neuronas/día y rechaza al agotar Free; hace falta cambiar a Paid para excedentes. La API usada no incluye un Gateway de créditos.
- El panel no mostró saldo diario exacto de Workers AI. Se registró desconocido, sin inventar 10.000 disponibles. La estimación conservadora de 5.000 neuronas usa todo el contexto de 128k más 1.800 de salida a las tasas publicadas; el ejercicio real era mucho menor.
- No se activó facturación ni se aprobó consumo pagado. Los errores no incluyen uso exacto; **no se afirma consumo cero de tokens/neuronas ni se presenta una factura auditada**. La ejecución se autorizó bajo los planes gratuitos comprobados.

## Corrección realizada sin nuevas inferencias

El fallo real puso de manifiesto que se descartaban los metadatos útiles cuando una respuesta no era JSON válido. Ahora el handler distingue límite de salida, bloqueo de contenido y JSON inválido; conserva motivo de finalización, longitud y contadores numéricos disponibles en el error durable. No guarda prompts ni el cuerpo arbitrario del proveedor en el diagnóstico.

También identifica HTTP 503 como proveedor saturado y conserva código/estado de errores de sugerencias. La salida truncada se rechaza incluso si contiene un fragmento JSON parseable. No cambia puntuaciones, rúbricas, perfiles, máximos de tokens ni modelos.

Estas correcciones pasaron pruebas con red sintética y se desplegaron solo en staging. **No se repitió la inferencia Cloudflare**, por tanto no se atribuye retrospectivamente su fallo a truncamiento ni se declara reparada su compatibilidad. Para determinarlo hace falta una nueva solicitud controlada con el diagnóstico añadido. El error Gemini puede ser temporal, pero falta una revisión exitosa real.

## Conservación, privacidad y limpieza

- Se mantuvieron los datos, arquitectura y experiencia estable; no cambió el esquema ni se ejecutó otra migración.
- Los ejercicios enviados fueron ficticios y pequeños; no se enviaron adjuntos, historial de otra persona ni datos reales del estudiante.
- Las cuentas sintéticas de esta ronda de inferencias y del handler se eliminaron junto con sus filas, después de guardar los reportes de error. El buzón autorizado para confirmación y la cuenta preparada para selector de archivos no se eliminaron.
- Los resultados erróneos no se convirtieron en notas. Un intento con dos revisiones, persistencia de resultados válidos y aceptación de áreas reales siguen **pendientes de aprobación con proveedores reales**, aunque sus contratos y las anteriores pruebas sintéticas ya estaban aprobados.
- Las claves nuevas quedaron en secretos de staging; no se exportaron ni se añadieron a Git. Los helpers locales con credenciales están bajo `.tmp`, ignorado. No se usó Supabase de producción.
- La ejecución consume sus bloqueos locales antes de inferir. No eliminarlos para volver a probar. Ante un timeout incierto se conserva la cuenta sintética para recuperar el resultado durable antes de limpiar.

## Pendientes y acciones mínimas

1. **IA:** realizar una nueva ronda pequeña cuando Gemini esté disponible; primero inspeccionar una respuesta Cloudflare con el diagnóstico añadido. Fijar de nuevo máximo de solicitudes y revisar cuota/plan. No hacen falta más claves mientras sigan vigentes. No activar IA en producción hasta obtener las dos revisiones y la propuesta de áreas válidas. La tercera solicitud de esta ronda ya se utilizó: no queda un slot libre.
2. **Selector de archivos Chrome:** permanecen sin ejecutar restauración, importación educativa y adjuntos desde el selector. La extensión bloquea asignar archivos sin acceso a URLs de archivo; el control nativo tampoco pudo abrir el selector. No se amplió el permiso. Puede completarse con selección manual por el usuario en la cuenta sintética de `127.0.0.1:5175`, no en Netlify: restaurar la copia sintética verificada, importar una ruta con vista previa e intentar importarla de nuevo, adjuntar un documento y reemplazarlo con el mismo nombre; descargar y comparar el contenido, recargar y comprobar persistencia. No confundir los checks de Storage por backend ya aprobados con esta comprobación UI pendiente.
3. **Accesibilidad/dispositivos:** móvil físico, lector de pantalla y rendimiento con red lenta siguen sin ejecutarse; los viewports y teclado previamente revisados no los sustituyen.
4. **Publicación:** ejecutar, con autorización posterior, el procedimiento de backup y restauración verificable, actualización de clientes antiguos, protección CAS, despliegue y reversión de `StudyHub_2_Procedimiento_Publicacion.md`. Aquí solo se preparó; no se tocó producción.

### Archivos preparados para la comprobación manual

En `.tmp/file-picker-check/`, dentro del repositorio, quedaron `backup-sintetico.json`, `ruta-sintetica.json`, `version-1/documento.txt` y `version-2/documento.txt`. No contienen datos personales. La copia coincide por SHA-256 con la exportación sintética ya verificada del 28 de octubre (`18854df0745ba59d2613d79872422d780eff0b0066840f86732d1503806426fa`). Preparar estos archivos no acredita que Chrome los haya seleccionado.

En **Configuración y privacidad → Restaurar copia JSON**, seleccionar el backup y confirmar solo en la cuenta sintética de staging. Debe recuperar 1 proyecto, 2 tareas, 1 sesión cronometrada, 2 reflexiones y 1 revisión manual ficticia. Después **Importar ruta educativa**, seleccionar la ruta, revisar la vista previa y confirmar; una segunda importación debe evitar el duplicado. En una tarea, **Adjuntar** el documento de version-1, luego el de version-2 con el mismo nombre: debe quedar un adjunto, descargar el texto de versión dos y persistir al recargar. No usar la cuenta principal ni restaurar este backup en producción.

## Cómo revisar y reproducir sin gasto

- `npm.cmd test` y `npm.cmd run build` no hacen inferencias reales.
- `node scripts/verify-real-inferences.mjs` y `node scripts/verify-remaining-area-inference.mjs` sin `--execute` solo describen el ensayo.
- La suite `verify-real-cloud-handler.mjs` usa las credenciales de staging en variables de proceso y la referencia permitida; comprueba solicitudes inválidas y metadatos, nunca envía una evaluación válida.
- La UI de staging mantiene las banderas de IA deshabilitadas. La corrección del backend no activa botones ni llamadas automáticas en el cliente.
- No volver a desplegar el wrapper sintético sobre staging mientras conserve las claves reales. Consultar el procedimiento antes de cualquier nueva ejecución.

No recomiendo publicar con IA activa todavía. El bloqueo es verificable y acotado a respuestas reales y comprobaciones UI pendientes, no a la necesidad de rehacer StudyHub.
