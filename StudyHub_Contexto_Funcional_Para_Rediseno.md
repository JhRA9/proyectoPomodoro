# StudyHub — Contexto funcional y técnico para rediseño UX/UI

> Documento de transferencia para GPT-6 Astra y para cualquier persona que rediseñe la interfaz.
>
> **Alcance:** describe el comportamiento existente; no propone un rediseño ni modifica la aplicación.
>
> **Corte de información:** 23 de octubre de 2026, repositorio `JhRA9/proyectoPomodoro`, rama `main`, commit `4210809` (`add educational route import`). Aplicación publicada: <https://studyhub-estudios.netlify.app/>.

## Convenciones de estado

| Estado | Significado en este documento |
|---|---|
| **IMPLEMENTADA** | Está presente en el código actual y tiene una interfaz o flujo utilizable. |
| **PARCIAL** | Existe una base funcional, pero falta una parte relevante del comportamiento solicitado o de su presentación. |
| **PLANIFICADA** | Es una necesidad confirmada para el futuro, pero no está implementada en la versión inspeccionada. |
| **NO VERIFICADA** | Hay código o una expectativa, pero falta validación con datos reales, proveedor externo o archivo final. |

---

# 1. Resumen ejecutivo de StudyHub

## 1.1 Qué es y para qué sirve

StudyHub es una aplicación web personal de organización, concentración y seguimiento del aprendizaje. Permite reunir proyectos, tareas, entregas, sesiones de estudio, reflexiones, archivos y evidencia de resultados en un mismo espacio. Su intención no es solo indicar cuánto tiempo se estudió, sino separar:

- **Actividad realizada:** tiempo, sesiones, frecuencia y tareas atendidas.
- **Resultados demostrados:** ejercicios evaluados, competencias sustentadas, evidencias y entregables verificados.

Responde a necesidades concretas del usuario: organizar compromisos universitarios, visualizar vencimientos de distintos proyectos, concentrarse en una tarea, conservar lo aprendido, trabajar con tareas repetitivas y medir progreso sin convertir automáticamente las horas en una calificación.

## 1.2 Evolución desde “proyecto Pomodoro”

El producto comenzó como un temporizador Pomodoro ligado a tareas. Evolucionó progresivamente hacia un centro de estudio completo:

1. Proyectos, tareas y un temporizador circular.
2. Fechas, calendario y alertas de vencimiento.
3. Sesiones persistentes y reflexiones por sesión.
4. Agenda global de tareas entre proyectos.
5. Adjuntos, categorías, repetición diaria y proyectos completados.
6. Autenticación y sincronización con Supabase.
7. Módulo de progreso basado en competencias, ejercicios, evidencias, evaluaciones y entregables.
8. Evaluación asistida por IA y un importador específico de rutas educativas.

El nombre StudyHub refleja que el alcance actual ya no es solo Pomodoro.

## 1.3 Tecnologías y despliegue

- Aplicación de una sola página construida con **Vite 7**, **JavaScript moderno con módulos ES**, HTML y CSS.
- No utiliza React, Vue ni otro framework de interfaz.
- Estado de dominio gestionado por un repositorio propio y un store observable.
- **Supabase** para autenticación, snapshot de estado por usuario, almacenamiento privado de adjuntos y función de evaluación con IA.
- **Netlify** para compilación y publicación continua desde GitHub.
- Pruebas con **Vitest**.
- Navegación mediante rutas hash, por lo que las recargas directas no requieren una redirección SPA adicional.

## 1.4 Arquitectura resumida

La arquitectura separa cuatro responsabilidades:

1. **Dominio y validación:** `src/data/schema.js` y `src/data/repository.js`.
2. **Persistencia:** adaptador local o adaptador cloud, intercambiables detrás del repositorio.
3. **Estado y datos derivados:** `src/state/` y `src/evaluation/`.
4. **Presentación:** shell, componentes, vistas y estilos en `src/ui/`, `src/views/` y `src/styles/`.

La interfaz no debería escribir directamente en el estado. Las operaciones importantes pasan por `StudyHubRepository`, que valida, aumenta la revisión, actualiza la fecha y persiste el snapshot.

## 1.5 Almacenamiento y sincronización

- Con Supabase configurado, la fuente cloud es una fila de estado por usuario en `studyhub_states`, protegida por Row Level Security.
- Cada cuenta posee una caché local y una cola pendiente separadas. Sin conexión, los cambios se conservan y se reintentan al recuperar internet.
- La estrategia cloud es un **snapshot completo con último guardado aceptado**; no existe combinación campo por campo entre dos dispositivos que editen simultáneamente.
- Sin Supabase, `LocalStorageAdapter` mantiene una versión completamente local.
- Los datos locales antiguos no se borran automáticamente. Al entrar por primera vez a una cuenta cloud vacía se ofrece migrarlos o conservar un espacio nuevo.
- Los adjuntos están en un bucket privado de Supabase Storage, separados por usuario y tarea. No forman parte de la copia JSON.

## 1.6 Estado actual

La versión inspeccionada está publicada y es funcional. El repositorio contiene pruebas de dominio, utilidades, persistencia, temporizador, recurrencia, importación y evaluación. En la última validación registrada había **118 pruebas aprobadas** y el build de producción finalizaba correctamente. Supabase, Netlify y los dos proveedores configurados para evaluación asistida (Gemini y Cloudflare) fueron comprobados en producción.

La base funcional es amplia, pero aún hay límites de producto importantes: no existe calendario global completo, no hay prioridad manual ni diferencia entre fecha planificada y fecha máxima, la sincronización concurrente es “último snapshot”, y varios análisis pedagógicos avanzados todavía requieren estructura adicional.

---

# 2. Inventario de funcionalidades existentes

Para evitar una tabla inmanejable, “Entrada / salida” resume tanto los datos requeridos como los datos producidos o modificados.

## 2.1 Inicio, navegación y preferencias

| Funcionalidad | Propósito y uso actual | Pantalla | Entrada / salida y relaciones | Estado | Comportamiento que debe conservarse |
|---|---|---|---|---|---|
| Panel de proyectos activos | Punto de entrada y resumen del espacio personal. El usuario abre tarjetas o crea proyectos. | `#/projects` | Lee proyectos/tareas; calcula proyectos, pendientes, completadas y activos. | **IMPLEMENTADA** | No mostrar proyectos completados en la cuadrícula principal. Métricas siempre derivadas de datos reales. |
| Tarjetas de proyecto | Presentan icono, color, nombre, descripción, conteos y progreso por tareas. | Inicio y completados | Abren el proyecto; menú permite editar, completar/descompletar o eliminar. | **IMPLEMENTADA** | La tarjeta completa debe seguir siendo activable; nombres largos deben envolver sin ocultar información esencial. |
| Proyectos completados | Sección separada para reducir ruido visual. | `#/completed` | Lista proyectos `completed`, ordenados por finalización; permite consulta y descompletar. | **IMPLEMENTADA** | Un proyecto reabierto vuelve a la sección principal conservando historial. |
| Barra lateral izquierda | Navegación, acceso a proyectos, importaciones, copias y ajustes. | Todas las vistas | Contenido varía entre panel principal y contexto de proyecto. | **IMPLEMENTADA** | Mantener acceso equivalente a todas las acciones aunque cambie la composición visual. |
| Contracción de barra izquierda | Libera espacio horizontal y deja un riel de alto completo activable. | Todas | Guarda preferencia en `localStorage`. | **IMPLEMENTADA** | Toda el área del riel debe seguir permitiendo abrir/cerrar; preferencia persistente. |
| Agenda lateral derecha | Reúne tareas abiertas de todos los proyectos y abre directamente una tarea. | Todas | Deriva grupos de tareas; visibilidad guardada. | **IMPLEMENTADA** | Debe seguir disponible globalmente y poder ocultarse. |
| Contracción de agenda | Oculta el panel y conserva un riel lateral. | Todas | Guarda preferencia; en pantallas estrechas coordina espacio con barra izquierda. | **IMPLEMENTADA** | Preferencia persistente y destino táctil amplio. |
| Barra superior | Búsqueda, control de apariencia y acceso de cuenta. | Todas | Filtra proyectos y abre preferencias/perfil. | **IMPLEMENTADA** | Conservar búsqueda y cuenta accesibles. |
| Búsqueda de proyectos | Filtra por nombre y descripción normalizados. | Panel y sidebar contextual | Entrada: texto. Salida: lista visual filtrada. | **IMPLEMENTADA** | No modificar datos al buscar; tolerar mayúsculas/acentos mediante normalización. |
| Preferencia de tema atenuado | Reduce intensidad dentro del tema oscuro. | Barra superior/ajustes | Guarda `dimTheme` localmente. | **IMPLEMENTADA** | Preservar la preferencia, aunque el futuro sistema de temas cambie. |
| Perfil y ajustes | Toda la caja de perfil es activable; muestra nombre, sincronización, copias y cierre de sesión. | Barra izquierda y superior | Modifica nombre de perfil/preferencias; puede cerrar sesión. | **IMPLEMENTADA** | No limitar la activación al engranaje. Cerrar sesión debe finalizar solo la autenticación, no borrar datos. |
| Diseño adaptable | Reorganiza columnas, modales, listas y barras laterales. | Todas | CSS por puntos de corte; en anchos reducidos evita dos paneles laterales abiertos simultáneamente. | **IMPLEMENTADA** | Mantener acceso a agenda, navegación y acciones en móvil. |
| Estados vacíos, avisos y toasts | Explican ausencia de datos, errores, sincronización o resultado de acciones. | Global | Datos de UI temporales; no alteran dominio. | **IMPLEMENTADA** | Conservar mensajes claros, accesibles y sin bloquear innecesariamente. |

