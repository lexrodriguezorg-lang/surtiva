# Catálogo por categorías y colaboración de pedidos

## Catálogo
- Las categorías son entradas independientes. La pantalla inicial no descarga ni pinta un listado interminable de productos.
- Portadas y banners eligen fotos después de aplicar las reglas de visibilidad; el orden editorial nunca amplía permisos. Dukes prioriza carros de control remoto y selecciones de belleza, hogar y escolar.
- 1.072 fotos recuperadas de los PDF del usuario, cotejadas contra la miniatura correspondiente. Se sirven versiones ligeras de 384 px y versiones de hasta 960 px mediante `srcset`; el detalle permite abrir la foto grande. No se inventaron productos ni se modificó el logo.
- Una ficha por fila en móvil, dos en tablet y tres en escritorio. Lectura paginada de 24 referencias, búsqueda global, precios por volumen y carrito conservados.
- Los banners se pueden pausar; respetan movimiento reducido, foco y pestaña en segundo plano.

## Pedido compartido
La autorización comercial y la disponibilidad son decisiones independientes. Surtiva puede autorizar primero o pedir disponibilidad antes de autorizar. Enviar al distribuidor significa poner el mismo pedido en su espacio dentro de SURTIVA; no existe integración con un ERP externo.

| Acción | Quién | Resultado |
| --- | --- | --- |
| Preparar selección / editar antes de preparación | Comercio, vendedor asignado, distribuidor o Surtiva | Recalcula precios y comisiones; requiere nueva revisión |
| Consultar disponibilidad | Surtiva | El siguiente turno es del distribuidor |
| Autorizar / solicitar ajustes | Administrador maestro | Registra persona, fecha y decisión |
| Confirmar existencias | Distribuidor o maestro | Registra stock físico confirmado; informa disponibilidad completa o faltantes |
| Asignar responsable | Distribuidor o maestro | Persona activa con acceso al pedido, conservando atribución del vendedor |
| Iniciar preparación | Distribuidor o maestro | Exige autorización y disponibilidad; vuelve a comprobar y reservar stock |
| Despachar | Distribuidor, maestro o aliado asignado | Descuenta stock reservado |
| Confirmar entrega | Comercio, distribuidor o maestro | Registra factura e inventario local sin procesar pagos |

Se conserva el estado físico existente. Pedidos que ya estaban en preparación, despacho o entrega se mantienen operativos; los pedidos pendientes requieren revisión. No se inventan autorizaciones históricas.

Cada modificación usa una revisión esperada para detectar cambios simultáneos. El historial conserva cantidades anteriores y nuevas, comentarios, persona y fecha. La edición invalida autorización/disponibilidad anteriores. No se editan líneas después de reservar stock.

El portal QR permite editar cantidades y retirar referencias del propio pedido antes de preparación. La sesión autenticada permite además buscar y agregar referencias. Un enlace no concede acceso a otro comercio ni a datos internos de inventario.

## Validación
- Pruebas de autorización del maestro, confirmación de distribuidor, edición, cálculo por volumen, comisiones, faltantes, reserva, entrega única y conflictos de revisión.
- Pruebas de lectura/escritura entre dos organizaciones, alcance del aliado y aislamiento de pedidos desde enlaces QR.
- Revisión visual móvil y escritorio, búsqueda, detalle, regreso a categorías y navegación.
- Las verificaciones alojadas usan datos aislados y una transacción revertida; no generan ventas ficticias en la operación.
