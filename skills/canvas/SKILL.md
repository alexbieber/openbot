---
name: canvas
description: "Agent-controlled visual canvas: create charts, tables, diagrams, presentations, and markdown docs rendered in the dashboard"
version: 1.0.0
tools:
  - name: canvas_create
    description: Create or replace a canvas
    parameters:
      type: { type: string, enum: [chart, table, markdown, mermaid, html, presentation], description: Canvas type }
      title: { type: string, description: Canvas title }
      content: { type: object, description: "Canvas content (type-specific, see below)" }

  - name: canvas_update
    description: Update the current canvas content
    parameters:
      patch: { type: object, description: Partial update to merge into canvas content }

  - name: canvas_save
    description: Export canvas to file
    parameters:
      format: { type: string, enum: [html, png, pdf, json, md] }
      outputPath: { type: string }

  - name: canvas_clear
    description: Clear the canvas

---

## Canvas Skill

Creates rich visual content in the OpenBot dashboard.

### Chart content
```json
{
  "chartType": "bar|line|pie|doughnut|radar|scatter",
  "labels": ["Jan", "Feb", "Mar"],
  "datasets": [{ "label": "Sales", "data": [100, 200, 150], "color": "#6c63ff" }],
  "options": { "title": "Monthly Sales" }
}
```

### Table content
```json
{
  "headers": ["Name", "Value", "Status"],
  "rows": [["Alice", "100", "ok"], ["Bob", "200", "warn"]],
  "caption": "Data table"
}
```

### Mermaid diagram
```json
{
  "code": "graph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[End]"
}
```

### Presentation
```json
{
  "slides": [
    { "title": "Slide 1", "body": "Content here", "notes": "Speaker notes" }
  ]
}
```
