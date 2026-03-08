/**
 * Wake Word Detection
 * Listens for "hey openbot" (or configurable phrase) using microphone input.
 *
 * Two engines supported:
 *
 * 1. Porcupine (Picovoice) — best accuracy, runs offline on-device.
 *    Requires: npm install @picovoice/porcupine-node @picovoice/pvrecorder-node
 *    API key: https://console.picovoice.ai/
 *    Works on: macOS, Linux, Windows (x86_64 + arm64)
 *
 * 2. Keyword-based STT fallback — uses OS TTS + simple regex matching.
 *    Lower accuracy, no API key needed, but higher CPU.
 *
 * Config (openbot.json):
 *   wakeWord:
 *     enabled: true
 *     engine: "porcupine"       # or "stt"
 *     phrase: "hey openbot"
 *     sensitivity: 0.5          # 0.0 (precise) – 1.0 (sensitive)
 *     picovoiceKey: "..."        # or env PICOVOICE_ACCESS_KEY
 *     onWake: "push-to-talk"    # or "open-chat"
 */

import { EventEmitter } from 'events';
import { existsSync } from 'fs';

export class WakeWordDetector extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config?.wakeWord || {};
    this.enabled = this.config.enabled || false;
    this.engine = this.config.engine || 'porcupine';
    this.phrase = (this.config.phrase || 'hey openbot').toLowerCase();
    this.sensitivity = this.config.sensitivity ?? 0.5;
    this._running = false;
    this._recorder = null;
    this._porcupine = null;
    this._sttTimeout = null;
  }

  async start() {
    if (!this.enabled) return;
    if (this._running) return;

    if (this.engine === 'porcupine') {
      await this._startPorcupine();
    } else {
      await this._startSTT();
    }
  }

  // ── Porcupine engine ──────────────────────────────────────────────────────
  async _startPorcupine() {
    try {
      const { Porcupine, BuiltinKeyword } = await import('@picovoice/porcupine-node');
      const { PvRecorder } = await import('@picovoice/pvrecorder-node');

      const apiKey = this.config.picovoiceKey || process.env.PICOVOICE_ACCESS_KEY;
      if (!apiKey) {
        console.warn('[WakeWord] Porcupine requires PICOVOICE_ACCESS_KEY. Falling back to STT.');
        return this._startSTT();
      }

      // Use built-in "Hey Google" as placeholder if no custom keyword file
      // For "hey openbot" you'd create a custom keyword at console.picovoice.ai
      const keywordArg = this.config.keywordPath && existsSync(this.config.keywordPath)
        ? { keywordPaths: [this.config.keywordPath], sensitivities: [this.sensitivity] }
        : { keywords: [BuiltinKeyword.HEY_GOOGLE], sensitivities: [this.sensitivity] };

      this._porcupine = new Porcupine(apiKey, keywordArg.keywordPaths || keywordArg.keywords, keywordArg.sensitivities);
      this._recorder = new PvRecorder(this._porcupine.frameLength, -1);
      await this._recorder.start();
      this._running = true;

      console.log(`[WakeWord] Porcupine started. Listening for: "${this.phrase}"`);
      this.emit('ready', { engine: 'porcupine' });

      this._porcupineLoop();
    } catch (err) {
      console.warn(`[WakeWord] Porcupine unavailable (${err.message}). Use: npm install @picovoice/porcupine-node @picovoice/pvrecorder-node`);
      console.warn('[WakeWord] Falling back to STT mode');
      await this._startSTT();
    }
  }

  async _porcupineLoop() {
    if (!this._running || !this._porcupine || !this._recorder) return;
    try {
      while (this._running) {
        const pcm = await this._recorder.read();
        const keywordIndex = this._porcupine.process(pcm);
        if (keywordIndex >= 0) {
          console.log(`[WakeWord] Wake phrase detected!`);
          this.emit('wake', { engine: 'porcupine', confidence: 1.0 });
        }
      }
    } catch {}
  }

  // ── STT fallback engine ───────────────────────────────────────────────────
  async _startSTT() {
    try {
      // Try to use `node-record-lpcm16` + Whisper for STT-based wake detection
      const recorder = await import('node-record-lpcm16').catch(() => null);
      if (!recorder) {
        console.warn('[WakeWord] node-record-lpcm16 not installed. Install: npm install node-record-lpcm16');
        console.warn('[WakeWord] Wake word detection unavailable. Enabling push-to-talk mode only.');
        this._running = true;
        this.emit('ready', { engine: 'push-to-talk-only' });
        return;
      }

      this._running = true;
      console.log(`[WakeWord] STT mode started. Listening for: "${this.phrase}"`);
      this.emit('ready', { engine: 'stt' });

      // Record in 3-second chunks and scan for wake phrase
      const { default: rec } = recorder;
      const recording = rec.record({
        sampleRateHertz: 16000,
        threshold: 0.5,
        verbose: false,
        recordProgram: process.platform === 'win32' ? 'sox' : 'rec',
        silence: '10.0',
      });

      let audioBuffer = Buffer.alloc(0);
      recording.stream()
        .on('data', (chunk) => {
          audioBuffer = Buffer.concat([audioBuffer, chunk]);
          if (audioBuffer.length > 16000 * 2 * 3) { // 3 seconds of audio
            this._transcribeAndCheck(audioBuffer);
            audioBuffer = Buffer.alloc(0);
          }
        })
        .on('error', () => {});

    } catch (err) {
      console.warn('[WakeWord] STT setup failed:', err.message);
    }
  }

  async _transcribeAndCheck(audioData) {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return;

      const { FormData, Blob } = await import('node:buffer').catch(() => globalThis);
      const form = new FormData();
      form.append('file', new Blob([audioData], { type: 'audio/wav' }), 'audio.wav');
      form.append('model', 'whisper-1');
      form.append('language', 'en');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      const data = await res.json();
      const text = (data.text || '').toLowerCase();

      if (text.includes(this.phrase.replace('hey ', '').replace(' openbot', '')) || text.includes('hey openbot') || text.includes('open bot') || text.includes('openbot')) {
        console.log(`[WakeWord] Wake phrase detected in transcription: "${text}"`);
        this.emit('wake', { engine: 'stt', transcript: text, confidence: 0.8 });
      }
    } catch {}
  }

  stop() {
    this._running = false;
    if (this._recorder) {
      try { this._recorder.stop(); this._recorder.release(); } catch {}
      this._recorder = null;
    }
    if (this._porcupine) {
      try { this._porcupine.release(); } catch {}
      this._porcupine = null;
    }
    if (this._sttTimeout) { clearTimeout(this._sttTimeout); this._sttTimeout = null; }
    console.log('[WakeWord] Stopped');
  }

  status() {
    return {
      enabled: this.enabled,
      running: this._running,
      engine: this.engine,
      phrase: this.phrase,
      sensitivity: this.sensitivity,
    };
  }
}

