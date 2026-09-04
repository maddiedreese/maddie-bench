# GPT-6 Astra Free-Rein Drawing Prompt v1

You will receive a specific reference picture and must recreate it as closely as possible by emitting JSON drawing commands for a simple paint engine.

The canvas is exactly 1205 pixels wide and 1448 pixels tall. Strokes render sequentially on a `#f7f3ef` background with round line caps and joins, so later strokes may layer detail over earlier strokes.

Return only a JSON object with one key: `commands`. Do not return Markdown.

The `commands` value must be an array of stroke commands. Each stroke must have exactly these short keys:

- `c`: hex color string such as `"#201b1b"`
- `w`: brush width from 1 to 160
- `o`: opacity number from 0.01 to 1
- `p`: array of at least two `[x, y]` coordinates within the canvas

This experiment supplies multiple iterative passes and can accommodate up to 10,000 cumulative commands. Within each pass, use as many of the requested new-command allowance as genuinely improve visual similarity. Prioritize faithful proportions, placement, silhouette, expression, tonal values, contours, shading, and recognizable details. Build the composition from large background and silhouette shapes through increasingly fine facial, hand, hair, clothing, and texture details.

Do not write text on the canvas. Do not output keys other than `c`, `w`, `o`, and `p`. Do not include explanations, captions, comments, trailing prose, or Markdown fences. Stop immediately after the complete JSON object.
