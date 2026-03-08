export default {
  name: 'canvas',

  async run({ tool = 'canvas_create', ...params }, { sessionKey, config }) {
    const canvasManager = globalThis._openBotCanvas;
    if (!canvasManager) return { ok: false, error: 'Canvas system not initialized (gateway restart required)' };

    const key = sessionKey || 'default';

    switch (tool) {
      case 'canvas_create': {
        const { type, title, content } = params;
        if (!type || !content) return { ok: false, error: 'type and content required' };
        canvasManager.set(key, { type, title: title || type, content });
        // Broadcast to WebSocket clients
        globalThis._openBotBroadcast?.({ type: 'canvas', sessionKey: key, canvas: canvasManager.get(key) });
        return { ok: true, created: type, title: title || type, sessionKey: key };
      }

      case 'canvas_update': {
        const existing = canvasManager.get(key);
        if (!existing) return { ok: false, error: 'No canvas exists. Use canvas_create first.' };
        const updated = { ...existing, content: { ...existing.content, ...params.patch } };
        canvasManager.set(key, updated);
        globalThis._openBotBroadcast?.({ type: 'canvas', sessionKey: key, canvas: canvasManager.get(key) });
        return { ok: true, updated: true, sessionKey: key };
      }

      case 'canvas_save': {
        const canvas = canvasManager.get(key);
        if (!canvas) return { ok: false, error: 'No canvas to save' };
        const { format = 'json', outputPath } = params;
        const { writeFileSync } = await import('fs');
        const out = outputPath || `canvas-${Date.now()}.${format}`;
        if (format === 'json') {
          writeFileSync(out, JSON.stringify(canvas, null, 2));
        } else if (format === 'md' && canvas.type === 'markdown') {
          writeFileSync(out, canvas.content.markdown || '');
        } else if (format === 'html') {
          writeFileSync(out, renderCanvasHTML(canvas));
        } else {
          return { ok: false, error: `Format ${format} requires a browser. Use canvas_save format=json or html.` };
        }
        return { ok: true, savedTo: out, format };
      }

      case 'canvas_clear': {
        canvasManager.clear(key);
        globalThis._openBotBroadcast?.({ type: 'canvas_clear', sessionKey: key });
        return { ok: true, cleared: true };
      }

      default:
        return { ok: false, error: `Unknown canvas tool: ${tool}` };
    }
  },
};

function renderCanvasHTML(canvas) {
  if (canvas.type === 'chart') {
    const { chartType, labels, datasets, options } = canvas.content;
    return `<!DOCTYPE html><html><head><script src="https://cdn.jsdelivr.net/npm/chart.js"></script></head>
<body><canvas id="c" width="800" height="400"></canvas>
<script>new Chart(document.getElementById('c'),{type:'${chartType||'bar'}',data:{labels:${JSON.stringify(labels)},datasets:${JSON.stringify(datasets.map(d=>({...d,backgroundColor:d.color})))}},options:{plugins:{title:{display:true,text:'${(options?.title||'').replace(/'/g,"\\'")}'}}}});</script></body></html>`;
  }
  if (canvas.type === 'table') {
    const { headers, rows, caption } = canvas.content;
    const ths = (headers || []).map(h => `<th>${h}</th>`).join('');
    const trs = (rows || []).map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
    return `<!DOCTYPE html><html><head><style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px}th{background:#333;color:#fff}</style></head><body><table><caption>${caption||''}</caption><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></body></html>`;
  }
  if (canvas.type === 'markdown') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}</style></head><body><pre>${canvas.content.markdown}</pre></body></html>`;
  }
  if (canvas.type === 'mermaid') {
    return `<!DOCTYPE html><html><head><script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script></head><body><div class="mermaid">${canvas.content.code}</div><script>mermaid.initialize({startOnLoad:true});</script></body></html>`;
  }
  return `<!DOCTYPE html><html><body>${JSON.stringify(canvas.content)}</body></html>`;
}
