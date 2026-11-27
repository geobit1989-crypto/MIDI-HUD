# Identidad visual MIDI HUD — 26/11/2026

## Decisión y origen
Nombre visible: **MIDI HUD**, sin sufijos de plataforma ni de pruebas. Referencia visual: captura IMG_0399.jpeg aportada por el usuario el 26/11/2026, correspondiente a la versión de cuatro estados casi contiguos. Sustituye el vector Android anterior con separación de 8 unidades. El original generado no está disponible; el SVG es una reconstrucción fiel en geometría, con rellenos planos representativos, no una copia pixel a pixel de la imagen JPEG con gradientes. Fuente editable única: [midi-hud.svg](midi-hud.svg). No rediseñar ni alterar proporciones por plataforma.

## Construcción reproducible
Sistema de coordenadas SVG: viewBox 0 0 108 108, origen superior izquierdo, unidades relativas. Fondo cuadrado a sangre, sin marco ni texto. Cuatro módulos cuadrados de 38,25 × 38,25 unidades, radio circular de esquina 7, separación horizontal y vertical 1,5. Área del conjunto 78 × 78. Márgenes izquierdo/derecho 15; superior 15,5; inferior 14,5 (ligero desplazamiento vertical conservado en la reconstrucción). Para cualquier resolución N, multiplicar las coordenadas por N/108; no estirar.

| Elemento | X | Y | Ancho | Alto | Radio | HEX | RGB |
|---|---:|---:|---:|---:|---:|---|---|
| Fondo | 0 | 0 | 108 | 108 | 0 | #080A16 | 8, 10, 22 |
| Superior izquierdo, activo | 15 | 15,5 | 38,25 | 38,25 | 7 | #305FF3 | 48, 95, 243 |
| Superior derecho, inactivo | 54,75 | 15,5 | 38,25 | 38,25 | 7 | #555136 | 85, 81, 54 |
| Inferior izquierdo, inactivo | 15 | 55,25 | 38,25 | 38,25 | 7 | #534230 | 83, 66, 48 |
| Inferior derecho, inactivo | 54,75 | 55,25 | 38,25 | 38,25 | 7 | #4F2C32 | 79, 44, 50 |

El azul representa el estado activo; los otros tres permanecen atenuados. No añadir letras, texto, sombras, contornos, biseles ni cambiar el orden. Los colores son sRGB representativos: medianas de parches interiores de 41 × 41 píxeles de la captura (709 × 1536) en fondo (110,650), azul (245,626), oliva (463,626), marrón (245,840), burdeos (463,840) fueron respectivamente (8,10,22), (48,95,243), (84,80,54), (83,66,48), (79,44,50); el oliva del SVG se conserva como aproximación de +1 en R y G. El icono no debe incluir la interfaz, esquinas blancas ni botón compartir de la captura.

## Exportación por plataforma
- Windows: generar ICO 16, 24, 32, 48, 64, 128 y 256 px mediante native/windows/prepare_icon.py, antialias 4×4; embebido en el EXE y usado como icono de ventana. MSIX: generar logos reglamentarios a partir de la misma fuente cuando se cree el paquete. No generar otra identidad.
- Android: adaptar el SVG a los recursos launcher/adaptive icon, preservando el área de módulos y verificando la máscara del sistema; evitar doble margen o recorte. El APK anterior aún usa el vector histórico.
- iOS: PNG cuadrado 1024 × 1024 sRGB opaco, fondo completo; dejar a iOS la máscara de esquinas. No incrustar esquinas blancas ni transparencia en el AppIcon.
- Web: favicon SVG y raster PNG si el manifiesto lo necesita, tamaños 192 y 512; revisar máscara y legibilidad.
- Validar visualmente a tamaño real de acceso directo y launcher. El aspecto de la máscara y el antialias pueden variar según el SO. Mantener identificadores internos, canales QA y OAuth independientes del nombre visible.

Estado: iconos Web incorporados en fuente QA. Favicon SVG y apple-touch-icon PNG opaco 180×180. Copias bajo core/brand y beta-v3.4 generadas, no editarlas independientemente. Sin publicar producción.
