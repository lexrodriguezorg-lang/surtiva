# SURTIVA — activación y operación

## Proyectos verificados

- GitHub: lexrodriguezorg-lang/surtiva.
- Vercel: surtiva-o3hj, ID prj_vwgtk9U2KB6D0Vz1J4F3TG6SNc61.
- Producción: https://surtiva-o3hj.vercel.app
- Supabase: surtiva-production, referencia yirefmallnkgbckrbvrw.

El proyecto Supabase se inspeccionó vacío mediante MCP. Las migraciones 001–015 definen el modelo activo. No repetir archivos ya registrados: las siguientes modificaciones requieren otra migración. OAuth tiene lectura de organizaciones/proyectos y lectura/escritura de base de datos, esta última aprobada expresamente por el propietario.

## Arquitectura activa

Se conserva JavaScript, el diseño y Vercel. src/auth.js usa Supabase JS, Publishable key, Auth y PKCE. La API verifica el JWT con Supabase y consulta como ese usuario. RLS protege también llamadas directas a PostgREST. No hay service key en el cliente ni en endpoints comerciales.

Distribuidores, comercios y aliados tienen organizaciones independientes. Los vendedores pertenecen al distribuidor. Solo se comparten catálogo habilitado, pedidos, facturas y despachos de relaciones autorizadas. Inventario y ventas locales pertenecen al comercio. Surtiva tiene organización de plataforma; Dukes es un distribuidor piloto.

Estados: pending, active, suspended, rejected. Roles: surtiva_admin, distributor_admin, seller, merchant, fulfillment_partner. Los planes se almacenan por organización, sin cobros ni integraciones de pago.

## Configuración y administrador

Vercel Production y Preview usan SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY. /api/config entrega únicamente esos valores públicos. APP_ORIGIN valida escrituras. La CSP permite el proyecto Supabase exacto. .env.local está ignorado por Git.

El propietario confirmó Site URL https://surtiva-o3hj.vercel.app y Redirect URLs https://surtiva-o3hj.vercel.app/** y http://localhost:3000/**.

La cuenta del Administrador maestro elegida es lexrodriguezorg@gmail.com. Se activa desde https://surtiva-o3hj.vercel.app/#activar-administrador, con nombre, correo y contraseña, sin seleccionar organización ni perfil comercial. Un mecanismo privado de un solo uso activa surtiva_admin en la organización Surtiva al confirmar esa dirección. No confía en roles de metadatos ni concede acceso sin verificación. Otro correo no puede obtener autoridad global utilizando ese formulario.

El propietario administra todas las organizaciones y sus operaciones. Daniela corresponde al perfil de distribuidora; no se creó una cuenta a su nombre sin conocer su correo. Aliados no se ofrece en la portada ni como alta pública. Su estructura se conserva para cuando el propietario decida usarla; solo el Administrador maestro puede crear una invitación de aliado y aprobarla. Los distribuidores pueden invitar vendedores y comercios.

No insertar administradores en la antigua tabla platform_admins: la autoridad real es la membresía surtiva_admin en una organización de tipo plataforma. La tabla anterior permanece como compatibilidad histórica.

