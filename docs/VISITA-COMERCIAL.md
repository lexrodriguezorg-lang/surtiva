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

`Marca/Image 2.png` y `Marca/Image 1.png` son originales RGBA con transparencia. Se copian sin modificar bytes a `public/brand/`. Se encuadra el espacio transparente mediante CSS, sin redibujar, recolorear ni deformar. La animación CSS mueve el archivo completo durante 1,6 segundos; respeta movimiento reducido, ahorro de datos y visitas recurrentes. El video adjunto se conserva como referencia y no se carga en la aplicación.

## Alcance operativo

El piloto requiere elegir un distribuidor activo y un responsable real. El propietario puede realizar la visita con atribución a su cuenta sin inventar un vendedor. El alta de usuarios internos sigue el proceso aprobado. No se importan los archivos nuevos de `Catalago PACA` o `Catalogos COMERCIO` en esta fase. Planes, tienda virtual pública, PIN remoto y automatización comercial requieren fases posteriores con reglas explícitas; no se muestran como módulos funcionales ficticios.
