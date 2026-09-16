# Gestión maestra y revisión de perfiles

El administrador Surtiva entra directamente a `#red`, sin selector de organización. Consulta el catálogo visual completo, métricas derivadas de pedidos y cartera, clientes, vendedores, seguimiento y proveedores. Los cambios operativos mantienen una organización explícita; el acceso global exige `surtiva_admin` activo.

El catálogo conserva referencias, fotografías y atributos importados de Dukes. Se puede buscar por nombre o SKU, filtrar categoría/proveedor, consultar detalle, editar ficha y preparar pedidos. No se publican productos ni métricas privadas en la portada.

`#perfiles` permite revisar distribuidor, vendedor, comercio y cumplimiento con la misma cuenta maestra. Es una inspección de solo lectura. Cuando existe membresía, el RPC invocador aplica su identidad temporalmente y consulta mediante RLS; restaura la identidad al finalizar y también ante errores. No crea sesiones ni concede membresías. Si no existen usuarios del perfil, se presenta su estado vacío. El distribuidor también puede inspeccionarse por organización.

Prospección y responsables comerciales persisten en Supabase con RLS exclusiva del administrador maestro. Las estimaciones son valores declarados en oportunidades, no predicciones automáticas. Los responsables digitales tienen coordinación manual; no ejecutan agentes externos. El radar prioriza clientes registrados según seguimientos y pedidos, sin simular descubrimiento geográfico.

Validación: pruebas de aislamiento por rol/organización, revisión de perfiles e identidad restaurada, validación de cambios de catálogo, cálculos y escape HTML. Prueba visual local con transporte de prueba y catálogo original; este entorno no sustituye una sesión real de producción. Build y despliegues se verifican por separado.
