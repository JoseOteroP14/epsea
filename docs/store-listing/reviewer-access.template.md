# Credenciales para revisores de Google Play

> Copia este archivo a `reviewer-access.local.md`, completa los datos y **no lo subas a git**.
> En Play Console: **Configuración de la app → Acceso a la app**.

## Tipo de acceso

- [x] Todas las funcionalidades requieren inicio de sesión
- [ ] Acceso restringido por invitación
- [ ] Acceso libre

## Credenciales de prueba

| Campo | Valor |
|-------|-------|
| Usuario | `REEMPLAZAR_USUARIO_DEMO` |
| Contraseña | `REEMPLAZAR_CONTRASEÑA_DEMO` |

## Instrucciones para el revisor (español)

1. Abrir la app EPSEA.
2. En la pantalla de inicio de sesión, ingresar el usuario y contraseña anteriores.
3. Pulsar **Ingresar**.
4. Tras el login, la app muestra la pantalla **Inicio** con acceso a **Proyectos** y **Sincronizar**.
5. En **Proyectos** puede abrir un productor y revisar pestañas de visitas y encuestas (solo lectura/edición según permisos del usuario demo).
6. La app requiere conexión a internet al menos una vez para sincronizar catálogos; después funciona parcialmente offline.

## Notas adicionales

- El usuario demo debe existir en el **backend de producción** (`EXPO_PUBLIC_API_URL` del build).
- No usar credenciales reales de extensionistas.
- Si el acceso expira, actualizar la contraseña en Play Console antes de enviar a revisión.
