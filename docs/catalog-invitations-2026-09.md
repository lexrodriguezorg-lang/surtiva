# Catálogo e incorporación comercial

## Catálogo

El portal consulta `browse_catalog` en páginas de 24 productos. La misma respuesta incluye cantidades, proveedores y fotografías de categorías. PostgreSQL aplica la visibilidad; no se descarga el catálogo completo para filtrar en el navegador. La selección inicial intercala categorías de forma estable. La búsqueda sin tildes consulta todo el catálogo autorizado.

Se conserva la publicación explícita de productos de la migración 017. Publicar una referencia permite verla en los perfiles comerciales aprobados; no comparte clientes, existencias, pedidos ni otra operación privada. Los invitados pendientes solo ven referencias publicadas por la organización que los invitó. No pueden crear pedidos ni consultar información operativa.

Las fotografías se cachean durante un día. Los resultados privados solo se conservan brevemente en memoria de la pestaña, separados por sesión y parámetros. Los cambios invalidan esa memoria. Cotizaciones y precios finales se consultan nuevamente al enviar un pedido.

## Invitaciones

`invitation-auth` se ejecuta en Supabase Edge Functions. La creación exige un JWT válido y los permisos de `create_invitation`. Usa las credenciales administrativas del entorno de Supabase exclusivamente dentro de la función.

Para un correo nuevo crea una identidad de Auth sin contraseña elegida por el usuario y una solicitud pendiente. Intenta enviar el correo mediante Auth. El enlace que puede copiar el administrador reconoce la invitación y permite un intercambio de un solo uso por una sesión real de Auth. El intercambio solo está habilitado para la identidad nueva creada para esa invitación, todavía sin verificar y sin membresías. No puede abrir una cuenta que ya existía. La comprobación y el consumo se serializan en PostgreSQL.

Las personas con cuenta previa reciben un enlace de ingreso por correo y también pueden usar su contraseña. Nunca se les crea otra cuenta ni se entrega su sesión al administrador que las invita. Completar los datos conserva el estado pendiente; solo la aprobación concede organización y membresía.

El callback acepta tanto PKCE como la sesión de los correos administrativos de Supabase, valida la identidad y elimina las credenciales de la URL. La contraseña se puede guardar durante la incorporación o después desde el perfil.

La UI distingue correo aceptado por el servicio de correo y envío fallido. No afirma entrega en la bandeja. Durante la verificación del 17 de septiembre, el proveedor devolvió `over_email_send_rate_limit`: el envío automático necesita resolver la configuración/límite SMTP. El enlace directo sí se verificó con Auth real.

## Verificación

- 39 pruebas automatizadas: permisos, RLS, publicaciones, paginación, invitaciones, aprobación y pedidos.
- Auth real: crear identidad, abrir enlace en móvil, completar nombre, conservar solicitud pendiente, denegar la repetición del intercambio y el acceso a RPC administrativa.
- Callback real de sesión: carga el formulario y retira los tokens de la URL.
- Dos organizaciones de prueba: cada cuenta lee su producto privado y recibe cero productos privados de la otra.
- Catálogo de producción: 1.072 referencias, 10 categorías; respuestas de 24 productos medidas en 287–324 ms desde el equipo de prueba. No es una garantía para todas las redes.
- Navegación visual en móvil de 390 px: categoría, productos, fotografías y formulario sin desbordamientos ni errores de consola.

Los datos y credenciales de QA se mantienen en `.work`, excluidos de Git y Vercel. Las organizaciones de QA se vuelven a suspender al terminar.
