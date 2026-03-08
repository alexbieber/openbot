---
name: voice
description: "Text-to-speech (ElevenLabs, OpenAI TTS, system), speech-to-text (Whisper), and voice note transcription"
version: 2.0.0
tools:
  - name: tts
    description: Convert text to speech and play it or save to file
    parameters:
      text: { type: string, description: Text to speak }
      provider: { type: string, enum: [elevenlabs, openai, system], default: elevenlabs }
      voice: { type: string, description: "Voice ID/name (ElevenLabs: 'Rachel', OpenAI: 'alloy/echo/fable/nova/shimmer/onyx')" }
      outputPath: { type: string, description: "Save to file path (mp3/wav). If omitted, plays immediately." }
      speed: { type: number, description: "Speech speed 0.5-2.0 (default 1.0)" }
      language: { type: string, description: "Language code (e.g. 'en', 'zh', 'es')" }

  - name: stt
    description: Transcribe audio file or microphone input to text
    parameters:
      audioPath: { type: string, description: "Path to audio file (mp3/wav/ogg/m4a/webm)" }
      language: { type: string, description: "Language hint for Whisper (e.g. 'en', 'auto')" }
      provider: { type: string, enum: [openai, local], default: openai }
      prompt: { type: string, description: "Context hint to improve accuracy" }

  - name: voice_clone
    description: Clone a voice from a sample (ElevenLabs only)
    parameters:
      name: { type: string }
      samplePath: { type: string, description: Path to audio sample (30s+ recommended) }
---

## Voice Skill v2

### ElevenLabs TTS
Set `ELEVENLABS_API_KEY` in `.env`. Default voice is Rachel. Browse voices at elevenlabs.io.

### OpenAI TTS  
Set `OPENAI_API_KEY`. Voices: alloy, echo, fable, nova, shimmer, onyx.

### Whisper STT
Set `OPENAI_API_KEY` for cloud Whisper. For local, `npm install whisper-node` (requires ffmpeg).

### System TTS (no API key)
- macOS: `say` command
- Linux: `espeak` or `festival`
- Windows: PowerShell `SpeechSynthesizer`
