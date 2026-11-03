# Entrega de la ampliación del planificador

3 de noviembre de 2026 · Rama `feat/studyhub-2` · Revisión local

El apartado **Plan** reúne el resumen, el árbol, las entregas, el historial y el asistente manual. El usuario puede registrar un cambio, revisar su efecto y aceptarlo parcialmente. El medidor sigue la regla de entregables verificados. Una sesión, una tarea completada y una evaluación académica conservan sus propios registros.

## Matriz de ejecución

| Etapa | Resultado implementado | Comprobación y límite |
|---|---|---|
| A · Conservación | El trabajo anterior quedó en el commit local separado `7559f99`. La matriz aprobada acompaña la rama. | La línea base registrada era de 276 pruebas. El documento independiente «Continuación de implementación y mejoras integrales» no estaba disponible como archivo. Se conservó el alcance explícito del contrato y de la aprobación. |
| B · Modelo y persistencia | Catálogo canónico con adopción explícita, correspondencias por ID, archivo de registros anteriores y reversión. Categorías reutilizables. Originales privados y entregas versionadas. Historial local segmentado e historial SQL por cuenta. | Pruebas de transición, autoría, integridad, restauración, aislamiento y concurrencia. La importación inicial requiere cuenta vacía. Las copias que necesitan transferir archivos privados requieren reconciliar los permisos y los bytes. |
| C · Avance e historia | La regla v1 conserva pesos y criterios. La cobertura, el aprendizaje y las horas tienen lecturas separadas. Las verificaciones afectadas se invalidan y la revisión semanal conserva referencias a sesiones, entregas y eventos. | Pruebas de cálculo, datos insuficientes, revisión e invalidación. La revisión semanal permite proponer un imprevisto para aprobación humana. |
| D · Árbol y exportación | Búsqueda, selección, zoom, expansión, lista por teclado, relaciones y ficha. Paquete ZIP por alcance, período y consentimientos, con estimación, manifiesto, exclusiones y SHA-256. | Descarga desde navegador y verificación independiente de archivos internos. Pruebas de Unicode, referencias, privacidad, límites, fallo de lectura y cancelación. |
| E · Conversación | Mensaje con contexto seleccionado y versión base, borrador, importación o creación manual de propuesta, revisión, rechazo y aceptación parcial. | El transporte inyectable se probó con respuestas sintéticas, cancelación, reintento y base obsoleta. El proveedor real sigue desactivado y requiere autorización independiente. |
| F · Regresión y uso | Se conservaron las rutas de proyectos, tareas y enfoque. El plan reúne las herramientas existentes en cinco apartados. | 306 pruebas en 43 archivos y compilación correcta. Los cinco apartados se abrieron por teclado en cinco anchos. La expansión se verificó en Supabase local desechable. |

## Datos, compatibilidad y recuperación

- **Planes anteriores.** El lector conserva el modelo v1. Desde la interfaz, la conversión a v2 prepara la descarga de una copia JSON y registra una huella de la fuente. Los checkpoints completos y las diferencias reconstruyen el contenido en su orden original. El cálculo comprueba las métricas históricas aunque PostgreSQL reordene las claves JSON. El límite v2 es de 20.000 eventos u 8 MiB por plan, lo que se alcance primero. Llegar al límite rechaza el cambio antes de publicarlo en el estado.
- **Catálogo.** Un proyecto con entregables anteriores requiere vista previa y confirmación. Las colisiones necesitan correspondencias explícitas. Al adoptar se conservan las etapas, los entregables y sus evidencias originales. El catálogo anterior queda protegido de edición. Una verificación antigua requiere revisar los criterios actuales. La reversión directa está disponible hasta que haya cambios posteriores. Después se conservan ambas historias para reconciliación.
- **Autoría.** Al importar historia local se archivan el plan original, su SHA-256, el importador y la fecha. El historial conserva sus autores y las verificaciones importadas requieren revisión. Hay una prueba real de rechazo de un hash alterado.
- **Entregas y archivos.** La entrega extiende el ejercicio existente con un propósito técnico, académico o compartido. Cada envío crea una versión y conserva la anterior. La evaluación académica mantiene el modelo de intento con varias revisiones. Un original nuevo tiene clave privada, propietario, tarea, fecha, tamaño y hash de contenido. El registro local de subidas permite recuperar una entrega interrumpida desde el mismo borrador. No existe una eliminación automática de objetos huérfanos. Las imágenes históricas comprimidas conservan la representación disponible.
- **Caché y sincronización.** IndexedDB conserva segmentos, un puntero actual y una copia anterior. La caché cloud y la cola v2 utilizan espacios por cuenta en navegadores compatibles. La cola guarda su revisión base. El cliente envía los comandos añadidos y la huella del resultado. El handler reconstruye, valida y guarda con CAS. Los lectores actuales reciben un estado hidratado. Las lecturas y el primer envío siguen teniendo límites de memoria y transporte.
- **Reversión operativa.** Antes de adoptar, conservar la copia descargada y comprobar que se puede abrir. Para detener escrituras en un entorno autorizado, desactivar la bandera de planificación cloud y aplicar la transición existente `disable_planning_writes.sql`. Conservar las tablas, las guardas y Storage. La restauración completa requiere el snapshot, las cabeceras, eventos, versiones y los originales privados. El ZIP de revisión sirve para consultar o compartir el alcance elegido. La restauración de la aplicación utiliza la copia JSON y el procedimiento de Storage.