## 2.2 Proyectos

| Funcionalidad | Propósito y uso actual | Pantalla | Entrada / salida y relaciones | Estado | Comportamiento que debe conservarse |
|---|---|---|---|---|---|
| Crear proyecto | Crea un contenedor de trabajo. | Inicio, modal | Nombre, descripción, icono, color y tipo; produce proyecto activo con configuración de evaluación. | **IMPLEMENTADA** | No crear datos de progreso ficticios. |
| Tipos de proyecto | Adapta el módulo Progreso. | Formulario y Progreso | `general`, `studies`, `deliverables`. | **IMPLEMENTADA** | El tipo decide si se presenta seguimiento de competencias o de entregables. |
| Editar proyecto | Cambia metadatos sin perder relaciones. | Menú del proyecto | Modifica nombre, descripción, icono, color y datos permitidos. | **IMPLEMENTADA** | No recrear IDs ni perder tareas, sesiones o progreso. |
| Completar proyecto | Oculta un proyecto de activos y lo lleva a completados. | Menú/contexto | Estado `active → completed`, fecha `completedAt`; pausa un temporizador relacionado si es necesario. | **IMPLEMENTADA** | Conservar todos los datos; impedir nuevas tareas/sesiones hasta descompletar. |
| Descompletar proyecto | Reactiva un proyecto histórico. | Completados o aviso dentro del proyecto | Estado `completed → active`. | **IMPLEMENTADA** | El historial debe reaparecer intacto. |
| Eliminar proyecto | Borra proyecto y datos dependientes tras confirmación. | Menú del proyecto | Cascada sobre tareas, sesiones, reflexiones, competencias, ejercicios, evidencias, evaluaciones, etapas, entregables, solicitudes IA y revisiones; limpia adjuntos por tarea. | **IMPLEMENTADA** | Confirmación explícita y limpieza completa. Si la limpieza cloud falla, conservar cola de reintento. |
| Proyecto demo | Ofrece datos iniciales y puede limpiarse. | Inicio/ajustes | `seededDemo`; la limpieza no vuelve a sembrar automáticamente. | **IMPLEMENTADA** | No confundir demo con datos reales. |
| Importar ruta educativa como proyecto | Convierte un JSON neutral en un proyecto de Estudios nuevo. | Barra izquierda, vista previa modal | Competencias, clases/enlaces, tareas, ejercicios, evaluaciones previstas, dependencias y fechas; genera huella para evitar duplicados. | **IMPLEMENTADA** | Siempre vista previa y confirmación; no restaurar como backup; no sobrescribir proyectos; ignorar certificados/progresos/calificaciones externos. |

## 2.3 Tareas, estados y organización

| Funcionalidad | Propósito y uso actual | Pantalla | Entrada / salida y relaciones | Estado | Comportamiento que debe conservarse |
|---|---|---|---|---|---|
| Crear tarea | Añade trabajo a un proyecto. | Proyecto o enfoque, modal | Título, descripción opcional, categoría, fecha/hora o recurrencia, estado inicial y adjuntos opcionales. | **IMPLEMENTADA** | Un solo clic debe crear una sola tarea y cerrar el modal. |
| Editar tarea | Modifica datos sin perder historial. | Menú de tarea | Conserva ID, tiempo, sesiones y reflexiones. | **IMPLEMENTADA** | Cambiar metadatos no debe duplicar ni reiniciar datos. |
| Eliminar tarea | Elimina tarea e historial relacionado tras confirmación. | Menú de tarea | Cascada sobre sesiones, aprendizajes, referencias y adjuntos. | **IMPLEMENTADA** | Eliminar también archivos privados; usar cola de limpieza si no hay conexión. |
| Estados de tarea | Distingue `pending`, `in_progress`, `completed`. | Chips, menús y enfoque | Cambiar a completada abre el flujo de reflexión; descompletar recupera la tarea. | **IMPLEMENTADA** | Nunca completar silenciosamente saltando reflexión; no superponer menú y filas. |
| Pestañas Por hacer / Completadas | Separa tareas activas de terminadas en el proyecto. | Resumen de proyecto | “Por hacer” incluye pendiente y en curso; “Completadas” incluye terminadas. | **IMPLEMENTADA** | No mezclar completadas con la lista activa. |
| Filtro de completadas | Muestra todas o una tarea completada específica; recuerda selección por proyecto. | Pestaña Completadas | Preferencia local por proyecto. | **IMPLEMENTADA** | Mantener selección válida y recuperarla al volver. |
| Filtro de modo enfoque | Dropdown: Todas, Pendientes, En curso, Completadas. | Columna de tareas del enfoque | Filtra visualmente sin modificar estado. | **IMPLEMENTADA** | Mantener dropdown, no rotación por clic. |
| Categoría de tarea | Permite identificar materia o contexto. | Formulario y varias tarjetas | Texto libre de hasta 60 caracteres; opciones existentes pueden reutilizarse. | **IMPLEMENTADA** | Mostrar categoría junto al proyecto cuando ayude a desambiguar. |
| Tareas repetitivas diarias | Representan una actividad cada día dentro de un periodo. | Formulario, listas, calendario, agenda y enfoque | Fecha inicial obligatoria; final opcional; lista de fechas completadas. | **IMPLEMENTADA** | Completar hoy no debe cerrar toda la serie; acumular tiempos; reaparecer el siguiente día activo. |
| Tareas sin fecha | Mantienen trabajo pendiente no ligado a entrega. | Proyecto y agenda “Sin fecha” | `dueDate=null`. | **IMPLEMENTADA** | No mostrarlas como vencidas ni en calendario; sí conservarlas en agenda. |
| Orden de tareas | Agenda ordena por fecha, hora y creación; listas de proyecto mantienen el orden derivado actual. | Agenda/proyecto | No existe reordenamiento manual. | **PARCIAL** | No prometer prioridad manual donde no existe. |
| Prioridad manual | Permitir alta/media/baja independiente de fecha. | — | No hay campo de prioridad en el esquema. | **PLANIFICADA** | Una futura UI no debe inferir que ya existe persistencia. |

## 2.4 Fechas, calendario y agenda

