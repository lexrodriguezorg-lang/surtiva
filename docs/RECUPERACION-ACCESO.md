# Recuperación de acceso

La cuenta maestra está verificada y activa. Los enlaces reportados devolvieron `otp_expired` en Supabase antes de llegar a la aplicación. No se ha demostrado si la causa fue vencimiento, reutilización o prelectura del correo. Consultar los logs de Auth requiere un scope OAuth que la conexión actual no tiene.

Se conserva la recuperación por enlace y se incorpora entrada manual de código en `/#verificar-recuperacion`. El cliente llama `verifyOtp` con tipo fijo `recovery`; solo una respuesta autenticada permite continuar con `updateUser`. No se leen ni registran códigos, contraseñas o tokens del propietario. Los permisos y RLS se conservan.

## Configuración de Supabase necesaria

En Authentication → Email Templates → Reset password, copiar `supabase/templates/recovery.html` como cuerpo del correo y guardar. Esta configuración de Auth no se aplica mediante migración SQL. El MCP disponible no puede editarla. La plantilla usa `{{ .Token }}` y un enlace estático sin credenciales; abrir ese enlace no consume el código.

Después de guardar, solicitar un correo nuevo desde `/#recuperar`, introducir el código más reciente en Surtiva y elegir una contraseña de al menos 12 caracteres. No reutilizar los correos anteriores. No enviar códigos ni contraseñas por chat.

## Verificación

Prueba con SDK real y transporte simulado: formato de código, rechazo de código vencido sin sesión, tipo recovery fijo, creación de sesión tras código aceptado y actualización de contraseña. La entrega de correo y el ingreso del propietario requieren la plantilla guardada y una prueba del usuario; no se consideran verificados por estas pruebas automatizadas.
