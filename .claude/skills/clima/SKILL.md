---
name: clima
description: Obtiene el clima actual y pronóstico de la ubicación local del usuario (o una ciudad indicada). Usar cuando pregunte por el clima, temperatura, lluvia, pronóstico o "cómo está el tiempo".
allowed-tools: Bash(curl *)
---

# Clima local

Consulta el clima con wttr.in (sin API key). Sin ciudad, detecta ubicación por IP.

## Pasos

1. Ciudad = argumento del usuario si lo dio, si no vacío (autodetección por IP).
2. Ejecutar (reemplazar `CIUDAD`, espacios como `+`):

```bash
curl -s "https://wttr.in/CIUDAD?format=j1&lang=es"
```

3. Si falla o devuelve HTML/vacío, reintentar una vez; si persiste, avisar que no hay conexión o servicio caído. No inventar datos.
4. Parsear el JSON:
   - Ubicación: `nearest_area[0].areaName[0].value` + `country[0].value`
   - Ahora: `current_condition[0]` → `temp_C`, `FeelsLikeC`, `humidity`, `windspeedKmph`, `winddir16Point`, `precipMM`, `lang_es[0].value` (descripción)
   - Pronóstico: `weather[0..2]` → `date`, `mintempC`, `maxtempC`, `hourly[*].chanceofrain` (máx)

## Formato de respuesta

Español, conciso. Ejemplo:

```
📍 Ciudad, País
Ahora: 24°C (sensación 26°C), Parcialmente nublado
Humedad 60% · Viento 10 km/h NE · Lluvia 0 mm
Hoy: 18–27°C, lluvia 20%
Mañana: 17–26°C, lluvia 40%
Pasado: 19–28°C, lluvia 10%
```

Añadir una línea de consejo solo si aplica (paraguas si lluvia >50%, etc.).

## Notas

- Unidades métricas (°C, km/h, mm).
- La ubicación por IP puede ser aproximada; si es incorrecta, pedir la ciudad.
