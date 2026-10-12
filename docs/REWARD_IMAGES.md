# Miniaturas del catálogo

Generadas con la herramienta integrada `imagegen`. Son imágenes ilustrativas de los premios
de demostración; no son fotos de los locales ni garantizan una presentación particular.
Archivos finales WebP de 768 × 768 en `public/rewards/`, mostrados a 72 × 72 px.
Al tocar la miniatura se abre la imagen ampliada en una hoja superpuesta, con
cierre, bloqueo del fondo y restauración del foco al volver al catálogo.
Las fotos se guardan en `PlatformReward.imageUrl`; la migración no reemplaza fotos existentes.

## Prompts utilizados

Prompt común, reemplazando `{subject}` por cada tema de abajo:

```text
Use case: photorealistic-natural. Generate one square photographic asset for a small mobile rewards catalog thumbnail. Subject: {subject}. Close-up centered still life, warm soft natural window light, realistic textures, simple dark wood tabletop, uncluttered softly blurred background, entire subject visible with generous margins so a square crop is safe. Premium but friendly local business aesthetic. No text, no logos, no watermark, no people. This is a standalone project image, not a screenshot or UI mockup.
```

| Archivo | Subject |
| --- | --- |
| `public/rewards/coffee.webp` | a single ceramic cup of cappuccino with delicate latte art on a saucer, neighborhood cafe |
| `public/rewards/dessert.webp` | a small elegant individual chocolate cake dessert on a ceramic plate, neighborhood bistro |
| `public/rewards/breakfast.webp` | a simple breakfast of two golden medialuna pastries and a cup of coffee, neighborhood cafe |
| `public/rewards/birthday.webp` | a small birthday gift wrapped in kraft paper with a muted purple ribbon, a modest neighborhood shop gift |