## Evidencia ejecutada

| Verificación | Resultado |
|---|---|
| Regresión | 306 aprobadas, 0 fallidas, 0 omitidas. Incluye CRUD, reapertura, recurrencias, temporizador, reflexiones e imágenes, adjuntos, rutas educativas, copias, evaluaciones, conflictos y funcionalidades nuevas. |
| Compilación | Vite compiló 101 módulos. JavaScript principal de 651 kB, 184 kB con gzip. Persiste el aviso de tamaño del paquete. |
| Supabase local real | 38 comprobaciones funcionales y 7 SQL. Dos cuentas sintéticas, Auth, RLS, Storage privado, objetos inmutables, Edge Function, CAS, dos clientes, cola offline, reconexión, recuperación e importación con procedencia. Cero solicitudes a proveedores. [Resultados SQL e integración](expansion-staging.json) |
| Capacidad | 300 elementos y 299 dependencias con 60 cambios completados ocuparon 1.494.546 bytes. Con 1.000 elementos, 999 dependencias y 60 cambios quedaron 142 eventos, 101 versiones y 6.169.682 bytes. La validación de este último caso tardó 1.724 ms y la proyección del árbol 25 ms en esta máquina. [Mediciones](expansion-capacity.json) |
| Exportación grande | Cinco originales sintéticos de 20 MiB produjeron un ZIP de 104.870.423 bytes en 1,48 s en Node. El incremento observado de memoria residente fue de unos 59 MiB. La cifra mide la diferencia entre dos lecturas y no certifica el pico en un dispositivo móvil. |
| Navegador | Proyecto de software sintético, aprobación de un entregable, dos versiones de entrega, recuperación y guardado de borrador tras recargar, creación y asignación de categoría y descarga del ZIP. Los cinco apartados entraron en el ancho del documento a 320, 390, 740, 1024 y 1440 px. [Mediciones de pantalla](visual-expansion/viewports.json) |
| Evidencias visuales | [Resumen](visual-expansion/summary-1440.jpg), [árbol de escritorio](visual-expansion/tree-1440.jpg) y [árbol en 390 px](visual-expansion/tree-390.jpg). |

## Límites y condiciones para publicación

La revisión local puede comenzar. La expansión requiere un ensayo de activación en **staging cloud independiente** antes de publicar. Debe incluir actualizar clientes antiguos, confirmar las políticas y permisos efectivos, verificar copias de los objetos privados y medir un primer arranque con historia extensa. Móvil físico, lector de pantalla, red lenta y pico de memoria del ZIP en navegador siguen pendientes. El registro npm no respondió por DNS en la última consulta de auditoría.

El navegador limita los originales a 20 MiB por archivo y la exportación a 100 MiB de originales, con un margen de 8 MiB para el contenido del paquete. Cuando se supera el límite se informa del rechazo. Se pueden generar selecciones menores. No se implementó la división automática en partes. Si el inventario no se puede enumerar o algún archivo falla su verificación, el manifiesto identifica la exclusión. Un archivo ausente necesita recuperarse de su propietario o de una copia.

Para una conexión futura de IA, el adaptador debe recibir únicamente el mensaje y las fuentes seleccionadas con consentimiento para ese envío. El servidor deberá aplicar autenticación, límites, idempotencia y registro de proveedor y modelo. El resultado entrará por el contrato de propuesta que ya valida la versión base y exige aprobación humana. En esta entrega las pruebas del transporte son sintéticas. Los documentos del Cubo LED real y las cuentas de producción quedaron fuera del ensayo.

## Cómo probar

En la rama `feat/studyhub-2`, iniciar `npm run dev -- --host 127.0.0.1 --port 5176` y abrir [el Plan en la vista previa local](http://127.0.0.1:5176/?localPreview=workspace#/projects/project-programming/plan). Esta vista usa datos separados. Desde **Árbol** se puede seleccionar una ficha. **Entregas y evidencias** permite registrar una entrega y añadir su segunda versión. Desde **Resumen** se puede estimar un ZIP y revisar el manifiesto al descargarlo.

Para reproducir la regresión, ejecutar `npm test` y `npm run build`. Para los casos de tamaño, ejecutar `node scripts/measure-planning-v2.mjs`. El ensayo de integración usa `node scripts/run-planning-local.mjs` con Docker Desktop en modo Linux y el entorno desechable `studyhub-staging` preparado. El ejecutor rechaza destinos remotos y solo administra sus contenedores de prueba.
