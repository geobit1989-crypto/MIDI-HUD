# Optimización del Editor — 28/11/2026

Base física aceptada: `59e35b5` (Android 46), Windows/iOS/Web con biblioteca común; Worker desplegado `c28e98e`. Rama independiente para acumular mejoras y validar por Web QA antes de generar nuevas aplicaciones nativas. Primero definir secciones, luego implementar una por una y validar funcionalidad y estética; proteger sincronización, autorización, motor MIDI y LIVE.

## Corrección aprobada: coherencia de repertorios en Ajustes
La función anterior generaba en memoria «Repertorio completo» aunque no existiera en el Editor ni Drive. Se elimina la generación; LIVE y Ajustes muestran únicamente repertorios reales, conservando canciones, orden y listas vacías válidas. No se modifica la biblioteca persistente. Una selección antigua del repertorio virtual se resuelve con el primer repertorio real; una lista real del mismo nombre no se elimina. Pruebas unitarias y de navegador incluidas. Publicación exclusivamente Web QA; compilaciones nativas diferidas hasta finalizar el ciclo. Aceptación física pendiente.
