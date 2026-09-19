# Portal del distribuidor: operación y posibilidades

El alcance es mejorar el espacio del distribuidor sin convertir su participación piloto en una obligación de trasladar todo su negocio a Surtiva. Su catálogo y pedidos son la operación inmediata; clientes, equipo, seguimiento y otras herramientas existentes deben poder explorarse.

## Implementado

- Inicio propio con fotografías originales del catálogo de la organización, pedidos, próximo paso y responsable, y resumen de existencias. Los valores provienen de `supplier/workspace` y `catalog/browse` con la organización explícita.
- Navegación habitual: Inicio, Catálogo, Pedidos y Existencias. Herramientas permite explorar módulos existentes y añadir o quitar accesos del menú. En móvil se conservan cuatro destinos; Existencias también está en Inicio y Más.
- Colores de MARCA dentro del distribuidor: ciruela para identidad y selección, verde en existencias, coral/naranja y azul en herramientas, amarillo para descubrir posibilidades, crema de base. Logo original sin cambios.
- Catálogo por portadas: dos columnas en móvil, tres en escritorio. Dentro de una colección, ficha grande a una columna en móvil con fuentes de fotografía de alta resolución existentes.
- Ajustes de existencias reutilizan la migración 024: revisión esperada, idempotencia, protección de reservas e historial. El stock desconocido continúa distinto de cero.
- No se reinstala una franja superior de revisión. El administrador regresa a su gestión desde su foto de perfil.

## Configuración y límites

Los accesos del menú se guardan en el navegador por usuario y organización, no como permisos ni como contratación de servicios. La revisión del administrador usa preferencias temporales separadas. Las herramientas solo se muestran cuando el rol ya tiene permiso, y las operaciones continúan sujetas a Auth, API y RLS. No se agregan cobros ni nuevos derechos al fijar un acceso.

El rediseño está delimitado por `.distributor-shell`; no sustituye el catálogo central del administrador, la portada pública ni la experiencia de vendedores o comercios.

La carga masiva de archivos, el conector Posgold, la separación pendiente de costos/precios y los acuerdos de remuneración no forman parte de esta entrega. No se presentan como funciones activas ni se agregan botones sin operación.

## Verificación

- Pruebas de rutas y permisos, aislamiento de preferencias por usuario/organización y revisión, estados del inicio y protección de stock entre organizaciones.
- Navegador con API y PostgreSQL/RLS reales en una base de prueba local: explorar módulos, fijar acceso, recargar, navegar categorías, guardar cantidades y revisar como administrador.
- Build, comprobación de sintaxis y revisión de escritorio y móvil antes de publicar el mismo repositorio en el proyecto Vercel existente.
