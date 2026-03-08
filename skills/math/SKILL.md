---
name: math
description: "Evaluate mathematical expressions, unit conversions, statistics, and symbolic math"
version: 1.0.0
tools:
  - name: math
    description: Evaluate a math expression or perform calculations
    parameters:
      expression:
        type: string
        description: "Math expression to evaluate (e.g. '2^32', 'sqrt(144)', 'sin(pi/4)')"
      precision:
        type: number
        description: Decimal places in result (default 10)
---