Mantener verificación de correo. Comprobar entrega real antes de abrir altas externas: el SMTP predeterminado de Supabase solo admite direcciones del equipo y no sirve para registros comerciales generales. SMTP propio requiere un proveedor elegido por el propietario; no se instala una integración externa en esta fase. [Documentación de SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

Después de ingresar como administrador, revisar solicitudes. La aprobación crea o vincula una organización del tipo correcto y activa su membresía. Las invitaciones entregan un enlace para compartir; no envían correos ni conceden acceso automático. El distribuidor asigna vendedores a comercios, habilita catálogo y asigna cumplimiento a pedidos.

## Catálogo conservado

node scripts/migrate-pilot.mjs genera supabase/seed/dukes-pilot.sql. La semilla idempotente incorpora Dukes y 1.072 productos originales. Sus ofertas se crean en distributor_products. El inventario queda sin cantidad confirmada, reservado cero. No crea usuarios, clientes, vendedores, pedidos, cartera ni ventas ficticias. Los precios históricos requieren revisión comercial antes de operar.

**No aplicar supabase/seed/dukes.sql en producción**: conserva la demo únicamente para regresiones del modelo anterior. Los módulos antiguos y los datos de localStorage no se publican ni se importan automáticamente.

## Verificación

Ejecutar npm ci, npm test, npm run build y npm run check.

Las regresiones antiguas usan migraciones 001–005. tests/production-model.test.mjs ejecuta todas: aislamiento, migración de subcuentas, cinco roles, suspensión, aprobación, invitaciones, pedidos compartidos, inventario privado y administrador verificado.

Se crearon dos organizaciones de prueba en Supabase. scripts/test-hosted-isolation.mjs inicia sesión con dos cuentas sintéticas, consulta PostgREST con cada JWT y comprueba datos propios, cero filas ajenas, denegación de administración global y bloqueo de API entre tenants. El informe sin credenciales está en docs/PRUEBA-AISLAMIENTO-REMOTA.json.

Las credenciales de pruebas permanecen solo en .work/hosted-fixture.json, ignorado por Git. scripts/prepare-hosted-tests.mjs prepara el payload, pero no lo aplica automáticamente. Las dos organizaciones quedaron suspendidas al finalizar; se comprobó que ya no leen productos ni tienen membresías efectivas en la API. No se borró la evidencia.

La prueba remota se ejecutó con APP_TEST_URL=https://surtiva-o3hj.vercel.app y node --use-system-ca --env-file=.env.local scripts/test-hosted-isolation.mjs. Para repetirla se deben reactivar expresamente solo las organizaciones marcadas is_test y suspenderlas de nuevo al terminar. Nunca utilizar cuentas comerciales reales para estas pruebas.

Supabase confirmó cero tablas públicas sin RLS. Los avisos SECURITY DEFINER son intencionales: comandos transaccionales que comprueban identidad, rol, estado, tenant y asignación. La tabla privada de activación deniega todo acceso de aplicación y por eso no tiene políticas. Queda como configuración Auth adicional la protección de contraseñas filtradas. [Aviso sobre funciones](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Despliegue y límites

Cada bloque se compila, prueba y publica primero en Preview. Verificar health, login, RLS y rechazo anónimo antes de actualizar main. Ante una incidencia mantener la portada y acceso cerrado; nunca restaurar el selector de perfiles de la demo. Respaldar datos antes de nuevas migraciones. No hay pagos ni integraciones comerciales externas.

El 16 de septiembre de 2026 se publicó la versión 0.9.0 en la URL de producción verificada. La revisión de verificación de correo pasó 21 pruebas automatizadas y build/check. La prueba remota bilateral con Auth real pasó en producción; Vercel confirmó Ready y no devolvió errores de ejecución en la consulta del despliegue. La cuenta lexrodriguezorg@gmail.com quedó verificada y activa como surtiva_admin en Surtiva. El propietario confirmó expresamente sustituir la dirección @mail.com por @gmail.com; la migración 015 activó únicamente la cuenta ya verificada. La entrega observada a este correo no valida el envío general a todas las direcciones; revisar SMTP antes de abrir altas comerciales.

## Enlaces de verificación

El registro conserva el verificador PKCE hasta completar el enlace. El retorno de Auth se procesa al cargar la página y después elimina el código de la URL. Los enlaces inválidos muestran un mensaje y acceso a #confirmar-correo para reenviar la confirmación. Si el correo ya está confirmado, ingresar con contraseña; no volver a registrar la cuenta. La prueba del cliente usa el SDK real contra respuestas simuladas y comprueba criptográficamente que registro y reenvío conservan el verificador correspondiente.
