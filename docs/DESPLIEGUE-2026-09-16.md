# Publicación multiempresa

Proyecto conservado: `surtiva-o3hj`, repositorio `lexrodriguezorg-lang/surtiva`, backend `surtiva-production`.

| Bloque | Commit | Preview verificado |
| --- | --- | --- |
| Organizaciones independientes y aprobación | `cf4e81a` | `surtiva-o3hj-o7gel9nkh-lexrodriguezorg-4994s-projects.vercel.app` |
| Supabase Auth, espacios reales y catálogo piloto | `ed2b042` | `surtiva-o3hj-m91o6jdk7-lexrodriguezorg-4994s-projects.vercel.app` |
| Evidencia RLS remota y recuperación de sesión | `c4728fb` | `surtiva-o3hj-qktwyv7ef-lexrodriguezorg-4994s-projects.vercel.app` |

Los tres bloques pasaron compilación y comprobación; sus despliegues alcanzaron Ready. El último ejecutó 17 pruebas, todas correctas.

Producción verificada: https://surtiva-o3hj.vercel.app, versión 0.9.0, commit de aplicación `c4728fb`, despliegue `dpl_AamHfAL5pd5G5B8DnLN5o8iHBBBe`, duración 19 segundos, JavaScript estático con función Node API. La consulta de errores del despliegue no devolvió registros. No se configuraron servicios externos de monitorización.

La portada, formulario y rechazo de una sesión revocada se verificaron en navegador; el espacio de distribuidor y la invitación persistida se comprobaron contra Supabase, incluido tamaño móvil de 390 píxeles. La prueba automatizada remota cubrió la API de producción y acceso directo PostgREST con dos JWT distintos: datos propios permitidos, datos y modificaciones ajenas bloqueados, administración global denegada. El informe está en `PRUEBA-AISLAMIENTO-REMOTA.json`. Después se suspendieron las dos organizaciones y se verificó la revocación efectiva.

Se aplicaron las migraciones 001–013 y solo el seed `dukes-pilot.sql`: 1.072 productos, sin pedidos ni clientes ficticios, cero tablas públicas sin RLS. No se desplegaron pagos ni otras integraciones comerciales.

Pendientes que requieren al propietario: registrarse y confirmar `lexrodriguezorg@mail.com`, comprobar recepción del correo de Auth y configurar SMTP propio antes de abrir registros generales si el proyecto conserva el envío predeterminado de Supabase. Las URLs de Auth ya fueron confirmadas por el propietario.