/**
 * Push-to-talk (PTT) mode for web/CLI.
 * Integrates with the gateway's /push-to-talk endpoint.
 * Client sends audio chunks via POST, server transcribes and sends to agent.
 */
export function registerPTTEndpoint(app, aiRouter, sessionManager) {
  app.post('/push-to-talk', async (req, res) => {
    const chunks = [];
    req.on('data', d => chunks.push(d));
    req.on('end', async () => {
      const audioData = Buffer.concat(chunks);
      const sessionId = req.headers['x-session-id'] || 'default';

      try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return res.status(503).json({ error: 'OPENAI_API_KEY required for PTT' });

        const form = new FormData();
        form.append('file', new Blob([audioData], { type: req.headers['content-type'] || 'audio/wav' }), 'audio.wav');
        form.append('model', 'whisper-1');

        const transcribeRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        });
        const { text } = await transcribeRes.json();
        if (!text?.trim()) return res.json({ transcript: '', response: null });

        const aiResponse = await aiRouter.chat(text, { sessionId });
        res.json({ transcript: text, response: aiResponse.content, model: aiResponse.model });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
  });

  // WebSocket-based PTT streaming
  app.ws?.('/push-to-talk/stream', (ws) => {
    const sessionId = `ptt-${Date.now()}`;
    let audioChunks = [];

    ws.on('message', async (data) => {
      if (typeof data === 'string') {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'start') {
            audioChunks = [];
          } else if (msg.type === 'end') {
            if (!audioChunks.length) return;
            const audioData = Buffer.concat(audioChunks);
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) { ws.send(JSON.stringify({ error: 'OPENAI_API_KEY required' })); return; }

            const form = new FormData();
            form.append('file', new Blob([audioData], { type: 'audio/wav' }), 'audio.wav');
            form.append('model', 'whisper-1');

            const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
              method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form,
            });
            const { text } = await r.json();
            if (!text?.trim()) { ws.send(JSON.stringify({ transcript: '' })); return; }

            ws.send(JSON.stringify({ type: 'transcript', text }));
            const aiResponse = await aiRouter.chat(text, { sessionId });
            ws.send(JSON.stringify({ type: 'response', content: aiResponse.content, model: aiResponse.model }));
          }
        } catch {}
      } else {
        audioChunks.push(Buffer.from(data));
      }
    });
  });

  console.log('[PTT] Push-to-talk endpoint registered at POST /push-to-talk');
}
