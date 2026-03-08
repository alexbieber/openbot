---
name: color
description: "Convert colors between HEX, RGB, HSL, HSV, CMYK. Generate palettes and check contrast."
version: 1.0.0
tools:
  - name: color
    description: Color format conversion and manipulation
    parameters:
      action:
        type: string
        enum: [convert, palette, contrast, mix, random]
        default: convert
      input:
        type: string
        description: "Color value (e.g. '#ff5733', 'rgb(255,87,51)', 'hsl(11,100%,60%)', 'red')"
      toFormat:
        type: string
        enum: [hex, rgb, hsl, hsv, cmyk, all]
        default: all
      with:
        type: string
        description: Second color for contrast/mix operations
      ratio:
        type: number
        description: Mix ratio 0-1 (default 0.5)
---
