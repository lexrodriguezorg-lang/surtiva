# SURTIVA: del catálogo a una relación comercial

La propuesta es una operación comercial: proveedores que ofrecen surtido, vendedores que visitan y atienden comercios, y comercios que compran y reponen. La aplicación debe acompañar esa relación. El administrador coordina proveedores, equipo, oportunidades y resultados; no necesita seleccionar una empresa al entrar.

## La visita

Una apertura posible: «Soy de Surtiva. Te ayudo a encontrar productos para surtir tu negocio y a organizar la reposición. ¿Qué categoría vendes más y qué te está haciendo falta?». El vendedor escucha, abre esa categoría, muestra fotografías y precios por cantidad, prepara una selección y acuerda el siguiente paso. No debe prometer existencias, entrega o margen sin confirmación.

Recorrido implementado: catálogo para perfiles aprobados → búsqueda/categoría → ficha grande → cantidades y precios → selección → cliente vinculado → registro del pedido. El modo presentación oculta la navegación administrativa. En móvil hay accesos inferiores a Inicio, Catálogo, Pedidos y Más.

## Corrección del acceso al catálogo

La migración 017 publica explícitamente los productos activos del piloto Dukes. `commercial_catalog` ofrece únicamente campos comerciales seleccionados a cuentas con membresía y organización activas. No expone `source`, inventarios, clientes, cartera, pedidos ni datos internos de otra empresa. La portada sigue sin acceso a datos privados.

Una publicación no crea relaciones comerciales: para ordenar se necesita un comercio vinculado al proveedor y, en el caso del vendedor, asignado a él. Los productos publicados pueden venderse sin habilitarlos uno por uno para cada vendedor o comercio vinculado. Los demás catálogos conservan la asignación anterior hasta que el administrador decida publicarlos. La revisión sin usuario muestra el catálogo publicado, no una colección vacía ni datos operativos ficticios.

## Marca

Referencia: diez láminas PNG recibidas en `export (2).zip`. Azul noche `#0E1B2E`, coral `#F25C3A`, blanco, gris `#6B7280`, línea `#D9DCE1` y crudo `#F4F2EC`. El wordmark es principal y el signo es secundario/favicon. Los SVG de esta implementación son una reconstrucción para web basada en esas láminas, no archivos vectoriales originales. El ZIP no incluye la fuente llamada «Surtiva Display»; se conserva la fuente de interfaz disponible.

## Lo que falta para operar y crecer

1. Dar de alta al distribuidor y vendedores reales, vincular los primeros comercios y asignar responsables. En la auditoría inicial de esta revisión solo estaba activa la cuenta maestra.
2. Confirmar precios, stock y condiciones de entrega del catálogo piloto. Los precios por cantidad actuales conservan la regla existente; no son una nueva negociación con el proveedor.
3. Completar un pedido real de prueba, incluyendo aprobación del comercio, reserva, despacho, entrega y comisión. Revisarlo desde los tres perfiles.
4. Medir visitas, clientes con primera compra, repetición, tiempo de entrega y comisión. Hoy las métricas parten de registros reales, no de proyecciones fabricadas.
5. Incorporar proveedores y automatizaciones una vez que esa operación sea repetible. Los responsables digitales actuales requieren coordinación manual; no ejecutan visitas, mensajes ni ventas autónomas.
