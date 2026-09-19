# Surtiva: suministro, cobro directo y rentabilidad

## Decisión que cambia la operación

El propietario propone que el comercio pague directamente a Duke y que Duke remunere a Surtiva. Se registra como **propuesta pendiente de acuerdo**, sin fijar porcentajes, aprobar comisiones ni cambiar pedidos existentes. El destinatario del pago, por sí solo, no define quién vende, factura, responde por devoluciones o asume cartera.

Para el piloto se propone acordar expresamente si Duke vende al comercio y paga a Surtiva por las ventas atribuibles a su red. En ese escenario, el volumen vendido por Duke no es ingreso de Surtiva: Surtiva recibe únicamente la remuneración pactada. La red de vendedores y sus liquidaciones pertenecen a Surtiva. Duke no necesita adoptar un ERP nuevo ni administrar ese equipo.

Es distinto del escenario anterior de reventa: Surtiva compra y vende, asume el costo de adquisición y obtiene una diferencia comercial. No sumar ambos ingresos por la misma venta. Un acuerdo por diferencia entre tarifas también requiere definir quién cobra esa diferencia y cuándo la liquida. La decisión de cobro directo no convierte automáticamente la diferencia PACA/comercio en una comisión debida.

El umbral de **120 unidades de la misma referencia** corresponde al precio de compra preferencial de Duke a Surtiva. Sigue documentado para compras que cumplan esa condición. No es mínimo universal del comercio ni prueba de comisión para una operación de venta directa de Duke. Es preciso acordar qué precio y remuneración aplican a pedidos pequeños.

## Recorrido que debe tener Daniela

El portal conserva dos destinos: Mi catálogo y Pedidos de Surtiva. Las tareas se abren donde está el producto o pedido; no se agregan módulos de vendedores, proveedores ni administración privada.

### Catálogo nuevo o actualización

Entrada contextual **Actualizar catálogo** dentro de Mi catálogo. Flujo propuesto, todavía no implementado:

1. Daniela entrega un Excel/CSV exportado de Posgold, PDF o enlace autorizado. Se conserva el original privado, la fecha, la organización y la huella del archivo. Una API disponible debe sustituir este paso manual.
2. Surtiva reconoce referencias, descripción, presentación, categoría, fotos, tarifas y origen de cada campo. Separa tarifa de suministro, tarifa al comercio y existencias. `Paca: 1200` nunca se convierte en stock; ausencia de una referencia no equivale a descontinuarla.
3. La revisión muestra únicamente novedades y diferencias: nuevos productos, cambios, coincidencias y dudas. Los errores de una fila no ocultan el resultado ni se convierten en ceros. No ejecutar macros, fórmulas ni instrucciones incrustadas en documentos.
4. Daniela confirma sus datos de suministro. Surtiva aprueba las condiciones de venta que correspondan. Solo las ofertas validadas pasan a los catálogos autorizados; pedidos aceptados conservan su precio. Cada publicación debe poder auditarse y revertirse.

La revisión se hace sobre referencia + proveedor y presentación, nunca solo por nombre o foto. SKU idéntico de otro proveedor no autoriza fusionarlo. Las imágenes para compradores no deben contener tarifas privadas impresas. Se mantienen las fotografías reales y la versión original de marca.

No añadir un botón que simule esta importación antes de que exista recepción, procesamiento y revisión real. Hoy la ficha permite editar el producto; la carga masiva descrita arriba está pendiente.

### Existencias sin conexión automática

- El estado desconocido permite explorar y solicitar; no significa agotado ni disponible.
- Daniela puede confirmar las cantidades relevantes al recibir un pedido, sin contar mil referencias para empezar. También puede informar o ajustar unidades desde una ficha.
- La fuente y fecha de cada confirmación deben acompañar el dato. Una disponibilidad confirmada hace días no es garantía de stock actual vendido también por otros canales.
- Las reservas de Surtiva se hacen al preparar pedidos aprobados, con control de concurrencia. El despacho consume la reserva. Un pedido propuesto no debe reservar inventario desconocido.
- Los ajustes existentes ya son auditados e idempotentes. Posgold todavía no está conectado. Una futura sincronización debe resolver quién manda sobre el stock y conciliar ventas para no restarlas dos veces.

### Pedidos y atención

| Momento | Responsable propuesto | Resultado que debe verse |
|---|---|---|
| Comercio arma y envía | Comercio / vendedor asignado | Solicitud, cantidades y atribución a la red Surtiva |
| Revisión comercial | Surtiva | Autorizar o pedir ajustes; puede consultar disponibilidad antes de autorizar |
| Disponibilidad y plazo | Duke | Confirmación total/parcial y propuesta de sustituciones |
| Aceptación de cambios | Comercio / Surtiva según el cambio | Nueva versión aceptada, sin sustituciones silenciosas |
| Instrucción de pago | Según acuerdo aprobado | Beneficiario, referencia y monto vigente; no antes de resolver faltantes |
| Verificación del pago | Duke o fuente bancaria autorizada | Cobro confirmado, parcial o pendiente; un comprobante subido no confirma el abono |
| Preparación y despacho | Duke | Reserva, entrega al transportador y referencia de despacho |
| Entrega o novedad | Comercio / Duke | Recepción, diferencia, devolución o cancelación trazable |
| Liquidación de la red | Surtiva y Duke | Base conciliada, remuneración Surtiva y período; reparto interno separado |