| Funcionalidad | Propósito y uso actual | Pantalla | Entrada / salida y relaciones | Estado | Comportamiento que debe conservarse |
|---|---|---|---|---|---|
| Fecha límite | Define día máximo para una tarea no recurrente. | Crear/editar tarea | `YYYY-MM-DD`, opcional. | **IMPLEMENTADA** | Interpretación como fecha local, no conversión accidental de zona horaria. |
| Hora límite | Precisa la entrega dentro del día. | Crear/editar tarea | `HH:mm` de 24 horas en el control; se muestra en formato 12 h AM/PM; requiere fecha. | **IMPLEMENTADA** | No conservar una hora huérfana si se elimina la fecha. |
| Aviso del proyecto | Resume hasta tres tareas cercanas por urgencia. | Parte superior del proyecto | Usa vencidas, urgentes y próximas del proyecto. | **IMPLEMENTADA** | Envolver títulos largos; no invadir calendario. |
| Calendario mensual del proyecto | Muestra fechas de tareas y ocurrencias diarias. | Resumen de proyecto | Navegación mes anterior/siguiente/hoy; marcadores por estado temporal. | **IMPLEMENTADA** | Seleccionar día filtra tareas; tareas sin fecha no aparecen. |
| Agenda global | Reúne tareas abiertas de todos los proyectos activos. | Barra derecha global | Grupos: vencidas, hoy, mañana, próximos 3 días, próxima semana, posteriores y sin fecha. | **IMPLEMENTADA** | Grupos mutuamente comprensibles; completadas fuera de la agenda activa; clic abre enfoque. |
| Actualización temporal de agenda | Reclasifica tareas al cambiar el día o transcurrir el tiempo. | Global | Programa refresco y vuelve a derivar etiquetas relativas. | **IMPLEMENTADA** | No depender de recargar manualmente para que “mañana” pase a “hoy”. |
| Diferencia fecha planificada / fecha máxima | Separar intención de trabajo y deadline real. | — | Solo existe un par `dueDate`/`dueTime`. | **PLANIFICADA** | No representar una fecha como ambas cosas. |
| Calendario global desplegable | Consultar calendario desde cualquier sección dentro de agenda. | — | El calendario actual solo pertenece al proyecto. | **PLANIFICADA** | Integrarlo sin romper el calendario por proyecto ni la agenda existente. |
| Tareas completadas en agenda | Distinguir terminadas desde una vista global. | — | Las completadas se excluyen de la agenda actual. | **PLANIFICADA** | Si se añade, debe estar separada de urgencias activas. |

## 2.5 Temporizador, sesiones y reflexiones

| Funcionalidad | Propósito y uso actual | Pantalla | Entrada / salida y relaciones | Estado | Comportamiento que debe conservarse |
|---|---|---|---|---|---|
| Modo sin límite | Cuenta desde cero hasta detener. | Enfoque | `targetSeconds=null`; produce tiempo transcurrido. | **IMPLEMENTADA** | No imponer fin automático. |
| Modo con tiempo | Cuenta regresiva con horas/minutos personalizados. | Enfoque | Mínimo 1 minuto; permite horas libres y minutos 0–59. | **IMPLEMENTADA** | Si llega a cero y continúa, registrar tiempo extra, no perderlo. |
| Iniciar | Comienza una sesión para la tarea seleccionada. | Botón azul central | Crea `activeTimer` con timestamps. | **IMPLEMENTADA** | Solo una sesión activa global; no escribir cada segundo. |
| Pausar | Congela temporalmente el contador. | Botón azul central | Acumula tramo transcurrido en el temporizador, pero no crea todavía `FocusSession`. | **IMPLEMENTADA** | Pausar no debe guardar ni duplicar una sesión. |
| Reanudar | Continúa el mismo temporizador pausado. | Botón azul central | Actualiza `lastResumedAt`. | **IMPLEMENTADA** | Mantener el tiempo previo. |
| Detener | Finaliza el tramo pendiente y guarda una sesión. | Botón rojo derecho | Crea `FocusSession`, suma segundos una vez, abre reflexión opcional. | **IMPLEMENTADA** | La tarea queda pendiente o en curso; omitir reflexión no pierde tiempo. |
| Completar | Cierra tiempo pendiente y solicita reflexión final. | Botón verde izquierdo o estado completada | Guarda sesión si hay tiempo, guarda aprendizaje y completa tarea/ocurrencia. | **IMPLEMENTADA** | No duplicar tiempo o sesión. “Completar hoy” en recurrente no cierra la serie. |
| Reloj circular | Visualiza progreso, tiempo restante/transcurrido y sobretiempo. | Enfoque | Derivado del temporizador activo y configuración. | **IMPLEMENTADA** | Posición de botones: completar izquierda, iniciar/pausar centro, detener derecha. |
| Reconstrucción tras recarga | Evita perder una sesión al recargar. | Global | Calcula tiempo desde timestamps persistidos. | **IMPLEMENTADA** | El tiempo no puede depender del número de ticks renderizados. |
| Resumen de sesión | Muestra tiempo de hoy, sesiones de hoy y tiempo total de la tarea. | Enfoque | Derivado de sesiones y `accumulatedSeconds`. | **IMPLEMENTADA** | Mantener separados “hoy” y acumulado histórico. |
| Borrador de aprendizaje | Permite escribir durante la sesión. | Pestaña Notas de la sesión | Campos aprendido, dudas, siguiente paso e imágenes; guardado automático en el navegador. | **IMPLEMENTADA** | Precargar el formulario final; vaciarlo al guardar; no perderlo por re-render. |
| Reflexión por sesión | Crea un `LearningEntry` asociado a una `FocusSession`. | Modal al detener/completar | “Qué aprendí” obligatorio al guardar; otros dos campos opcionales; imágenes del aprendizaje. | **IMPLEMENTADA** | Una sesión como máximo una reflexión; omitir una reflexión de detención no revierte la sesión. |
| Historial de aprendizaje | Presenta sesiones cronológicas como Sesión 1, 2… y clases globales. | Enfoque y proyecto | Lee `LearningEntry`; incluye tiempo, textos e imágenes ajustadas. | **IMPLEMENTADA** | Numeración cronológica estable y relación con tarea/sesión. |
| Editar aprendizaje | Corrige los tres textos de una entrada. | Historial, modal | Mantiene relación y las imágenes existentes. | **IMPLEMENTADA** | No modificar el tiempo de la sesión. |
| Eliminar aprendizaje | Elimina la reflexión, no la sesión ni el tiempo. | Historial, confirmación | Marca la sesión para impedir recreaciones ambiguas. | **IMPLEMENTADA** | El tiempo acumulado debe permanecer. |
| Imágenes en aprendizaje | Pegar o elegir PNG/JPG/WebP, hasta 4. | Borrador/reflexión e historial | Fuente máx. 12 MB; compresión a data URL de tamaño controlado; texto se muestra debajo. | **IMPLEMENTADA** | Mantener ajuste al ancho, compresión y límite; no desbordar tablas. |

## 2.6 Adjuntos, copias y datos

| Funcionalidad | Propósito y uso actual | Pantalla | Entrada / salida y relaciones | Estado | Comportamiento que debe conservarse |
|---|---|---|---|---|---|
| Adjuntar al crear tarea | Carga archivos después de crear la tarea. | Modal Nueva tarea | Varios archivos opcionales, máx. 20 MB cada uno. | **IMPLEMENTADA** | Crear la tarea aunque no haya archivos; informar errores parciales sin duplicar la tarea. |
| Adjuntar desde enfoque | Añade archivos a una tarea existente. | Panel Archivos adjuntos | Archivo binario; lista actualizada. | **IMPLEMENTADA** | Requiere cuenta/cloud y conexión. |
| Reemplazo por nombre | Evita duplicados del mismo documento. | Adjuntos | Hash del nombre normalizado; `upsert`. | **IMPLEMENTADA** | Mismo nombre reemplaza; nombre distinto crea otro archivo. |
| Descargar adjunto | Recupera documento privado bajo demanda. | Enfoque | Tarea + clave segura; produce descarga Blob. | **IMPLEMENTADA** | No exponer URL pública permanente. |
| Eliminar adjunto individual | Quitar un archivo sin borrar tarea. | — | El store solo expone limpieza por tarea. | **PLANIFICADA** | No mostrar control engañoso hasta implementar operación segura. |
| Exportar copia JSON | Respalda el estado versionado. | Sidebar/perfil | Produce envelope JSON; temporizador activo se normaliza a pausado. | **IMPLEMENTADA** | No exportar secretos ni adjuntos; evitar tiempo fantasma. |
| Importar copia JSON | Restaura un backup compatible. | Sidebar/perfil | Valida esquema y reemplaza estado actual. | **IMPLEMENTADA** | Debe advertir que reemplaza; no confundir con importación educativa. |
| Sincronizar ahora | Fuerza reintento de cola cloud. | Ajustes | Vacía pendiente si Supabase acepta. | **IMPLEMENTADA** | Mostrar estado real de sincronización. |
| Empezar de cero | Limpia datos del estado tras confirmación. | Ajustes/demo | Sustituye por estado vacío validado. | **IMPLEMENTADA** | No resembrar demo ni borrar una cuenta por accidente. |

