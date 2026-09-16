# Configuracion cloud de StudyHub

StudyHub usa Supabase Auth y una fila JSON por usuario en Postgres. Netlify
continua alojando el frontend. `localStorage` puede mantenerse como cache y
cola temporal, pero Supabase debe ser la fuente principal cuando hay conexion.

## 1. Crear el proyecto de Supabase

1. Inicia sesion en [Supabase](https://supabase.com/dashboard) y crea un
   proyecto en una organizacion del plan deseado.
2. Elige una region cercana a los usuarios y guarda la contrasena de Postgres
   en un gestor de contrasenas. La aplicacion web no utiliza esa contrasena.
3. Espera hasta que el proyecto aparezca como activo.

## 2. Aplicar la migracion

La migracion se encuentra en:

`supabase/migrations/202609160001_create_studyhub_states.sql`

Puede aplicarse con Supabase CLI, despues de autenticar y enlazar el proyecto:

```sh
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase db push
```

Como alternativa, copia el contenido de la migracion en el SQL Editor del
Dashboard y ejecutalo una sola vez.

La tabla resultante contiene un unico snapshot por usuario:

- `user_id`: clave primaria y referencia a `auth.users(id)`;
- `state`: objeto JSON con el estado completo de StudyHub;
- `revision`: version monotona incluida en cada snapshot;
- `updated_at`: fecha de la ultima escritura aceptada.

Cada escritura reemplaza la fila completa dentro de una unica operacion de
Postgres, por lo que no quedan proyectos, sesiones o reflexiones a medio guardar.
Para mantener la sincronizacion sencilla, si dos dispositivos editan al mismo
tiempo prevalece el ultimo snapshot aceptado por la base. Al volver a abrir o
actualizar StudyHub se recupera la version cloud mas reciente.

## 3. Configurar autenticacion

En **Authentication > URL Configuration** configura:

- Site URL: `https://studyhub-estudios.netlify.app`
- Redirect URL de produccion: `https://studyhub-estudios.netlify.app/**`
- Desarrollo local: `http://localhost:5173/**`
- Deploy Previews, si se usan:
  `https://**--studyhub-estudios.netlify.app/**`

En **Authentication > Providers > Email**, conserva habilitado email y
contrasena. Para una aplicacion personal se recomienda mantener la confirmacion
de correo habilitada. El proveedor SMTP integrado de Supabase es apropiado solo
para pruebas y tiene limites estrictos; configura SMTP propio antes de admitir
usuarios publicos adicionales.

## 4. Obtener la configuracion publica

En el dialogo **Connect** del proyecto copia solamente:

- Project URL;
- Publishable key, cuyo formato comienza por `sb_publishable_`.

Para desarrollo local, crea `.env.local` a partir de `.env.example`:

```env
VITE_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REEMPLAZAR
```

`.env.local` debe permanecer fuera de Git.

En Netlify, abre **Project configuration > Environment variables** y crea las
mismas variables para el contexto de produccion. Incluye tambien el contexto de
Deploy Previews si estos deben conectarse al mismo proyecto. Despues inicia un
nuevo deploy para que Vite incorpore los valores al bundle.

La URL y la publishable key son configuracion publica: cualquier valor con
prefijo `VITE_` puede ser inspeccionado en el navegador. La seguridad no depende
de ocultarlos, sino de las politicas RLS.

## 5. Modelo de seguridad

La migracion aplica estas defensas:

- Row Level Security habilitado en `public.studyhub_states`;
- ningun permiso para `anon` ni `PUBLIC`;
- solo `SELECT`, `INSERT`, `UPDATE` y `DELETE` para `authenticated`;
- una politica independiente por operacion;
- todas las politicas comparan `auth.uid()` con `user_id`;
- `WITH CHECK` impide insertar una fila de otro usuario o reasignar la propia;
- al eliminar un usuario de Auth se elimina su snapshot mediante `ON DELETE
  CASCADE`;
- `state` debe ser un objeto JSON y `revision` no puede ser negativa.

No utilices `sb_secret_...`, la clave legacy `service_role`, la contrasena de
Postgres ni un token personal de Supabase en el frontend, en `.env.example` o en
el repositorio. Una clave administrativa omite RLS y debe permanecer unicamente
en infraestructura de servidor confiable. StudyHub no la necesita para acceder
a los datos de cada usuario.

## 6. Verificacion minima

Despues de integrar el cliente de Supabase, valida lo siguiente con dos cuentas:

1. la cuenta A puede crear, leer, actualizar y eliminar su snapshot;
2. la cuenta B no puede seleccionar ni modificar la fila de A;
3. una peticion sin iniciar sesion no puede acceder a la tabla;
4. actualizar otro navegador recupera el snapshot cloud mas reciente;
5. cerrar y abrir sesion en otro navegador recupera el snapshot cloud;
6. estando sin conexion, la interfaz usa la cache local y sincroniza la cola al
   recuperar la conexion.
