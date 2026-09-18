# Portal operativo del distribuidor

## Alcance implementado

El distribuidor entra a Mi operación: pedidos en curso con su siguiente paso, solicitudes de disponibilidad, preparación, despachos y existencias por confirmar. Inventario es una pantalla propia y un acceso directo móvil. El propietario puede revisarla desde Revisar perfiles o gestionar una organización desde Organizaciones, conservando la diferencia entre revisión de solo lectura y edición.

La búsqueda consulta todo el inventario de la organización en servidor, con páginas de 24 referencias y filtros por estado. Ya no descarga el catálogo completo para poner nombre a cada fila. Las fichas muestran fotografía, referencia, físico, comprometido, disponible y fecha del último movimiento registrado. Desconocido no significa cero. La imagen conserva la fotografía del catálogo; no implica inventario confirmado.

Los botones +/− ajustan una unidad con control de versión y una clave de reintento. El conteo directo permite confirmar o corregir una cantidad. No se puede bajar del stock comprometido ni restar sobre una cantidad desconocida. Los cambios, reservas y despachos generan un historial con usuario, fecha y cantidades anteriores/nuevas. Los eventos históricos anteriores a esta migración no se inventan.

La preparación y el despacho siguen el flujo existente de pedidos y actualizan el mismo inventario. El portal consulta cambios cada 30 segundos mientras está visible; conserva la pantalla durante la consulta y evita refrescar al escribir o abrir un diálogo. Esto no es una conexión en tiempo real con Posgold.

## Cambios técnicos

- Migración `024_supplier_workspace.sql`: revisión/fecha de inventario, movimientos y comandos con RLS; RPC de consulta privada y ajuste atómico.
- API `/api/supplier/workspace` y `/api/inventory/adjust`: organización y rol comprobados tanto en servidor como en PostgreSQL; usa el JWT de la persona, sin claves administrativas en navegador.
- `src/supplier-workspace.js` y `src/supplier.css`: vista operativa, búsqueda, ajustes y movimientos; integración con la navegación y revisión de perfiles existentes.
- La nueva consulta no proyecta precios ni costos. No modifica las tarifas existentes ni resuelve todavía los cambios de precios, red comercial o B2C documentados en el análisis comercial.

## Verificación

- 49 pruebas automatizadas aprobadas: aislamiento de dos organizaciones, rechazo de vendedor/comercio, reintentos sin doble descuento, conflicto entre versiones, mínimos de reservado, historial y reserva/despacho automáticos.
- Build y límites de publicación aprobados.
- Navegador contra API real y PostgreSQL local aislado; Auth sustituido únicamente en la herramienta local de QA. Búsqueda de referencia y ajuste de 120 a 119 comprobados. No se alteraron existencias reales para esta prueba.
- Escritorio y móvil a 390 px, búsqueda y botones accesibles, sin desbordamiento horizontal. Navegación móvil con cinco accesos, incluido Inventario; los movimientos se abren también en móvil.
- Migración aplicada en `surtiva-production`; lectura con rol autenticado y contexto del administrador comprobó 1.072 referencias de Duke con existencias desconocidas. No se convirtieron en disponibles ni agotadas.

## Automatización externa pendiente

El objetivo es recibir cambios desde Posgold sin pedir un documento diario. Todavía faltan documentación vigente, autorización y acceso de lectura a la instancia de Duke; no se han recibido ni usado credenciales de Posgold. No se implementó un conector ficticio, un calendario sin fuente ni un botón que simule conexión.

Antes de activarlo: verificar referencias/presentaciones, stock físico versus vendible, tarifas privadas, fotos y fechas; probar un cambio real desde Posgold y su recepción; comprobar reintentos, eventos fuera de orden, desconexión y separación por organización. Resolver la autoridad del stock y reservas para no descontar una venta dos veces si ambos sistemas la registran. Cuando Posgold sea la fuente, una corrección local necesita conciliación explícita y no puede ser sobrescrita silenciosamente por el siguiente corte.

Excel queda como alternativa por implementar con vista previa y conciliación, no como proceso diario decidido ni como funcionalidad ya disponible. La falta de acceso a Posgold todavía no demuestra que la integración sea inviable. La separación definitiva de costos y ofertas comerciales es un requisito previo a sincronizar tarifas del proveedor.