## 2.7 Autenticación, nube y operación offline

| Funcionalidad | Propósito y uso actual | Pantalla | Entrada / salida y relaciones | Estado | Comportamiento que debe conservarse |
|---|---|---|---|---|---|
| Registro e inicio de sesión | Separa datos por cuenta y permite varios dispositivos. | Puerta de acceso | Correo y contraseña; sesión Supabase. | **IMPLEMENTADA** | Mensajes específicos; contraseña nunca almacenada por StudyHub. |
| Cerrar sesión | Finaliza la sesión de autenticación. | Perfil/ajustes | Llama a Supabase Auth; vuelve a acceso. | **IMPLEMENTADA** | No borrar datos cloud ni legado local. |
| Migración inicial | Ofrece subir datos locales a una cuenta cloud vacía. | Modal posterior al login | Vista previa de proyectos/tareas; decisión persistida. | **IMPLEMENTADA** | La copia local no se borra; ambos botones deben funcionar. |
| Sincronización cloud | Guarda snapshot por usuario. | Transparente + indicador | Revisión, `updatedAt`, estado completo. | **IMPLEMENTADA** | Mantener RLS y aislamiento entre cuentas. |
| Caché y cola offline | Permite trabajar sin internet. | Transparente + estado | Guarda snapshot local por cuenta y reintenta al reconectar. | **IMPLEMENTADA** | No presentar como sincronizado hasta confirmación remota. |
| Adjuntos offline | — | — | Storage requiere red. | **NO VERIFICADA** como flujo offline; actualmente no soportado | Comunicar la limitación y no simular una carga exitosa. |

## 2.8 Progreso, evaluación y resultados

| Funcionalidad | Propósito y uso actual | Pantalla | Entrada / salida y relaciones | Estado | Comportamiento que debe conservarse |
|---|---|---|---|---|---|
| Pestaña Mi progreso | Separa seguimiento de resultados del resumen operativo. | `#/projects/:id/progress` | Tipo de proyecto decide panel. | **IMPLEMENTADA** | Mantener “Resumen” y “Mi progreso” como destinos distinguibles. |
| Competencias jerárquicas | Registra capacidades y subcapacidades. | Progreso de Estudios/General | Nombre, descripción, padre y umbrales. | **IMPLEMENTADA** | Nuevas competencias empiezan `Sin evaluar`. |
| Ejercicios | Registra práctica y contexto de evaluación. | Progreso | Título, dificultad 1–5, competencias, código, esperado, resultado, ayuda e independencia. | **IMPLEMENTADA** | No asumir que “completado” equivale por sí solo a dominio. |
| Evaluación manual | Puntúa un ejercicio con rúbrica. | Progreso | 0–4 por criterio, justificaciones, resumen, fortalezas, debilidades y recomendaciones. | **IMPLEMENTADA** | Porcentaje ponderado; conservar versión de rúbrica usada. |
| Evaluación asistida por IA | Envía ejercicio a función autenticada y guarda resultados por proveedor. | Progreso | Proveedor, perfil, modelo, privacidad, límite diario y ejercicio. | **IMPLEMENTADA** | Secretos solo en servidor; resultados de dos proveedores deben seguir separados. |
| Privacidad de evaluación | Controla qué se envía a IA. | Configuración de Progreso | Personal, privado o ejercicios ficticios. | **IMPLEMENTADA** | En modo privado no enviar código/archivos sensibles. |
| Configuración de IA | Selecciona Gemini, Cloudflare o ambos; rápido/completo/profundo; modelos y máximo diario. | Progreso | Modifica configuración por proyecto. | **IMPLEMENTADA** | Validar límites y modelos; no exponer tokens. |
| Comprobación de proveedores | Verifica conectividad configurada. | Progreso | Llama a Edge Function. | **IMPLEMENTADA** | Diferenciar proveedor disponible de evaluación válida. |
| Registro de consumo IA | Audita proveedor, modelo, tokens reportados, latencia y estado. | Panel Consumo de IA | Datos reportados por proveedor; no estimados. | **IMPLEMENTADA** | Mostrar “no reportado” en vez de inventar consumo. |
| Evidencias | Vincula prueba a proyecto, ejercicio o entregable y competencias. | Progreso | Tipos: declarada, adjunta, prueba superada, verificada externamente. | **IMPLEMENTADA** | La evidencia debe conservar destino y competencias. |
| Historial de evaluaciones | Presenta fecha, porcentaje, nivel, validación, rúbrica y recomendaciones. | Progreso | Evaluaciones completadas. | **IMPLEMENTADA** | “Sin evaluar” no significa 0 %. |
| Importar evaluación externa | Incorpora informe JSON validado sin sobrescribir. | Progreso | Debe corresponder al proyecto; deduplicación por ID externo. | **IMPLEMENTADA** | No aceptar competencias o proyecto incompatibles. |
| Exportar informe | Genera Markdown/JSON o copia al portapapeles por periodo. | Progreso | Periodos: todo, hoy, 7 días, semana, mes o fechas personalizadas. | **IMPLEMENTADA** | Sirve para compartir manualmente con ChatGPT; no implica conexión automática. |
| Recomendación a tarea | Convierte una recomendación de evaluación en tarea. | Historial evaluación | Proyecto + texto de recomendación. | **IMPLEMENTADA** | Crear tarea pendiente sin convertir la recomendación en evidencia. |
| Etapas y entregables | Modela progreso material de proyectos no académicos. | Progreso tipo Entregables | Etapas, entregables, pesos, dependencias, bloqueos y estados. | **IMPLEMENTADA** | Impedir verificar/completar si faltan dependencias; no inventar porcentaje sin pesos. |
| Revisión semanal | Resume actividad y resultados de la semana actual. | Progreso | Tiempo/sesiones, evaluaciones/competencias, verificados y bloqueos. | **IMPLEMENTADA** | Mantener actividad separada de resultado. |
| Diagnóstico inicial guiado | Evaluación estructurada para establecer punto de partida. | — | Puede representarse manualmente con ejercicios/evaluaciones, pero no hay wizard o entidad específica. | **PARCIAL** | No presentar competencias como aprobadas por historial externo. |
| Errores recurrentes | Detectar patrones de dificultad entre intentos. | — | Existen debilidades y justificaciones en evaluaciones, pero no taxonomía ni análisis específico. | **PARCIAL** | No inferir recurrencia sin datos estructurados. |
| Estadísticas globales | Analítica consolidada de todos los proyectos. | — | Hay contadores del inicio y métricas por proyecto, no una ruta estadística global. | **PARCIAL** | No confundir las tarjetas del inicio con un módulo estadístico completo. |

---

# 3. Funcionalidades parciales o pendientes

## 3.1 Parciales

1. **Diagnósticos:** se pueden crear ejercicios y evaluarlos, pero no existe un flujo de diagnóstico diferenciado, una batería adaptativa ni reglas de exención.
2. **Errores recurrentes:** la información textual existe, pero no se etiqueta ni agrega automáticamente.
3. **Estadísticas globales:** hay indicadores de inicio, actividad semanal y métricas por proyecto; no hay una pantalla global de estadísticas.
4. **Trabajo offline:** proyectos, tareas y estado usan caché/cola. Los adjuntos y las evaluaciones externas/IA requieren conexión.
5. **Prioridad:** la urgencia se deriva de fecha; no hay prioridad manual, esfuerzo, impacto ni matriz configurable.
6. **General frente a Estudios:** ambos usan actualmente el panel de competencias; la especialización visual/funcional de “General” es limitada.
7. **Adjuntos como evidencia:** se pueden adjuntar archivos a una tarea y crear registros de evidencia, pero no hay una vinculación automática entre ambos conceptos.

## 3.2 Planificadas o necesidades confirmadas

- Agenda inteligente con calendario global expandible/contraíble desde cualquier sección.
- Distinción visible de vencidas, próximas y completadas dentro de una experiencia global, manteniendo las completadas fuera de la lista urgente.
- Tiempo restante más preciso cuando hay hora (no solo etiqueta por días).
- Diferencia entre fecha planificada de trabajo y fecha máxima de entrega.
- Prioridad explícita y filtros globales por proyecto/estado/fecha/prioridad.
- Diagnóstico pedagógico explícito y análisis de errores recurrentes.
- Mejor visualización comparativa de evolución de competencias.
- Eliminación individual de adjuntos si se considera necesaria.

