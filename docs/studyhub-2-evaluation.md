# StudyHub 2.0: evaluación y seguimiento

## Arquitectura

StudyHub conserva el modelo actual: un snapshot JSON versionado por usuario en `studyhub_states`, caché local para trabajar temporalmente sin conexión y sincronización con control de revisión. El esquema 2 agrega competencias, ejercicios, evidencias, evaluaciones, etapas, entregables, consumo de IA y revisiones semanales. La RLS existente sigue limitando cada fila a `auth.uid()`.

Las evaluaciones externas no salen directamente desde el navegador. La interfaz invoca la Edge Function autenticada `studyhub-evaluate`; allí se leen los secretos y se llama a Gemini o Cloudflare. La función no devuelve secretos y valida el tamaño, el perfil y el JSON estructurado de respuesta.

## Configurar proveedores sin exponer claves

1. Crea una clave en [Google AI Studio](https://aistudio.google.com/api-keys) y revisa la [guía oficial de claves](https://ai.google.dev/gemini-api/docs/api-key).
2. En [Cloudflare](https://dash.cloudflare.com/) copia el Account ID y crea un token limitado a Workers AI. Consulta la [guía REST oficial](https://developers.cloudflare.com/workers-ai/get-started/rest-api/).
3. En el proyecto de Supabase abre **Edge Functions > Secrets**, o usa localmente:

   ```text
   supabase secrets set GEMINI_API_KEY=...
   supabase secrets set CLOUDFLARE_API_TOKEN=...
   supabase secrets set CLOUDFLARE_ACCOUNT_ID=...
   ```

4. Opcionalmente configura `GEMINI_MODEL` y `CLOUDFLARE_MODEL`. Los valores iniciales son `gemini-3.8-flash` y `@cf/openai/gpt-oss-120b`.
5. Despliega la migración y la función solo en un entorno autorizado. Este cambio local no las despliega.
6. En **Mi progreso > Consumo de IA**, pulsa **Comprobar conexión**. “Configurado” solo confirma que existe el secreto; una evaluación real es la prueba efectiva del modelo, permisos y cuota.

No habilites facturación automática. Revisa los límites gratuitos en los paneles de cada proveedor. El sistema no cambia de modelo ni de proveedor en silencio y el modo “Ambos” advierte que consume recursos de las dos APIs.

## Privacidad

- **Personal:** permite enviar el ejercicio registrado.
- **Privado:** bloquea código y archivos antes de la llamada de red.
- **Ejercicios ficticios:** pensado para práctica autorizada sin información empresarial.

Nunca uses código corporativo o confidencial sin autorización. Los informes permiten excluir el código. El navegador solo contiene las claves públicas de Supabase; los tres secretos de IA son exclusivos del servidor.

## Prueba manual local

1. Crea o edita un proyecto y elige **Estudios** o **Entregables**.
2. Abre **Mi progreso**.
3. En Estudios, crea competencias, un ejercicio y una evaluación manual. Comprueba que una sola nota alta queda provisional.
4. Añade evidencia y confirma que el panel se actualiza de inmediato.
5. En Entregables, crea una etapa, dos entregables y una dependencia. No debe ser posible verificar el segundo antes del primero.
6. Exporta Markdown y JSON, e importa de nuevo el JSON: los duplicados deben omitirse.
7. Sin secretos o sin conexión, el progreso, el historial y la exportación siguen disponibles; solo la evaluación de IA falla con un mensaje explícito.

## Estado de las conexiones

Las integraciones están implementadas y probadas con adaptadores simulados. No se ha ejecutado una solicitud real en este cambio porque no hay credenciales disponibles en el entorno local y no se ha desplegado la Edge Function. Por tanto, Gemini y Cloudflare deben considerarse **no verificados en vivo** hasta completar el paso 6 anterior.

## Importar rutas educativas

**Importar ruta educativa** es independiente de **Importar copia JSON**. Crea un proyecto nuevo de Estudios y nunca reemplaza proyectos existentes. El importador acepta una raíz `route`, `ruta` o el propio documento, y reconoce nombres equivalentes en español e inglés para:

- `competencias` / `competencies`;
- `clases` / `classes` y `lecciones` / `lessons`;
- `tareas` / `tasks` y `actividades` / `activities`;
- `ejercicios` / `exercises`;
- `evaluacionesPrevistas` / `plannedEvaluations`;
- `enlaces`, `dependencias` y fechas límite.

Antes de importar muestra cantidades y advertencias. Un fingerprint canónico impide importar dos veces el mismo documento. Los identificadores externos se usan únicamente para reconstruir relaciones y dependencias.

Los campos externos como `completed`, `progreso`, `porcentaje`, `certificado`, `score` o `calificación` se ignoran. No se crea ninguna evaluación ni puntuación. Todas las competencias importadas comienzan como **Sin evaluar** y solo cambian mediante diagnósticos, ejercicios y evidencias propios guardados en StudyHub.
