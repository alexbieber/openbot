import { writeFileSync, existsSync, createReadStream } from 'fs';
import { execSync, exec } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

function tmpFile(ext) { return join(tmpdir(), `openbot-voice-${randomBytes(6).toString('hex')}.${ext}`); }

// ── TTS ───────────────────────────────────────────────────────────────────────
async function ttsElevenLabs({ text, voice = 'Rachel', outputPath, speed = 1.0 }) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY not set');

  // Resolve voice ID vs name
  let voiceId = voice;
  if (!/^[a-zA-Z0-9]{20,}$/.test(voice)) {
    // Look up voice ID by name
    const voicesRes = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': key },
    });
    const { voices } = await voicesRes.json();
    const found = voices?.find(v => v.name.toLowerCase() === voice.toLowerCase());
    if (found) voiceId = found.voice_id;
    else voiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel default ID
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.8, speed },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs error: ${res.status} ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const path = outputPath || tmpFile('mp3');
  writeFileSync(path, buf);
  return path;
}

async function ttsOpenAI({ text, voice = 'nova', outputPath, speed = 1.0 }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'tts-1', input: text, voice, speed }),
  });
  if (!res.ok) throw new Error(`OpenAI TTS error: ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const path = outputPath || tmpFile('mp3');
  writeFileSync(path, buf);
  return path;
}

function ttsSystem({ text, outputPath }) {
  const platform = process.platform;
  if (outputPath) {
    if (platform === 'darwin') execSync(`say -o "${outputPath}" "${text.replace(/"/g, '\\"')}"`);
    else if (platform === 'linux') execSync(`espeak "${text.replace(/"/g, '\\"')}" -w "${outputPath}"`);
    else execSync(`powershell -c "Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${outputPath}'); $s.Speak('${text.replace(/'/g, "''")}'); $s.SetOutputToDefaultAudioDevice()"`);
    return outputPath;
  }
  if (platform === 'darwin') execSync(`say "${text.replace(/"/g, '\\"')}"`);
  else if (platform === 'linux') execSync(`espeak "${text.replace(/"/g, '\\"')}"`);
  else execSync(`powershell -c "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${text.replace(/'/g, "''")}')"`);
  return null;
}

function playAudio(filePath) {
  const platform = process.platform;
  try {
    if (platform === 'darwin') execSync(`afplay "${filePath}"`);
    else if (platform === 'linux') execSync(`aplay "${filePath}" 2>/dev/null || mpg123 "${filePath}" 2>/dev/null || paplay "${filePath}" 2>/dev/null`);
    else execSync(`powershell -c "(New-Object System.Media.SoundPlayer '${filePath}').PlaySync()"`);
  } catch {}
}

// ── STT ───────────────────────────────────────────────────────────────────────
async function sttOpenAI({ audioPath, language, prompt }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const formData = new FormData();
  const { Blob } = await import('buffer');
  const data = (await import('fs')).readFileSync(audioPath);
  formData.append('file', new Blob([data]), audioPath.split('/').pop());
  formData.append('model', 'whisper-1');
  if (language && language !== 'auto') formData.append('language', language);
  if (prompt) formData.append('prompt', prompt);
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: formData,
  });
  if (!res.ok) throw new Error(`Whisper error: ${await res.text()}`);
  const json = await res.json();
  return json.text;
}

export default {
  name: 'voice',

  async run({ tool = 'tts', ...params }) {
    switch (tool) {
      case 'tts': {
        const { text, provider = 'elevenlabs', voice, outputPath, speed = 1.0, language } = params;
        if (!text) return { ok: false, error: 'text required' };
        let filePath = null;
        try {
          if (provider === 'elevenlabs') filePath = await ttsElevenLabs({ text, voice, outputPath, speed });
          else if (provider === 'openai') filePath = await ttsOpenAI({ text, voice, outputPath, speed });
          else filePath = ttsSystem({ text, outputPath });

          // Auto-play if no outputPath requested
          if (!outputPath && filePath) {
            playAudio(filePath);
          }
          return { ok: true, provider, savedTo: outputPath || null, played: !outputPath, chars: text.length };
        } catch (err) {
          // Fallback chain
          if (provider === 'elevenlabs') {
            try { filePath = await ttsOpenAI({ text, voice: 'nova', outputPath, speed }); if (!outputPath && filePath) playAudio(filePath); return { ok: true, provider: 'openai (fallback)', savedTo: outputPath || null }; }
            catch {}
          }
          try { ttsSystem({ text, outputPath }); return { ok: true, provider: 'system (fallback)' }; }
          catch {}
          return { ok: false, error: err.message };
        }
      }

      case 'stt': {
        const { audioPath, language = 'auto', provider = 'openai', prompt } = params;
        if (!audioPath) return { ok: false, error: 'audioPath required' };
        if (!existsSync(audioPath)) return { ok: false, error: `File not found: ${audioPath}` };
        try {
          if (provider === 'openai') {
            const text = await sttOpenAI({ audioPath, language, prompt });
            return { ok: true, text, language, audioPath };
          }
          return { ok: false, error: 'Only openai provider supported for STT currently' };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      }

      case 'voice_clone': {
        const key = process.env.ELEVENLABS_API_KEY;
        if (!key) return { ok: false, error: 'ELEVENLABS_API_KEY required for voice cloning' };
        if (!existsSync(params.samplePath)) return { ok: false, error: `Sample file not found: ${params.samplePath}` };
        const formData = new FormData();
        const { Blob } = await import('buffer');
        const data = (await import('fs')).readFileSync(params.samplePath);
        formData.append('name', params.name || 'My Voice');
        formData.append('files', new Blob([data]), params.samplePath.split('/').pop());
        const res = await fetch('https://api.elevenlabs.io/v1/voices/add', {
          method: 'POST',
          headers: { 'xi-api-key': key },
          body: formData,
        });
        const json = await res.json();
        return res.ok ? { ok: true, voiceId: json.voice_id, name: params.name } : { ok: false, error: json.detail };
      }

      default:
        return { ok: false, error: `Unknown tool: ${tool}. Use: tts, stt, voice_clone` };
    }
  },
};