## 3.3 No verificadas

- La importación del archivo final `StudyHub_Ruta_Frontend_2026.json`: el importador está implementado, pero el archivo fuente concreto no estaba disponible dentro del repositorio inspeccionado.
- Compatibilidad visual con todos los navegadores móviles y lectores de pantalla: existen semántica, etiquetas y responsive, pero no consta una auditoría formal WCAG multidispositivo.
- Resolución de ediciones simultáneas reales desde dos dispositivos: la estrategia actual es último snapshot aceptado y no merge.

---

# 4. Mapa actual de pantallas y navegación

## 4.1 Rutas

| Ruta | Pantalla | Contenido principal |
|---|---|---|
| `#/projects` | Proyectos activos | Saludo, métricas, búsqueda, cuadrícula, crear proyecto. |
| `#/completed` | Proyectos completados | Historial de proyectos cerrados, búsqueda, apertura y descompletar. |
| `#/projects/:projectId` | Resumen del proyecto | Cabecera, alerta, tareas por pestañas, calendario y registro general de aprendizaje. |
| `#/projects/:projectId/progress` | Mi progreso | Configuración, competencias/ejercicios/evaluaciones o etapas/entregables, evidencias, semana y consumo IA. |
| `#/projects/:projectId/tasks/:taskId` | Modo enfoque | Lista de tareas, reloj/configuración/adjuntos y notas/historial. |

## 4.2 Shell común

- **Izquierda:** navegación o lista contextual de proyectos, perfil y control de contracción.
- **Centro:** barra superior y contenido de la ruta.
- **Derecha:** agenda global y control de contracción.
- **Capas flotantes:** dropdowns, toasts, confirmaciones y modales.

Las preferencias de barras, filtro de completadas, tema y otros detalles de presentación se guardan fuera del estado de dominio, principalmente en `localStorage`.

## 4.3 Pantalla Proyectos

- Encabezado con saludo y botón Nuevo proyecto.
- Cuatro tarjetas de resumen: proyectos, tareas pendientes, tareas completadas y proyectos activos.
- Búsqueda y cuadrícula de proyectos.
- Tarjeta para crear proyecto y aviso para limpiar demo cuando aplica.
- Acciones por proyecto: abrir, editar, completar/descompletar y eliminar.

## 4.4 Pantalla Proyecto

- Cabecera con icono, nombre, descripción, estado y menú.
- Pestañas `Resumen` y `Mi progreso`.
- Aviso de proyecto completado con opción de reabrir.
- Alerta de vencimientos del proyecto.
- Panel de tareas con pestañas `Por hacer` y `Completadas`.
- Filtro de una tarea terminada específica en la segunda pestaña.
- Calendario mensual con marcadores y filtro por día.
- Registro general de clases/aprendizajes, construido a partir de `LearningEntry` del proyecto.

## 4.5 Pantalla Enfoque

- Columna izquierda: filtro por estado, nueva tarea y lista del proyecto.
- Columna central: datos de tarea, categoría/deadline/recurrencia, selector de modo, reloj, tres acciones, resumen y adjuntos.
- Columna derecha: pestaña `Notas de la sesión` y pestaña `Historial`.
- En responsive las columnas se apilan o reorganizan; no debe desaparecer ninguna acción.

## 4.6 Pantalla Progreso

- Navegación de vuelta y pestañas del proyecto.
- Aviso especial si el proyecto procede de una ruta educativa importada.
- Barra de informes: periodo, exportar Markdown/JSON, copiar e importar evaluación.
- Configuración pedagógica y de IA.
- Para General/Estudios: métricas, árbol de competencias, ejercicios, evidencias, evaluaciones.
- Para Entregables: etapas, entregables, dependencias, estados, pesos y evidencias.
- Revisión semanal y consumo de IA.

## 4.7 Componentes reutilizables

El código reutiliza componentes generadores de HTML para marca, iconos, tarjetas, filas de tarea, chips y menús de estado, filtros, alertas, agenda, tabla de aprendizaje, formularios y diálogos. Los estados vacíos, los toasts, las confirmaciones y los menús usan patrones comunes. Un rediseño puede sustituir su estructura visual, pero debe mantener `data-action`, datos e interacciones equivalentes o actualizar cuidadosamente la delegación de eventos en `src/ui/app.js`.

---

# 5. Funcionamiento de tareas, calendario y fechas límite

## 5.1 Registro de fechas

La fecha y hora se registran en el formulario de tarea:

- `dueDate`: fecha local `YYYY-MM-DD`, opcional.
- `dueTime`: hora `HH:mm`, opcional y válida solo cuando hay fecha.
- La UI presenta la hora en formato de 12 horas con AM/PM.
- Una tarea diaria usa `recurrence.startDate`, `recurrence.endDate` y `completedDates`; no combina ese modelo con un deadline único.

No existe diferencia entre “quiero trabajar este día” y “debo entregar como máximo este día”. Actualmente `dueDate` representa la fecha límite.

## 5.2 Clasificación temporal

Para tareas no completadas:

- Día anterior a hoy: vencida.
- Hoy a dos días: urgente en la clasificación de color del proyecto.
- Tres a siete días: próxima.
- Más de siete días: futura.

La agenda global usa grupos más explícitos y no mezcla vencidas con hoy:

1. Vencidas.
2. Se entregan hoy.
3. Vence mañana.
4. Próximos 3 días (días 2 y 3).
5. Próxima semana (días 4 a 7).
6. Próximas a vencer (más de 7 días).
7. Sin fecha.

Dentro de las tareas con fecha se ordena por día, después por hora (las que no tienen hora equivalen al final del día) y finalmente por creación. Las tareas sin fecha muestran primero las que están en curso.

## 5.3 Qué pasa al vencer o completar

- Vencer no cambia automáticamente el estado; la tarea continúa pendiente o en curso y se resalta como vencida.
- Completar elimina la tarea de la agenda activa y la mueve a la pestaña Completadas de su proyecto.
- Una tarea recurrente completada hoy queda marcada “Hecha hoy”; la serie vuelve a estar disponible el siguiente día dentro de su periodo.
- Un proyecto completado y sus tareas quedan fuera de la agenda activa.

## 5.4 Relación calendario–tareas

El calendario mensual se construye a partir de las tareas del proyecto actual. Cada celda puede reunir deadlines únicos y ocurrencias de tareas diarias. Los marcadores indican categorías temporales; pulsar una fecha aplica un filtro a la lista. Pulsar Hoy restablece el mes y limpia el día seleccionado.

Limitaciones:

- No hay un calendario global navegable desde todas las pantallas.
- No hay vistas semanal/diaria.
- No hay filtro global manual por proyecto, prioridad o rango; la agenda agrupa automáticamente.
- No hay drag-and-drop ni reprogramación desde la celda.

## 5.5 Zona horaria y edición

- Las fechas sin hora se interpretan como fechas del calendario local del navegador para evitar desplazamientos UTC.
- Los timestamps de creación, sesiones y actualizaciones usan ISO; se convierten a presentación local.
- El producto no guarda una zona horaria elegida por el usuario ni una zona por tarea.
- Editar la fecha conserva título, categoría, estado, tiempo, sesiones y aprendizajes.
- Si se borra la fecha, también debe desaparecer la hora.
- Cambiar a repetición diaria sustituye el deadline único por el rango de recurrencia.

## 5.6 Necesidad confirmada: agenda inteligente

La base actual ya aporta panel global, ocultación, preferencia persistente, grupos dinámicos, orden por fecha/hora y acceso directo a la tarea. Faltan para cumplir la necesidad completa:

- Calendario global dentro del panel y capacidad de expandirlo/contraerlo.
- Mostrar un contador exacto de tiempo restante cuando haya hora.
- Vista global separada de tareas completadas.
- Filtros globales por proyecto/estado/fecha y futura prioridad.
- Modelar fecha planificada y deadline como conceptos distintos.

---

# 6. Funcionamiento de sesiones Pomodoro

## 6.1 Modelo del temporizador

Aunque conserva el nombre histórico Pomodoro, el temporizador admite dos modos:

- **Sin límite:** cronómetro ascendente.
- **Con tiempo:** cuenta regresiva de cualquier número válido de horas y minutos; al sobrepasar cero continúa como tiempo extra.

