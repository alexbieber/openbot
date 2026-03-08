/**
 * Push-to-talk hook for the mobile app.
 * Records audio via expo-av and sends to gateway /push-to-talk endpoint.
 */

import { useState, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import { api } from '../services/api';

export interface PTTResult {
  transcript: string;
  response: string;
  model?: string;
}

export function usePushToTalk() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) throw new Error('Microphone permission not granted');

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (err) {
      console.error('[PTT] Start recording error:', err);
    }
  }, []);

  const stopAndSend = useCallback(async (): Promise<PTTResult | null> => {
    if (!recordingRef.current) return null;
    setIsRecording(false);
    setIsProcessing(true);

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) return null;

      // Upload audio to gateway
      const form = new FormData();
      form.append('audio', { uri, name: 'recording.m4a', type: 'audio/mp4' } as any);

      const res = await fetch(`${api.gatewayUrl}/push-to-talk`, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/mp4' },
        body: await (await fetch(uri)).blob(),
      });

      if (!res.ok) throw new Error(`Gateway PTT error: ${res.status}`);
      const data = await res.json();
      return { transcript: data.transcript, response: data.response, model: data.model };
    } catch (err) {
      console.error('[PTT] Process error:', err);
      return null;
    } finally {
      setIsProcessing(false);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
    }
  }, []);

  const cancelRecording = useCallback(async () => {
    if (recordingRef.current) {
      await recordingRef.current.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
    }
    setIsRecording(false);
    setIsProcessing(false);
  }, []);

  return { isRecording, isProcessing, startRecording, stopAndSend, cancelRecording };
}
