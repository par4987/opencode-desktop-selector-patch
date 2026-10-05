# opencode-desktop-selector-patch

Ensancha el **selector de modelos** y el diálogo **"Gestionar modelos"** de
[OpenCode Desktop](https://opencode.ai) en Windows, parcheando en sitio el
`resources/app.asar` de la instalación local.

Seis ediciones, todas **conservando el tamaño exacto en bytes**, así que el
archivo sigue siendo un asar válido sin re-empaquetar. Antes de escribir nada se
guarda un backup, y la herramienta se niega a tocar el archivo si el markup ya
no coincide con los patrones esperados.

> Proyecto sin afiliación, aprobación ni soporte de OpenCode. Solo modifica tu
> instalación local; aquí no se redistribuye ningún archivo de OpenCode.

[English](README.md)

---

## Qué cambia

| # | Zona | Antes | Después |
|---|------|-------|---------|
| 1 | Popover del selector | ancho fijo de `284px` | `560px` |
| 2 | Lista del popover | altura fija de `220px` | `60vh` (desplaza con la ventana) |
| 3 | Diálogo "Gestionar modelos" | `size: large` | `size: x-large` |
| 4 | Paneles de ajustes | `scrollbar-width: none` | `scrollbar-width: auto` |
| 5 | Paneles de ajustes | oculta la scrollbar WebKit | regla anulada (se ve la scrollbar nativa) |
| 6 | Nombres de modelo en ajustes | truncados con `…` | salto de línea, nombre completo |

## Por qué

El popover de fábrica es estrecho (apenas entran una docena de nombres cortos) y
la lista tiene altura fija; con ids largos tipo `provider/modelo-variante` los
modelos útiles quedan fuera de vista. El punto 6 lo empeora: los nombres se
cortan antes de que puedas leer qué modelo estás eligiendo.

## Requisitos

- Windows (la detección de la ruta de instalación y la tarea programada
  opcional son específicas de Windows; probado en Windows 11).
- Node.js 16+ solo para *ejecutar* los scripts. OpenCode Desktop no se toca.
- OpenCode Desktop instalado (en la ubicación por defecto, o usa `--asar`).

## Uso rápido

```powershell
git clone https://github.com/par4987/opencode-desktop-selector-patch.git
cd opencode-desktop-selector-patch

node patch-selector.js check      # informa del estado, no escribe nada
node patch-selector.js            # aplica el parche (idempotente)
```

Después **reinicia OpenCode Desktop**. Electron cachea el bundle al arrancar,
así que una instancia abierta sigue con los estilos antiguos hasta que se
reinicia.

Si la app está en una ubicación inusual:

```powershell
node patch-selector.js --asar "D:\Apps\OpenCode\resources\app.asar"
# o
$env:OPENCODE_ASAR = "D:\Apps\OpenCode\resources\app.asar"
node patch-selector.js
```

## Verificar

```powershell
node patch-selector.js check
```

```
Status: APPLIED  (C:\Users\...\resources\app.asar)
asar: 124481279 bytes
  APPLIED  model selector popover width 284px -> 560px  (original=0 patched=1)
  ...
```

| Código de salida | Significado |
|-----------------|-------------|
| `0` | aplicado |
| `2` | hay ediciones pendientes (el parche aún no se aplicó) |
| `3` | los patrones no coinciden con ninguna forma → esta versión cambió el markup |
| `1` | error |

## Opcional: mantenerlo tras las actualizaciones

Una actualización de OpenCode Desktop sustituye `app.asar` por el bundle
original y el parche se pierde. `auto-patch.js` lo vuelve a aplicar y está
pensado para ser silencioso:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-task.ps1          # cada 5 min
powershell -ExecutionPolicy Bypass -File .\install-task.ps1 -EveryMinutes 10
```

- Se ejecuta en el ámbito del **usuario actual**, sin permisos de administrador.
- Escribe log **solo cuando cambia el estado**:
  `%LOCALAPPDATA%\opencode-desktop-selector-patch\logs\auto-patch.log`
- Si algún día cambia el markup, registra `NEEDS-MANUAL`, no toca nada y sale
  con código `3`.

También puedes ejecutarlo a mano cuando quieras: `node auto-patch.js`.

## Desinstalar

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall-task.ps1            # solo la tarea
powershell -ExecutionPolicy Bypass -File .\uninstall-task.ps1 -Restore   # + deshacer el parche
```

`node patch-selector.js restore` también revierte el parche por sí solo (se niega
a escribir si el `app.asar` actual no es el parcheado, así que no puede
machacar una versión más nueva). Borra la carpeta de logs para no dejar rastro.

## Cómo funciona (y por qué es seguro)

`app.asar` es el archivo de Electron que trae la UI compilada. Cada edición
busca una cadena de bytes única y la sobrescribe **en sitio** por otra de
longitud idéntica:

- el tamaño del archivo y los offsets internos no cambian → sigue siendo un
  asar válido, sin re-empaquetar ni metadatos de integridad que regenerar;
- cada patrón debe aparecer **exactamente una vez**; si alguno de los seis no
  coincide, el script aborta *antes* de escribir un solo byte;
- la primera escritura crea `app.asar.orig` y, después de escribir, el archivo
  se vuelve a leer y cada edición se verifica otra vez;
- `restore` solo escribe si el tamaño del backup coincide con el archivo actual.

El punto 3 acorta `manage-models-dialog` a `manage-models-dial` porque
`large` → `x-large` son cinco caracteres menos. El diálogo conserva su clase,
solo con un carácter menos.

## Compatibilidad

Verificado en **2.0.20** y **2.0.22** (Windows 11). El parche es específico de
cada versión por construcción: si una versión futura cambia el markup, las
herramientas lo detectan y se niegan a modificar nada en vez de adivinar.

## Problemas frecuentes

- **"Could not find app.asar automatically"** → usa `--asar` o define
  `OPENCODE_ASAR`.
- **Código de salida 3 / `NEEDS-MANUAL`** → cambió el bundle. Actualiza los
  patrones en `lib/asar-patch.js` (busca en el bundle las clases CSS de la tabla
  de arriba; son cadenas únicas).
- **La UI no cambia** → reinicia Desktop; comprueba
  `node patch-selector.js check`.
- **SmartScreen o el antivirus marcan la tarea** → solo escribe en tu perfil de
  usuario y llama a `node`, igual que al ejecutar los scripts a mano.

## Licencia

MIT (ver `LICENSE`). OpenCode es MIT, Copyright (c) 2025 opencode — este
repositorio solo contiene utilidades que editan tu instalación local, e
incluye ningún archivo fuente ni binario de OpenCode.