`activeTimer` conserva ID de sesión, tarea, fase (`running`/`paused`), segundos ya acumulados, objetivo o `null`, inicio de sesión y última reanudación. Solo puede existir uno en todo el estado.

## 6.2 Persistencia sin doble conteo

La UI actualiza el reloj visualmente, pero no escribe cada segundo. Al iniciar/reanudar guarda un timestamp; al pausar, detener o completar calcula la diferencia real. Esta decisión evita:

- miles de escrituras innecesarias;
- pérdida de tiempo al recargar;
- deriva de intervalos en pestañas en segundo plano;
- sumar dos veces el mismo tramo.

Al exportar una copia con reloj activo, se convierte a una instantánea pausada para evitar que el tiempo siga creciendo fuera del contexto original.

## 6.3 Diferencia entre pausar, detener y completar

| Acción | Sesión guardada | Tiempo sumado a tarea | Reflexión | Estado de tarea |
|---|---:|---:|---|---|
| Pausar | No | No todavía | No | Sin cambio |
| Reanudar | No | No todavía | No | Sin cambio |
| Detener | Sí, si hay duración | Sí, una vez | Opcional; puede omitirse | Pendiente o en curso |
| Completar | Sí, si hay tramo pendiente | Sí, una vez | Obligatoria para completar; solo “Qué aprendí” es obligatorio | Completada o “hecha hoy” |

Una sesión detenida queda guardada incluso si el usuario omite escribir. Si luego crea una reflexión, esta se asocia como máximo a una sesión. Eliminar la reflexión nunca resta tiempo.

## 6.4 Historial

Cada `FocusSession` guarda tarea, inicio, fin, duración y motivo. Cada `LearningEntry` puede apuntar a su sesión mediante `focusSessionId`. El historial de la tarea numera entradas como `Sesión 1`, `Sesión 2`…; la tabla del proyecto las enumera como `Clase 1`, `Clase 2`…, mostrando tarea y fecha en la primera columna.

---

# 7. Funcionamiento del módulo Progreso

## 7.1 Acceso y alcance

Progreso es por proyecto, no global. Se abre desde la pestaña `Mi progreso` del proyecto. Los proyectos `general` y `studies` utilizan seguimiento por competencias; los `deliverables` utilizan etapas y entregables. Todos comparten tareas, sesiones, reflexiones, evidencias, informes y revisión semanal.

## 7.2 Actividad realizada

StudyHub puede medir sin interpretar como nota:

- segundos acumulados de todas las tareas del proyecto;
- sesiones y tiempo de la semana;
- número de tareas y ejercicios;
- evaluaciones realizadas;
- frecuencia implícita por fechas de sesiones/evaluaciones;
- cantidad de entregables en cada estado.

El tiempo total se deriva de `task.accumulatedSeconds`; la semana usa sesiones cuyo `endedAt` cae entre lunes y domingo local.

## 7.3 Resultados demostrados en Estudios

Cada competencia obtiene progreso a partir de evaluaciones completadas que la referencian:

1. Se ordenan cronológicamente.
2. El porcentaje mostrado es el promedio de las últimas tres.
3. La tendencia compara ese promedio con hasta tres evaluaciones anteriores.
4. El nivel se asigna mediante umbrales configurados; etiquetas actuales: Inicial, Básico, En desarrollo, Funcional, Autónomo y Sólido.
5. La cobertura es el porcentaje de competencias que tienen al menos una evaluación, no el porcentaje dominado.
6. El promedio evaluado promedia las evaluaciones puntuadas.
7. El nivel general solo se muestra cuando al menos dos competencias están validadas; de otro modo aparece “No justificable”.

## 7.4 Rúbrica y porcentaje

La rúbrica predeterminada pesa:

- Comprensión: 20 %.
- Implementación independiente: 40 %.
- Integración de conocimientos: 25 %.
- Depuración y buenas prácticas: 15 %.

Cada criterio se puntúa de 0 a 4. El porcentaje es la suma ponderada normalizada de los criterios realmente evaluados. Los pesos editados deben sumar 100 y la versión de rúbrica se conserva.

## 7.5 Estados de validación

- **Sin evaluar:** no hay evaluaciones válidas.
- **Evidencia insuficiente:** puntaje bajo o evidencia insuficiente.
- **Nivel provisional:** existe señal de desempeño, pero falta repetición, dificultad o independencia.
- **Nivel validado:** exige al menos 3 evaluaciones, 2 fechas distintas, alguna dificultad 4 o superior, evidencia independiente de dificultad 3 o superior y porcentaje de al menos 60.

La evidencia independiente requiere ayuda `none` o `conceptual_hints` y al menos 60 %. Esto evita validar dominio solo por una solución copiada/generada o un resultado aislado.

## 7.6 Resultados en proyectos de Entregables

Los entregables pertenecen a etapas y pueden estar pendientes, en proceso, bloqueados, completados sin verificar o verificados. Pueden tener dependencias y peso.

- Verificado aporta 100 % de su peso.
- Completado sin verificar aporta 75 %.
- En proceso aporta 35 %.
- Pendiente/bloqueado aporta 0 %.
- Solo se muestra porcentaje de etapa si todos sus entregables tienen peso. Sin pesos se presentan cantidades, no un porcentaje inventado.
- No se permite completar/verificar un entregable si sus dependencias requeridas no están listas.

## 7.7 Relación con tareas, Pomodoro y reflexiones

- Las tareas y sesiones alimentan **actividad**, no calificación.
- Las reflexiones documentan aprendizaje, pero por sí solas no validan una competencia.
- Los ejercicios, evaluaciones y evidencias alimentan **resultados**.
- Una recomendación de evaluación puede convertirse en tarea, cerrando el ciclo de mejora sin alterar la evaluación original.

## 7.8 Pendientes de Progreso

- Resumen global entre proyectos.
- Gráficas temporales más expresivas y comparación de periodos dentro de la UI.
- Diagnóstico inicial guiado.
- Taxonomía y detección de errores recurrentes.
- Metas/objetivos medibles distintos de tareas.
- Vinculación más directa entre una tarea, una competencia y la evidencia producida por esa tarea.

---

# 8. Estado de evaluaciones, competencias y evidencias

## 8.1 Qué está implementado

- Crear/eliminar competencias y subcompetencias.
- Crear ejercicios con dificultad, competencias, código/contexto, resultado esperado/real, nivel de ayuda y declaración de independencia.
- Registrar evaluaciones manuales con rúbrica, justificaciones y recomendaciones.
- Solicitar evaluaciones a Gemini, Cloudflare o ambos mediante una Edge Function autenticada.
- Registrar fallos de proveedor y consumo reportado.
- Crear/eliminar evidencias asociadas a proyecto, ejercicio o entregable.
- Consultar historial y tendencia por competencia.
- Exportar informes Markdown/JSON y copiar texto para compartir manualmente con ChatGPT.
- Importar evaluaciones externas JSON con validación y deduplicación.

## 8.2 Lo que no debe inferirse

- Una competencia sin evidencia es **Sin evaluar**, nunca 0 ni aprobada.
- Haber dedicado muchas horas no eleva el nivel.
- Una reflexión no es automáticamente evidencia validada.
- Un curso marcado como completado en una cuenta prestada no representa aprendizaje del usuario.
- El importador educativo ignora campos como `completed`, `progress`, `percentage`, `certificate` y `score` del origen.
- No existe una conexión automática con ChatGPT. El flujo actual es exportar/copiar/importar manualmente.

## 8.3 IA y privacidad

Las claves privadas viven como secretos del entorno de Supabase y no se envían al cliente. El frontend llama una función autenticada. La configuración es por proyecto y ofrece proveedor, perfil, modelos, límite diario y modo de privacidad. Si se seleccionan ambos proveedores, sus respuestas se guardan separadamente; no se fusionan fingiendo consenso.

## 8.4 Evaluación pendiente o parcial

- No hay ejecución automática de tests de código dentro del navegador; el ejercicio contiene un estado de tests inicial `not_run`.
- No existe diagnóstico adaptativo.
- No hay verificación automática de certificados.
- No existe análisis estructurado de errores recurrentes.
- No hay evaluación automática de archivos adjuntos de tarea.

---

# 9. Flujos de usuario existentes

## Flujo A: proyecto y tarea

