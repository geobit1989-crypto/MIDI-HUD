# MIDI HUD — Registro de ramas y numeración global

**Estado:** convención aprobada; renombrado remoto pendiente para proteger los PR abiertos.
**Fecha de registro:** 19/10/2026.
**Rama de trabajo única:** `integration/ios-unified-20261019` (versión asignada **v6**).

## Convención

`descripcion-DDMMAA-vN`

- La descripción indica la fase principal, no un módulo obligatorio.
- `DDMMAA` representa la fecha **original de creación** de la rama y no cambia al renombrarla.
- `vN` es un consecutivo **global** para MIDI HUD: no se reinicia cada día.
- Un commit y un renombrado **no crean una nueva versión**. El contador aumenta solo al crear una rama genuinamente nueva.
- Se conserva una única rama activa; las anteriores son referencia/respaldo.
- `main` y `gh-pages` quedan fuera de la numeración y no se renombrarán.
- No se renombrarán por copia + eliminación de referencias: eso podría cerrar PR y duplicar ramas.

## Registro inicial de las 6 ramas auxiliares visibles

La numeración se ha establecido retrospectivamente según las fechas de trabajo que constan en nombres y commits. Git no registra una fecha de creación de rama fiable; antes del renombrado efectivo se verificará cualquier fecha ambigua.

| Versión asignada | Rama existente (sin renombrar) | Nombre de destino propuesto | Estado |
| --- | --- | --- | --- |
| v1 | `feature/motor-midi-v1-20261014` | `feature/motor-midi-141026-v1` | Histórico; PR #1 abierto |
| v2 | `backup/ble-midi-compat-before-20261015` | `backup/ble-midi-compat-151026-v2` *(fecha de creación a confirmar)* | Respaldo |
| v3 | `feature/ios-drive-sync-20261016` | `feature/ios-drive-sync-161026-v3` | Histórico; PR #2 abierto; base del PR #4 |
| v4 | `feature/catalog-repertoires-20261018` | `feature/catalog-repertoires-181026-v4` | Histórico |
| v5 | `feature/catalog-playlists-current-20261018` | `feature/catalog-playlists-181026-v5` | Histórico; PR #3 abierto |
| v6 | `integration/ios-unified-20261019` | `integration/ios-unified-191026-v6` | Única rama activa; PR #4 abierto |

## Condición para renombrar

Según GitHub Docs, renombrar una rama que es **head** de un PR abierto lo cierra. Por ello **no ejecutar renombrados de las ramas v1/v3/v5/v6 mientras sus PR permanezcan abiertos**, y no crear ramas clonadas como sustitución: se evita perder continuidad del trabajo y disparar nuevos despliegues.

Antes de renombrar la rama activa: cerrar o resolver PR #4 de forma deliberada, comprobar el PR #2 (base), detener integraciones activas, y preparar la actualización de `windows/preparar-midi-hud.ps1`, referencias de documentación y cualquier configuración de CI que nombre literalmente la rama. Después verificar que el SHA del commit de cada rama se mantiene.

Esta asignación inicial **no implica que ya existan los nombres de destino en GitHub**. La próxima rama realmente nueva tendrá el siguiente consecutivo aún no utilizado, inicialmente `v7`, salvo que aparezcan ramas históricas omitidas en la auditoría.
