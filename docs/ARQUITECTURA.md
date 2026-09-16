# SURTIVA — inspección y decisión de arquitectura

Inspección: 16 de septiembre de 2026, antes de implementar persistencia.

## Base verificada

- Carpeta de trabajo: `C:/Users/HP/Downloads/SURTIVA`.
- Repositorio confirmado: `https://github.com/lexrodriguezorg-lang/surtiva`, rama `main`, HEAD observado `68830f7a4fd48278fc0bfcfffe6b172d71c9c186`.
- Producción indicada por el propietario: `https://surtiva-o3hj.vercel.app/`.
- El HTML, los cuatro módulos JavaScript y las dos hojas de estilo públicos coinciden con los archivos locales (comparación del contenido normalizando CRLF).
- La carpeta recibida no incluía `.git` ni vínculo `.vercel`. Se recupera el historial sin sustituir los archivos locales.
- El conector Vercel disponible pertenece a `team_o47X0HA6yrLkFkoRglo0CQNP`, donde solo aparece `agencia-digital-gestion`. SURTIVA no está disponible en ese equipo. No desplegar en ese proyecto ni crear una plataforma distinta por error.

## Arquitectura existente

Aplicación estática sin framework, versión 0.7.0. `index.html` carga `marca.js`, `operacion.js`, `tienda.js` y `arranque.js`. Enrutamiento por hash. El build Node restaura 1.072 fotografías desde dos archivos comprimidos y publica 1.072 productos desde `src/datos/catalogo.json`.

La operación usa un objeto global y `localStorage` (`surtiva.demo.v1`, anteriormente `ruta.demo.v6`). La identidad se elige en pantalla y se almacena en `sessionStorage`; no es autenticación. Hay clientes, vendedores, pedidos, comisiones, inventario y cartera simulados. El catálogo completo se publica en `data/catalogo.js`. No existen base de datos, API, aislamiento de organizaciones ni controles de acceso en servidor. Los comandos check/dev/publicar referencian scripts ausentes.

## Decisión

Conservar JavaScript, los estilos, la identidad, las fotografías, los datos de catálogo y Vercel. Incorporar Supabase Auth y PostgreSQL con Row Level Security (RLS); añadir una API pequeña en Vercel. No es necesario cambiar a Next.js ni añadir un segundo proveedor de identidad.

Supabase integra identidad verificada y políticas PostgreSQL. Referencias oficiales: https://supabase.com/docs/guides/auth y https://supabase.com/docs/guides/database/postgres/row-level-security.

La API mantiene tokens en cookies HttpOnly, Secure en producción y SameSite, valida origen en escrituras y verifica la identidad con Auth. Cada consulta utiliza el token del usuario y un tenant explícito: RLS sigue aplicándose. No se utiliza una clave service_role en peticiones de usuarios. El frontend nunca recibe el catálogo ni el estado completo de otras organizaciones.

## Modelo y límites

- Identidad global: usuario Auth + perfil. Administradores de plataforma en una tabla separada, no en metadatos editables del usuario.
- Organizaciones independientes con membresías aprobadas y rol por organización. Dukes es una organización de tipo distribuidor, marcada como ejemplo.
- Datos operativos con `organization_id` obligatorio y claves foráneas compuestas que impiden referencias a entidades de otros tenants.
- Roles: distribuidor, vendedor, comercio y aliado. El administrador Surtiva consulta la red y aprueba acceso; ningún formulario público puede asignar ese privilegio.
- Vendedor limitado a clientes y pedidos asignados, su seguimiento y comisiones, y catálogo habilitado. Comercio limitado a su cuenta comercial, compras, precios, cartera, inventario y ventas. Aliado limitado al punto de cumplimiento asignado y sus pedidos, compromisos, despachos y registros de conciliación.
- Proveedores separados de distribuidores y usuarios. Productos, inventario, clientes, vendedores, pedidos/líneas/historial, comisiones, puntos de cumplimiento, seguimiento, cartera y ventas locales preparados en tablas propias.
- Solicitud de acceso atómica al registrar identidad, inicialmente pendiente; aprobación transaccional y auditada por administrador Surtiva. Alta no equivale a permiso de entrada.
- Revocar membresía o administrador tiene efecto en las consultas siguientes; no se confía en roles guardados en el navegador.

## Migración y alcance

El catálogo y el escenario original se importan idempotentemente solo al tenant Dukes, con marcas de ejemplo y origen. No se inventan contraseñas ni cuentas Auth para personas ficticias. Los identificadores comerciales se vinculan a usuarios reales únicamente al aprobar acceso. Los datos locales adicionales requieren exportación explícita y validación; no se suben automáticamente como datos confiables.

Los módulos originales se conservan como fuente de migración y referencia, pero el build deja de servir el acceso por selección de perfiles y los datos incrustados. Se reutilizan estilos y componentes visuales para las vistas autenticadas. Los pagos e integraciones externas quedan fuera del alcance.

## Activación y comprobación

Versionar migraciones SQL y probarlas con PostgreSQL embebido, incluidos intentos de lectura/escritura entre tenants y elevación de privilegios. Ejecutar pruebas de API, build y verificación de navegador. Aplicar migraciones a un proyecto Supabase identificado antes de activar producción. Configurar las variables de servidor y el administrador inicial fuera de formularios públicos. No sustituir un backend no disponible por autenticación simulada.

Después de cada bloque registrar build y estado de deployment. Una compilación local o respuesta 200 de la versión antigua no cuenta como deployment de los cambios. La publicación depende de recuperar acceso al proyecto Vercel exacto.