1. El usuario crea un proyecto con metadatos y tipo.
2. Abre el proyecto y crea una tarea.
3. Puede añadir categoría, fecha/hora o repetición diaria y archivos opcionales.
4. La tarea aparece en Por hacer, agenda global y calendario si corresponde.
5. El usuario puede cambiar estado, editar, abrir en enfoque o eliminar.
6. Al completar se abre la reflexión; guardar marca la tarea terminada.
7. La tarea sale de agenda y aparece en Completadas. En recurrencia diaria solo se completa la fecha actual.

Excepción: un proyecto completado debe descompletarse antes de crear tareas o iniciar sesiones.

## Flujo B: concentración

1. El usuario abre una tarea desde el proyecto o la agenda.
2. Elige Sin límite o una duración personalizada.
3. Inicia; el reloj usa timestamps.
4. Pausa y reanuda la misma sesión sin guardarla aún.
5. Detener guarda sesión/tiempo y ofrece reflexión opcional.
6. Completar guarda el tramo pendiente, exige “Qué aprendí”, crea la entrada y completa tarea/ocurrencia.
7. Recargar conserva el temporizador y reconstruye el tiempo.

Excepción: solo hay un temporizador global. Si otro contexto necesita completar una tarea, la lógica protege el temporizador ajeno y evita doble conteo.

## Flujo C: progreso

1. La actividad de tareas/sesiones aporta tiempo y frecuencia.
2. El usuario registra competencias, ejercicios, entregables o evidencias.
3. Evalúa manualmente o con IA.
4. El repositorio guarda puntuación, validación, recomendaciones y auditoría.
5. Los selectores recalculan cobertura, tendencia, nivel, actividad semanal o progreso ponderado.
6. El usuario consulta Mi progreso o exporta un informe.

## Flujo D: aprendizaje

1. Durante el estudio, el usuario escribe notas y pega imágenes.
2. Al detener/completar, el borrador rellena la reflexión.
3. La entrada aparece en historial y registro del proyecto.
4. Puede crear un ejercicio y evaluarlo.
5. Puede revisar competencias, debilidades y recomendaciones.

Implementado: notas, reflexión, imágenes, historial, ejercicios, evaluación, competencia, evidencia e informe. Parcial: diagnóstico guiado, práctica adaptativa y errores recurrentes.

## Flujo E: entregas

1. El usuario consulta agenda global o alerta/calendario del proyecto.
2. Identifica vencidas, hoy, mañana, 2–3 días, 4–7 días, posteriores o sin fecha.
3. Abre la tarea directamente.
4. Estudia/trabaja y registra tiempo, archivos y aprendizaje.
5. Completa con reflexión; la tarea desaparece de grupos activos.

Limitación: la urgencia es temporal; no combina impacto, prioridad manual o fecha planificada.

## Flujo F: ruta educativa

1. El usuario elige Importar ruta, no Importar copia.
2. Selecciona JSON neutral.
3. El importador normaliza contenido y muestra vista previa/advertencias/campos ignorados.
4. El usuario confirma.
5. Se crea un proyecto nuevo tipo Estudios con competencias sin evaluar y actividades previstas.
6. La huella impide importar la misma ruta dos veces.

---

# 10. Mapa técnico: archivos, componentes y servicios

## 10.1 Estructura

```text
index.html                         Entrada HTML
src/main.js                       Arranque, Supabase/adaptador y montaje
src/router.js                     Router hash
src/data/
  schema.js                       Estado v2, normalización y validación
  repository.js                   Reglas y mutaciones del dominio
  localAdapter.js                 Persistencia local
  cloudAdapter.js                 Snapshot cloud, caché y cola offline
src/state/
  store.js                        Store observable
  selectors.js                    Consultas derivadas
src/timer/
  timerController.js              Ticks visuales/reconstrucción
src/views/
  projectsView.js                 Inicio
  completedProjectsView.js        Proyectos completados
  projectView.js                  Resumen, tareas, calendario, aprendizajes
  focusView.js                    Temporizador, adjuntos y notas
  progressView.js                 Competencias/evaluación/entregables
src/ui/
  app.js                          Shell, estado UI, eventos y formularios
  components.js                   Componentes HTML compartidos
  icons.js                        SVG inline
  learningDrafts.js               Borradores locales de reflexión
src/evaluation/
  constants.js                    Tipos, etiquetas, rúbrica y configuración
  progress.js                     Cálculos de progreso
  report.js                       Informes e importación externa
  learningPathImport.js           Conversión de rutas educativas
src/cloud/
  supabase.js                     Cliente/autenticación
  authGate.js                     Pantalla de acceso
  taskFiles.js                    Storage privado de adjuntos
  aiEvaluation.js                 Cliente de Edge Function
src/utils/
  time.js                         Fecha, hora, calendario y duración
  recurrence.js                   Repetición diaria
  learningImages.js               Validación/compresión de imágenes
  text.js, id.js                  Seguridad de texto e IDs
src/styles/
  tokens.css                      Variables visuales
  app.css                         Shell general
  components.css                  Componentes compartidos
  project.css                     Proyecto/calendario
  focus.css                       Modo enfoque
  progress.css                    Progreso/evaluación
  responsive.css                  Adaptación por ancho
  index.css                       Composición de estilos
supabase/migrations/              Tablas, políticas y bucket
supabase/functions/studyhub-evaluate/index.ts
                                    Evaluación IA en servidor
tests/                             Pruebas Vitest
netlify.toml                       Build `npm run build`, salida `dist`
```

## 10.2 Dependencias entre capas

```text
Vistas/componentes
       │ acciones de usuario
       ▼
src/ui/app.js
       │ llama métodos
       ▼
StudyHubRepository ──► valida/normaliza estado ──► adapter.save()
       │                                              │
       ▼                                              ├─ LocalStorage
Store observable                                     └─ Supabase + caché/cola
       │
       ├─ selectores de tareas/aprendizajes
       └─ cálculos de progreso/reportes
```

## 10.3 Lógica que no debe trasladarse a CSS o reimplementarse en la vista

- Finalización de temporizadores y prevención de doble conteo.
- Cascadas al eliminar proyecto/tarea.
- Reglas de recurrencia y “completar hoy”.
- Validación de backup, evaluación e importación educativa.
- Cálculos de competencia, validación y entregables.
- Cola offline, separación por cuenta y migración local.
- Hash/nombre seguro y reemplazo de adjuntos.
- Restricciones de privacidad y límites de IA.

## 10.4 Base de datos y servicios

- `studyhub_states`: snapshot JSON por usuario, revisión y fecha; RLS por `auth.uid()`.
- Bucket `studyhub-task-files`: privado, rutas por usuario/tarea.
- Supabase Auth: correo/contraseña.
- `studyhub-evaluate`: Edge Function autenticada que accede a proveedores configurados mediante secretos.
- Netlify: build desde `main`, comando `npm run build`, publicación `dist`.

---

# 11. Dependencias y comportamientos que no debemos romper

1. **Compatibilidad de datos:** mantener `schemaVersion`, IDs, relaciones y normalización. No cambiar nombres de campos sin migración.
2. **Entrada por repositorio:** las mutaciones deben seguir pasando por `StudyHubRepository`.
3. **Tiempo exacto:** no sumar por ticks ni escribir cada segundo. Pausar, detener y completar son operaciones distintas.
4. **Una sesión activa global:** la interfaz debe reflejar el temporizador existente aunque se navegue.
5. **No doble conteo:** finalizar una sesión exactamente una vez; una reflexión no vuelve a sumar tiempo.
6. **Relaciones:** `Project → Task → FocusSession → LearningEntry`; una sesión no admite dos reflexiones.
7. **Reflexión al completar:** “Qué aprendí” es el único texto obligatorio; dudas y siguiente sesión son opcionales.
8. **Recurrencia:** completar una ocurrencia diaria no completa la serie salvo fin del rango.
9. **Fechas locales:** no parsear una fecha de calendario como UTC y desplazarla un día.
10. **Hora dependiente de fecha:** una tarea no puede conservar `dueTime` sin `dueDate`.
11. **Progreso basado en evidencia:** horas, tareas o historial externo no producen una calificación.
12. **Sin porcentajes inventados:** entregables sin pesos se expresan con cantidades; competencias insuficientes permanecen sin nivel general.
13. **Competencias importadas:** siempre comienzan Sin evaluar; ignorar progreso/certificados/calificaciones de cuentas externas.
14. **Cascadas de borrado:** proyecto/tarea deben eliminar dependencias y programar limpieza de archivos.
15. **Proyecto completado:** queda consultable, fuera de activos, y bloquea nueva actividad hasta reabrir.
16. **Backups:** importar copia reemplaza estado; importar ruta crea proyecto. No mezclar flujos.
17. **Exportación segura:** no incluir adjuntos ni secretos; pausar lógicamente el reloj exportado.
18. **RLS y secretos:** nunca mover claves privadas al cliente ni a variables `VITE_`.
19. **Offline honesto:** la UI debe diferenciar guardado local pendiente de sincronización confirmada.
20. **Preferencias visuales:** barras y filtros persistentes no deben contaminar el estado pedagógico.

