# Modelo de producción — revisión del 16 de septiembre de 2026

Se conserva la aplicación JavaScript y su identidad visual, el catálogo fuente y Vercel `surtiva-o3hj`. El backend elegido por el propietario es Supabase `surtiva-production`, referencia `yirefmallnkgbckrbvrw`. La conexión MCP OAuth está registrada y autenticada con permisos de lectura; esta sesión aún no expone sus herramientas. No se ha inspeccionado ni modificado la base remota.

## Corrección respecto al primer modelo

La primera versión relacionaba comerciantes y aliados con entidades dentro de la organización distribuidora. Ahora cada distribuidor, comercio y aliado tiene su propia organización y membresías. El vendedor pertenece al distribuidor. Una relación comercial explícita conecta distribuidor con comercio o aliado; nunca confiere acceso a los demás datos de la contraparte.

`organizations`, `memberships` y `access_requests` utilizan `pending`, `active`, `suspended`, `rejected`. Los roles son `surtiva_admin`, `distributor_admin`, `seller`, `merchant` y `fulfillment_partner`. El rol global solo existe en la organización de plataforma Surtiva; Dukes es un distribuidor piloto.

La migración evoluciona las tablas existentes: `customers` pasa a `clients`, `order_lines` a `order_items`, `receivables` a `invoices`, `fulfillment_points` a `fulfillment_nodes`. Se añaden ofertas `distributor_products`, relaciones entre organizaciones, invitaciones y planes. Se preservan referencias y datos existentes. Inventario y ventas locales pasan a pertenecer al comercio.

Los pedidos, facturas y despachos se comparten solo con sus participantes. El distribuidor no puede consultar el inventario local ni las ventas del comercio. El aliado solo ve pedidos asignados y sus propios nodos. RLS protege también consultas directas desde el navegador y comprobaciones con identificadores de otras organizaciones.

## Identidad y aprobación

El navegador utiliza Supabase JS, Publishable key y Auth. La API verifica el JWT con Supabase y consulta con ese mismo JWT; RLS sigue vigente. No se entrega una service/secret key al navegador. Las mutaciones comerciales y aprobaciones son funciones transaccionales que comprueban permisos en PostgreSQL.

El registro crea perfil y solicitud pendiente, sin organización ni membresía. La aprobación requiere correo verificado. Las invitaciones se muestran como enlaces para compartir; no se afirma que se haya enviado un correo. La cuenta administradora solicitada es `lexrodriguezorg@mail.com`; se debe vincular únicamente tras verificar su identidad.

## Datos y comprobación

El importador de producción incorpora únicamente Dukes y su catálogo fuente. Existencias desconocidas se mantienen sin confirmar. No importa pedidos ficticios, clientes ficticios, comisiones, saldos o ventas de la demo. El antiguo seed se conserva como fixture para regresiones.

Pruebas: regresiones del modelo anterior, migración de subcuentas, permisos de los cinco roles, estados y revocación, aprobación, invitaciones, separación de dos organizaciones, rechazo de referencias cruzadas y acceso anónimo. La validación remota debe ejecutar las políticas con identidades separadas en el proyecto exacto y registrar resultados sin contraseñas ni tokens.

Los planes se modelan por organización sin cobros ni integraciones de pago. La interfaz muestra datos y vacíos reales, sin tarjetas de funciones simuladas.
