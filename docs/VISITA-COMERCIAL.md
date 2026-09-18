# Fase de visita comercial — inspección y decisiones

Rama: `codex/visita-comercial`. Esta fase se entrega en preview antes de promover a producción.

## Estado inspeccionado

Frontend JavaScript/esbuild, API Vercel y Supabase Auth/PostgreSQL con RLS. Migraciones 001–017 existentes. Se conservan precios, productos, pedidos, asignaciones, comisiones e invitaciones. Producción contiene 1.072 productos de Dukes, cero clientes, ninguna membresía de vendedor activa y una invitación suspendida. Los dos vendedores existentes pertenecen a organizaciones de prueba suspendidas. No representan un equipo comercial real.

El catálogo aprobado ya existe, pero no el acceso de un prospecto sin cuenta. Crear una membresía o reutilizar la sesión del vendedor para un QR daría más acceso del necesario.

## Decisión

Migración aditiva 018: datos de contacto/intereses en clientes, accesos comerciales revocables y cotizaciones breves para preservar el precio visto. Cada preregistro crea un tenant comercio pendiente, una relación comercial activa y un cliente del distribuidor. No crea usuario Auth, membresía ni aprobación administrativa. El tenant pendiente admite únicamente la capacidad comercial explícita del enlace; la administración sigue cerrada.

Los tokens tienen entropía criptográfica, se guardan solo como SHA-256 y se entregan una vez. El enlace usa `/c/#token`: el fragmento no viaja en logs de URL ni Referer. El portal es un bundle separado sin navegación administrativa. Las RPC públicas verifican la capacidad, estado de organización, cliente, relación y responsable antes de retornar una proyección explícita. Las tablas privadas conservan RLS y no son legibles por anon. Revocar un enlace o suspender su organización/cliente impide catálogo y pedidos.

Se conserva la regla comercial existente de precios por cantidad (migración 008); nunca se devuelve el campo de precio base/paca, costos, margen o comisión. La cotización calcula en servidor y guarda las líneas mostradas durante diez minutos. Enviar requiere esa cotización y una clave de idempotencia; el cliente no elige tenant, vendedor, precio ni estado. No se garantiza inventario: si no está confirmado se dice «Por confirmar».

Categorías e intereses se basan en productos habilitados. Reponer y repetir se basan en compras propias. No se inventan ofertas, temporadas, disponibilidad, recomendaciones de IA ni métricas. Compartir por WhatsApp abre la aplicación del usuario con un texto preparado, sin API ni envío automático.

## Marca

`Marca/Image 2.png` y `Marca/Image 1.png` son originales RGBA con transparencia. Se copian sin modificar bytes a `public/brand/`. Se encuadra el espacio transparente mediante CSS, sin redibujar, recolorear ni deformar. Por indicación posterior del propietario, la apertura reproduce el video original completo (6,04 s; 422.679 bytes), sin modificarlo. Es omitible desde el inicio, se reproduce una vez por sesión y se salta automáticamente con movimiento reducido o ahorro de datos. Un fallo de reproducción o carga no bloquea el acceso. Los enlaces de Auth y la navegación interna no reproducen la apertura. Se puede volver a ver desde la portada.

## Alcance operativo

El piloto requiere elegir un distribuidor activo y un responsable real. El propietario puede realizar la visita con atribución a su cuenta sin inventar un vendedor. El alta de usuarios internos sigue el proceso aprobado. No se importan los archivos nuevos de `Catalago PACA` o `Catalogos COMERCIO` en esta fase. Planes, tienda virtual pública, PIN remoto y automatización comercial requieren fases posteriores con reglas explícitas; no se muestran como módulos funcionales ficticios.

## Verificación y entorno de revisión

- 018 aplicada como `20260918015050_commercial_visits`; 019 añade relevancia por intereses y búsqueda sin tildes. RLS comprobada en las tablas nuevas.
- Flujo local de navegador sobre API real y PostgreSQL aislado: vendedor → cuatro campos → QR → portal sin login → tres unidades → cotización → pedido recibido → visible al vendedor. Auth se sustituye únicamente en el servidor local de pruebas, nunca en archivos desplegados.
- Pruebas de tokens entre organizaciones y entre comercios del mismo distribuidor; cotización ajena, expiración, revocación, suspensión, precio conservado, idempotencia y atribución. Las consultas privadas anónimas continúan denegadas.
- Arte original comprobado por SHA-256: las dos copias publicadas son idénticas a `Marca/Image 1.png` y `Marca/Image 2.png`.
- El preview usa el mismo proyecto Supabase con organizaciones explícitamente marcadas `is_test`. En Visitas comerciales, el administrador trabaja únicamente con esas organizaciones. La API bloquea preregistros de organizaciones reales en preview y el resto de escrituras administrativas. En producción este límite de revisión no aplica.
- Dos organizaciones de revisión contienen copias del catálogo para comprobar el flujo sin generar ventas de Dukes. Sus enlaces de prueba caducan en siete días. No hay nuevas cuentas Auth ni membresías privilegiadas para las pruebas.
- La pantalla del vendedor consulta cambios de pedidos en segundo plano cada 20 segundos; actualiza únicamente si cambian los datos, sin interrumpir un formulario o diálogo. No depende de una integración de mensajería.
- Para la tablet, un PIN local permite volver al espacio del vendedor. Es una barrera de interfaz en ese dispositivo, no sustituye Auth ni protege contra alguien con control del navegador. El portal en el teléfono del cliente no contiene sesión ni código de administración.

La tienda virtual para ventas del comercio, los planes/módulos adicionales, campañas y PIN remoto no forman parte de este piloto. Las ofertas y alertas de reposición no se fabrican: necesitan condiciones comerciales o compras registradas. Antes de operar con clientes reales hay que confirmar precios, existencias, entrega y responsable con el piloto.

## Revisión de identidad y publicación

La portada anterior se sustituye por una entrada visual con el wordmark sobre el fondo claro de marca, sin pastilla blanca ni redibujo. El mensaje «Más surtido. Más negocio.» acompaña fotografías existentes del catálogo, sin precios ni datos privados. Los perfiles comercio, vendedor y distribuidor ajustan la invitación y preseleccionan el formulario real. Las categorías cambian la fotografía; no simulan un catálogo público con acceso a precios. El ingreso, la navegación interna y la cabecera del portal comercial comparten la nueva identidad.

El pedido posterior del propietario solicita que esta corrección sí se publique en la web real. Se comprueban build, permisos, video, vistas móviles y el flujo comercial antes del despliegue de producción. No se cambian precios ni se importan nuevos catálogos.