Pruebas especialmente sensibles durante el rediseño: iniciar/pausar/reanudar/detener/completar, varias sesiones, recarga, recurrencia diaria, completar desde chip, cambio de tarea con temporizador, borrados en cascada, fechas locales, agenda dinámica, importaciones, aislamiento de cuentas y cola offline.

---

# 12. Problemas conocidos y limitaciones

| Área | Limitación actual | Riesgo para el rediseño |
|---|---|---|
| Concurrencia cloud | Último snapshot aceptado; no merge por campo. | No prometer colaboración simultánea ni resolución automática de conflictos. |
| Agenda | No contiene calendario global ni pestaña de completadas. | Un nuevo diseño debe distinguir lo existente de la expansión requerida. |
| Fechas | Solo deadline, sin fecha planificada ni zona elegible. | Evitar etiquetas que impliquen dos fechas ya persistidas. |
| Prioridad | No existe campo manual. | No crear controles visuales sin soporte de dominio. |
| Estadísticas | Sin pantalla global dedicada. | No presentar el dashboard como analítica pedagógica completa. |
| Diagnóstico | Se arma con ejercicios/evaluaciones; no hay wizard. | Mantener etiqueta Parcial. |
| Errores recurrentes | Texto libre, sin clasificación automática. | No mostrar tendencias de errores como si fueran calculadas. |
| Adjuntos | Sin eliminación individual; requieren red y no van en backup. | Explicar alcance de copias y operación offline. |
| Evaluación IA | Depende de servicios, límites y respuestas externas. | Mostrar errores/uso sin inventar métricas; permitir evaluación manual. |
| Accesibilidad | Hay ARIA, foco y semántica, pero no auditoría WCAG formal. | El rediseño debe incluir verificación real de teclado, contraste y lector. |
| Búsqueda | Centrada en proyectos; no hay buscador global completo de tareas, notas y evidencia. | No sobrecargar el campo actual con promesas inexistentes. |
| Orden | Sin drag-and-drop ni orden manual de tareas/proyectos. | Conservar orden derivado o implementar dominio antes de mostrar asas. |
| Temas | Tema oscuro y variante atenuada; no tema claro completo confirmado. | No asumir soporte multitema terminado. |
| Archivos educativos | Importador listo, archivo final aún no verificado. | Probar con el JSON real antes de declarar compatibilidad final. |

El código contiene animaciones de entrada de página (`page-enter`). El usuario ha expresado anteriormente rechazo a una sensación de “recargar todo” en cada acción. Un rediseño debe limitar animaciones a transiciones de navegación o cambios útiles y evitar reanimar el contenido completo ante cada mutación menor.

---

# 13. Requisitos confirmados para el nuevo diseño

## 13.1 Dirección visual

- Oscura, elegante, moderna y minimalista.
- Menos saturación de cuadros y paneles, sin quitar funciones.
- Jerarquía clara, buen uso del espacio y lectura cómoda diaria.
- Responsive real y objetivos táctiles amplios.
- Accesibilidad: foco visible, teclado, contraste, etiquetas y estados comprensibles.
- Textos largos con wrap; no truncar información crítica como el nombre completo de una entrega.
- Menús flotantes sin superposición con tareas y alineación consistente de fecha/estado/tiempo.
- Animación moderada y con propósito.

## 13.2 Prioridades funcionales del rediseño

1. Ver fecha y hora máxima de entrega.
2. Saber cuánto falta para cada entrega.
3. Priorizar automáticamente por vencimiento.
4. Abrir/cerrar agenda y expandir/contraer un calendario global.
5. Acceder a entregas desde cualquier sección y abrir directamente la tarea.
6. Mantener vencidas, hoy, próximas, sin fecha y completadas conceptualmente separadas.
7. Consultar progreso real sin mezclar horas con desempeño.
8. Comprender competencias sin evaluar, provisionales y validadas.
9. Conservar Pomodoro circular, posición de controles, historial, borradores, reflexiones e imágenes.
10. Mantener proyectos completados en una sección separada y reversible.
11. Conservar barras laterales ocultables con riel de alto completo y preferencia persistente.
12. Mantener toda la caja de perfil como activador de su menú.

## 13.3 Agenda inteligente: existente frente a requerido

| Capacidad | Situación |
|---|---|
| Disponible en todas las rutas | **IMPLEMENTADA** |
| Mostrar/ocultar panel | **IMPLEMENTADA** |
| Guardar visibilidad | **IMPLEMENTADA** |
| Ordenar por fecha y hora | **IMPLEMENTADA** |
| Vencidas separadas de hoy | **IMPLEMENTADA** |
| Mañana, 3 días, semana, posteriores y sin fecha | **IMPLEMENTADA** |
| Abrir directamente la tarea | **IMPLEMENTADA** |
| Calendario global expandible/contraíble | **PLANIFICADA** |
| Contador exacto hasta fecha/hora | **PLANIFICADA** |
| Vista global de completadas | **PLANIFICADA** |
| Filtros globales por proyecto/estado/prioridad | **PLANIFICADA** |
| Fecha planificada separada de deadline | **PLANIFICADA** |

## 13.4 Principio pedagógico no negociable

Todo aprendizaje importado, procedente de una cuenta prestada o carente de evidencia propia debe comenzar **Sin evaluar**. Ningún porcentaje, certificado o estado externo puede aprobar competencias, elevar niveles o eximir contenidos automáticamente. La evaluación del usuario se basa exclusivamente en ejercicios, evidencias y resultados propios registrados en StudyHub.

---

# 14. Información no confirmada que necesitaría el diseñador

1. Medidas objetivo y dispositivos prioritarios (móvil específico, portátil, monitor ultrawide).
2. Nivel WCAG deseado y si habrá auditoría con lector de pantalla concreto.
3. Si se implementará tema claro o solo oscuro/atenuado.
4. Si el calendario global sustituirá visualmente al calendario de proyecto o convivirá con él.
5. Si las completadas globales serán pestaña, filtro o historial independiente.
6. Modelo exacto de prioridad manual: niveles, impacto, urgencia o etiquetas.
7. Definición de fecha planificada frente a deadline y reglas de orden cuando existan ambas.
8. Granularidad del tiempo restante: días, horas/minutos, redondeo y comportamiento vencido.
9. Necesidad de zona horaria configurable o soporte para viajes/equipos remotos.
10. Si General necesita una presentación propia distinta de Estudios.
11. Qué gráficos de evolución tienen mayor valor: competencia, periodo, proyecto o conjunto global.
12. Si se requiere buscador global de tareas, notas, categorías, adjuntos y evaluaciones.
13. Si se añadirá borrado/versionado individual de adjuntos.
14. Si se necesita colaboración multiusuario; la arquitectura actual es personal por cuenta.
15. Archivo real `StudyHub_Ruta_Frontend_2026.json` para validar el importador de extremo a extremo.
16. Volumen esperado de imágenes de reflexión, adjuntos y años de historial para pruebas de rendimiento.
17. Reglas de notificación: navegador, correo, recordatorios, silencio y permisos. Actualmente no hay sistema de notificaciones push.
18. Criterios de aceptación visual y flujo para la futura Agenda inteligente.

---

## Nota final para el diseñador

La interfaz puede reorganizarse ampliamente, pero StudyHub ya posee un dominio considerable. Antes de reemplazar componentes, conviene mapear cada control nuevo a los métodos existentes del repositorio y conservar los tests de tiempo, persistencia, recurrencia, eliminación, aprendizaje y evaluación. La prioridad del rediseño es reducir ruido y mejorar navegación sin convertir reglas de negocio maduras en lógica visual duplicada.
