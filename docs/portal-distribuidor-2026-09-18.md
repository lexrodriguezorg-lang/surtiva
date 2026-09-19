# Portal comercial del distribuidor

## Experiencia actual

Duke sigue operando en Posgold. Su espacio en Surtiva tiene **Mi catálogo** y **Pedidos de Surtiva**. Entra directamente a las categorías de su propio catálogo. No presenta vendedores, proveedores, finanzas, inventario general ni un panel para administrar su empresa. El administrador maestro conserva sus herramientas globales.

El comercio entra al catálogo y tiene Mis pedidos y Cuenta. El vendedor tiene Catálogo, Comercios, Pedidos y Cuenta; visitas y seguimiento permanecen dentro de Comercios. El aliado conserva pedidos asignados, catálogo habilitado y despachos. La navegación es horizontal en escritorio y de tres o cuatro accesos en móvil. No hay menú lateral en estos perfiles.

Las categorías conservan fotografías reales y fichas grandes. Dentro de la ficha del distribuidor puede consultarse la disponibilidad y abrir un ajuste de cantidad. Los botones +/− guardan una unidad con revisión y clave de reintento. Informar una cantidad es opcional para explorar o solicitar productos; preparar y despachar sí requiere confirmación. No se puede reducir por debajo de las unidades comprometidas. El precio de suministro registrado se muestra sin los escalones de compra del comercio.

No se muestra una franja de revisión. El propietario vuelve a su gestión desde su foto. En revisión puede explorar categorías, agregar referencias, editar cantidades y abrir las acciones del pedido correspondientes al rol; los guardados reales permanecen bloqueados. El aviso aparece dentro del perfil o al intentar guardar, sin ocupar el catálogo. No se crea una identidad ni se comparten contraseñas.

## Datos y permisos

Se reutiliza la migración aplicada `024_supplier_workspace.sql`: inventario con revisión, historial con RLS y ajustes atómicos. `/api/supplier/workspace` y `/api/inventory/adjust` comprueban organización y rol usando el JWT de la persona. No hay migración nueva ni cambios a las existencias reales en esta entrega.

La consulta de catálogo del distribuidor se limita a su organización, incluidas las portadas de categorías. La selección de organización para una persona con varias membresías se conserva dentro de Cuenta. Los datos privados siguen protegidos por las políticas y comprobaciones existentes.

La falta de conteo permanece como desconocida: se puede crear una solicitud sin inventar disponibilidad. Las reservas y el despacho conservan las validaciones de stock, aprobación y confirmación. El carrito permite cambiar cantidades y quitar referencias; la cuenta de un comercio vinculado se selecciona automáticamente cuando solo hay una.

## Verificación

- 52 pruebas automatizadas aprobadas, incluidas solicitudes de vendedor/comercio con stock desconocido, aislamiento entre organizaciones y comparación de las acciones de revisión con los permisos reales de cada rol.
- Build y límites de publicación aprobados.
- Navegador con API real y PostgreSQL aislado; Auth sustituido solo en la herramienta local de QA. Compra de producto sin conteo: selección, cambio a tres unidades, envío y aparición del pedido pendiente de revisión.
- Ajuste de suministro de 120 a 119 guardado; revisión de perfil con selección local y regreso al maestro desde Cuenta.
- Composición visual revisada en escritorio y móvil de 390 px. Logo original sin alteraciones; navegación corta y fotografías grandes.

## Pendientes comerciales y de integración

Esta entrega corrige el alcance del portal. No implementa conexión a Posgold, importación Excel ni la separación definitiva de costos, tarifas B2B y tienda B2C. Las reglas comerciales de precio todavía requieren el trabajo documentado en el análisis; no deben darse por resueltas por este cambio visual.

La integración con Posgold requiere documentación y acceso autorizado a la instancia de Duke. Antes de activarla deben comprobarse referencias, presentaciones, tarifas privadas, fotos, stock físico/vendible, reintentos y autoridad sobre los movimientos. Un ajuste local no debe sobrescribirse silenciosamente ni descontarse dos veces cuando ambos sistemas registren la venta. No se presenta un conector ficticio ni se exige un archivo diario para usar el catálogo.
