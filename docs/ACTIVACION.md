# Activación de SURTIVA

## Proyecto exacto

Repositorio: `lexrodriguezorg-lang/surtiva`. Producción: `https://surtiva-o3hj.vercel.app`.
El estado GitHub del commit original confirma el proyecto Vercel `surtiva-o3hj` en el equipo `lexrodriguezorg-4994s-projects`. La conexión Vercel de esta sesión no permite consultarlo (404), aunque muestra otro proyecto del equipo. No enlazar el repositorio al proyecto `agencia-digital-gestion`.

Acceso recuperado mediante CLI: `.vercel/project.json` identifica `prj_vwgtk9U2KB6D0Vz1J4F3TG6SNc61`. El conector sigue limitado, pero la CLI permite inspeccionar y desplegar el proyecto correcto. Se publica primero el cierre seguro: portada disponible y cuentas deshabilitadas mientras falten las variables Supabase. Esto retira el dashboard público de la demo sin conceder acceso simulado.

## Backend recomendado e implementado

Supabase Auth + PostgreSQL + RLS; API de Vercel sin clave administrativa. Identidad y datos comerciales son entidades diferentes. Los módulos antiguos permanecen en el repositorio como fuente de migración, pero no se distribuyen en el build.

1. Seleccionar un proyecto Supabase **nuevo o expresamente reservado para SURTIVA**, no una base existente de otra aplicación. Las migraciones crean tablas en `public` y un trigger en `auth.users`.
2. Ejecutar en orden `supabase/migrations/001_multitenant.sql` a `005_local_sales.sql` con el SQL Editor o el flujo de migraciones Supabase. Cada archivo es transaccional; se aplica una sola vez. No aplicarlo sobre tablas homónimas de otra aplicación.
3. Generar la semilla con `node scripts/migrate-demo.mjs` y aplicar `supabase/seed/dukes.sql`. Es idempotente, no reemplaza datos operativos, no crea cuentas ni contraseñas y marca Dukes como ejemplo. Sus existencias son simuladas o desconocidas, nunca derivadas del campo “Paca”. No hay proveedores ficticios: Daniela representaba a la operadora del distribuidor.
4. Configurar en Supabase Auth: email/password activo, confirmación de correo obligatoria, registro habilitado, URL del sitio `https://surtiva-o3hj.vercel.app/#ingresar`, contraseña mínima de 12 caracteres y límites de intentos apropiados. El flujo actual es contraseña + verificación de email; no utiliza enlaces de sesión automática ni tokens en URL. Comprobar entrega de los correos del proveedor antes de abrir altas reales. No se añadió proveedor de correo, pagos ni integración comercial externa.
5. Configurar **solo en servidor** en Vercel: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (publishable o JWT anon; nunca secret/service_role) y `APP_ORIGIN=https://surtiva-o3hj.vercel.app`. En preview se acepta también el hostname exacto de `VERCEL_URL`. Para desarrollo usar `.env.local` basado en `.env.example`.
6. Registrar y verificar la cuenta real del administrador mediante “Solicitar acceso”. Otorgar el privilegio inicial desde SQL Editor con el UUID confirmado de ese usuario, nunca por metadatos ni por el rol que selecciona el formulario:

```sql
-- Reemplazar por el UUID de la cuenta propietaria VERIFICADA.
insert into public.platform_admins(user_id)
select id from auth.users
where id = 'UUID_CONFIRMADO'::uuid and email_confirmed_at is not null
on conflict (user_id) do nothing;
```

7. Ingresar como administrador Surtiva. Revisar solicitudes. Para un nuevo distribuidor, crear su organización durante la aprobación. Para vendedor, comercio o aliado, elegir organización y entidad existente. El distribuidor puede crear vendedores, clientes, proveedores, puntos y productos desde sus secciones; puede habilitar catálogo por vendedor/comercio y asignar puntos a pedidos. Una cuenta puede tener varias membresías; cada sesión selecciona una organización autorizada. El administrador puede revocar membresías.
8. Crear preview desde la rama y validar con usuarios de dos organizaciones distintas. Solo después de backend configurado y pruebas reales de autenticación, habilitar las cuentas en producción. El cierre público inicial puede desplegarse antes: sin configuración, todos los datos permanecen inaccesibles y los formularios informan que el acceso aún no está habilitado.

## Verificación por bloque

`npm ci`, `npm test`, `npm run build`, `npm run check`. Las pruebas usan PostgreSQL embebido (PGlite), ejecutan el SQL real y simulan solamente el esquema Auth y los roles que Supabase proporciona. Las pruebas de API usan respuestas controladas del proveedor: **no sustituyen** una prueba de registro y correo contra Supabase real.

En cada preview comprobar `/api/health`, acceso anónimo `401` a `/api/session` y a datos, `404` a `/data/catalogo.js` y `/src/operacion.js`, formulario público y rutas internas. Un servidor sin variables responde `503` al intentar autenticarse; nunca concede una sesión de prueba ni confirma que guardó una solicitud inexistente.

Casos reales antes de promover: verificar correo, estado pendiente, rechazo, aprobación por administrador, nueva organización vacía, acceso Dukes separado, vendedor con otro cliente, comercio con otra cartera, aliado con otro pedido, inventario insuficiente, cierre de sesión y revocación. La sesión usa cookies HttpOnly/Secure/SameSite, se verifica con Auth y las consultas se ejecutan como el usuario bajo RLS.

## Datos de pruebas guardados en navegadores

No hay sincronización automática del antiguo `localStorage`. Las modificaciones hechas allí no existían en el repositorio ni en Vercel. Conservar una exportación antes de limpiar el navegador. La migración incluida conserva el catálogo y `seed()` del repositorio confirmado. No se importan archivos locales adicionales como datos confiables ni se ejecuta su contenido. Los módulos originales permiten recuperar/exportar el escenario desde una copia local aislada; no deben volver a publicarse como puerta de acceso.

## Límites deliberados de esta fase

No hay cobros, pasarelas, conciliación automática, envío de invitaciones ni integración con software externo. Los registros históricos de cartera y estados de pago son informativos. La política de comisión del escenario Dukes es 8%; organizaciones nuevas empiezan en 0 hasta definir su política. La membresía de comercio es una cuenta comercial en la organización distribuidora, con su inventario/ventas aislados por cliente. No se comparte información automáticamente entre organizaciones; una futura relación entre dos tenants necesita autorización explícita de ambas partes.

## Reversión

No revertir al acceso por perfiles de la demo para solucionar un fallo de Auth. Mantener la portada pública y acceso cerrado mientras se corrige configuración. Los cambios de datos se respaldan en Supabase antes de cualquier migración posterior; estas migraciones son aditivas y no eliminan el catálogo fuente. Las credenciales nunca se incluyen en Git ni en artefactos públicos.
