# Assets para Google Play Console

Coloca aquí los gráficos que **no** genera EAS automáticamente.

## Estructura

```
store-assets/
├── feature-graphic.png      # 1024 × 500 px (obligatorio)
├── icon-512.png             # 512 × 512 px (opcional; ya existe assets/images/Epsea.png)
└── screenshots/
    └── phone/
        ├── 01-login.png
        ├── 02-home.png
        ├── 03-producers.png
        └── 04-sync.png
```

## Especificaciones

| Asset | Tamaño | Formato | Notas |
|-------|--------|---------|-------|
| Feature graphic | 1024 × 500 | PNG o JPG | Banner de la ficha en Play Store |
| Icono de tienda | 512 × 512 | PNG 32-bit | Sin transparencia; puedes exportar desde `assets/images/Epsea.png` |
| Capturas teléfono | Mín. 320 px lado corto | PNG o JPG | Mínimo **2**, recomendado **4–8** |
| Capturas tablet 7" | 1024 × 600 min | PNG o JPG | Solo si declaras soporte tablet |
| Capturas tablet 10" | 1280 × 800 min | PNG o JPG | Solo si declaras soporte tablet |

## Cómo tomar capturas

1. Instala el APK/AAB en un dispositivo o emulador Android.
2. Pantallas sugeridas:
   - Login
   - Inicio / dashboard
   - Lista de productores o detalle de visita
   - Pantalla de sincronización
3. En emulador: botón de cámara en la barra lateral, o `adb exec-out screencap -p > store-assets/screenshots/phone/01-login.png`

## Feature graphic

Puede incluir logo EPSEA + texto "Extensionistas · Visitas · Sincronización offline".
Herramientas: Figma, Canva, o exportar desde diseño institucional UniCórdoba.

## Validación

```bash
bun run validate:release
```

Este script avisa si faltan capturas o el feature graphic.