Hoy existen revisión, disponibilidad, edición, preparación, despacho y trazabilidad. Se mejoró la identificación visual de estados con texto y color. Falta una bandeja de atención que cuente tareas del destinatario, marque lectura y evite duplicados. No confundir un estado coloreado con un correo, WhatsApp o notificación enviados.

Avisos futuros deben enlazar al pedido preciso: solicitud por autorizar para Surtiva, existencias por confirmar para Duke, cambio que necesita respuesta para el comercio. Priorizar aviso dentro del portal; activar correo u otro canal solo cuando su entrega y preferencia estén implementadas. No inundar a todos por cada cambio de estado.

## Cobro y remuneración: separar tres registros

1. **Pago del comprador a Duke:** pedido, beneficiario, monto esperado, moneda, referencia, evidencia, abonos, verificador, fecha, devolución y saldo. El vendedor no puede marcar unilateralmente pagado.
2. **Liquidación Duke → Surtiva:** acuerdo versionado, base elegible, tarifa/importe, venta atribuida, período, retenciones/deducciones informadas, ajustes, disputa, aprobación y pago efectivo. No calcular una deuda sin acuerdo.
3. **Liquidación Surtiva → vendedor/equipo:** política propia, quién originó/atendió la venta, base y condición de devengo. Acceso privado; Duke y el comercio no reciben los detalles internos.

Definir antes de activarlo: si la base excluye impuestos y flete, si se devenga al cobrar o entregar, efecto de devoluciones y ventas repetidas, asignación del cliente, plazo de liquidación y evidencia aceptada. La facturación y retenciones concretas deben validarse con el responsable contable según el acuerdo elegido. Aquí no se implanta una calificación tributaria ni se realiza ningún pago.

**Bloqueo de negocio pendiente:** el motor heredado todavía usa PACA con factores por cantidad y las comisiones existentes no representan este nuevo modelo. Hay que separar tarifas privadas y precios públicos, y sustituir esa regla con condiciones aprobadas antes de usarla como base de liquidación. Un cambio de colores no resuelve ese problema. No modificar tarifas y cobros automáticamente al cargar un catálogo.

## Rentabilidad por pedido y por zona

Para la propuesta de remuneración por venta directa:

`Contribución por pedido = ingreso pactado de Surtiva − vendedor − atención/preparación/flete asumidos por Surtiva − pérdidas variables esperadas`.

`Resultado operativo mensual antes de impuestos = pedidos completados y remunerables × contribución por pedido − gastos fijos del período`.

Si la contribución es cero o negativa, aumentar pedidos no cubre los gastos fijos. Si es positiva, el equilibrio es el número de pedidos redondeado hacia arriba que cubre esos gastos. Eso no pronostica demanda ni caja: Duke puede liquidar después de que Surtiva haya pagado a su equipo.

Ejemplo exclusivamente ilustrativo, sin porcentajes aprobados: ingreso de Surtiva de $30.000 por pedido, costos variables de $21.000 y gastos fijos de $1.500.000 al mes. Deja $9.000 por pedido; requiere 167 pedidos remunerables para cubrir esos gastos. Con 100 pedidos el resultado es −$600.000; con 200, $300.000 antes de impuestos. No incluye costos omitidos: deben incorporarse antes de decidir una expansión.

Medir una zona piloto antes de replicar: comercios activos y que repiten, pedidos entregados y cobrados, ingreso real de Surtiva por pedido, costo de captar y atender un comercio, tiempo de entrega, devoluciones, puntualidad de liquidación y contribución por ruta/proveedor/vendedor. El retorno de captación se mide con contribución de recompras, no solo ventas brutas. Una nueva ciudad puede agregar costos fijos y cambiar el umbral; no asumir escalabilidad lineal.

## Secuencia propuesta

1. Aplicar ahora la paleta original y estados legibles, conservando el portal corto.
2. Cerrar el acuerdo comercial y corregir separación de tarifas y propiedad de la venta.
3. Importación real con revisión de diferencias; no sustituir esta base por un cargador que publique precios sin control.
4. Capturar una actualización real de Posgold y comprobarla de extremo a extremo; mientras tanto, confirmar por pedido y admitir importación como respaldo.
5. Añadir cobros y liquidaciones conforme al acuerdo, sin procesamiento de pagos automático en esta fase.
6. Expandir cuando una zona demuestre contribución y repetición suficientes.

## Fuente externa verificada

[Planes oficiales de Posgold](https://posgold.com.co/planes-posgold/), consultados en esta revisión: Platino incluye conexiones con API externas y Oro no las anuncia. Esto no acredita el plan contratado por Duke, acceso a su instancia, webhooks ni campos suficientes de inventario. Primero validar plan, documentación y acceso autorizado; no afirmar integración activa ni prometer sincronización en tiempo real sin esa comprobación.
