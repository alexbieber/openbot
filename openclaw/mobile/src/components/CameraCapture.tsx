import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal, Alert, ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Theme } from '../theme';

interface CapturedPhoto {
  uri: string;
  name: string;
  type: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onCapture: (photo: CapturedPhoto) => void;
  theme: Theme;
}

export default function CameraCapture({ visible, onClose, onCapture, theme }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [flash, setFlash] = useState<'off' | 'on' | 'auto'>('off');
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        skipProcessing: false,
      });
      if (photo?.uri) {
        const filename = `photo_${Date.now()}.jpg`;
        onCapture({ uri: photo.uri, name: filename, type: 'image/jpeg' });
        onClose();
      }
    } catch (err: any) {
      Alert.alert('Camera Error', err.message || 'Failed to capture photo');
    } finally {
      setCapturing(false);
    }
  }, [capturing, onCapture, onClose]);

  const toggleFacing = () => setFacing(f => f === 'back' ? 'front' : 'back');
  const toggleFlash = () => setFlash(f => f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off');

  const flashIcon = flash === 'off' ? 'flash-off-outline' : flash === 'on' ? 'flash-outline' : 'flash';

  if (!visible) return null;

  if (!permission) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={[styles.permissionContainer, { backgroundColor: theme.bg }]}>
          <ActivityIndicator color={theme.accent} />
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={[styles.permissionContainer, { backgroundColor: theme.bg }]}>
          <Ionicons name="camera-outline" size={64} color={theme.textDim} />
          <Text style={[styles.permissionTitle, { color: theme.text }]}>Camera Access Needed</Text>
          <Text style={[styles.permissionText, { color: theme.textMuted }]}>
            Grant camera access to take photos and share them with OpenBot.
          </Text>
          <Pressable
            style={[styles.grantBtn, { backgroundColor: theme.accent }]}
            onPress={requestPermission}
          >
            <Text style={styles.grantBtnText}>Grant Permission</Text>
          </Pressable>
          <Pressable style={styles.cancelLink} onPress={onClose}>
            <Text style={[styles.cancelLinkText, { color: theme.textDim }]}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          flash={flash}
        >
          {/* Top controls */}
          <View style={styles.topBar}>
            <Pressable style={styles.controlBtn} onPress={onClose}>
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
            <View style={styles.topRight}>
              <Pressable style={styles.controlBtn} onPress={toggleFlash}>
                <Ionicons name={flashIcon as any} size={24} color="#fff" />
              </Pressable>
              <Pressable style={styles.controlBtn} onPress={toggleFacing}>
                <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
              </Pressable>
            </View>
          </View>

          {/* Bottom controls */}
          <View style={styles.bottomBar}>
            <View style={styles.shutterRing}>
              <Pressable
                style={[styles.shutter, capturing && styles.shutterCapturing]}
                onPress={handleCapture}
                disabled={capturing}
              >
                {capturing ? (
                  <ActivityIndicator color="#6366f1" />
                ) : (
                  <View style={styles.shutterInner} />
                )}
              </Pressable>
            </View>
          </View>
        </CameraView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 56, paddingHorizontal: 20 },
  topRight: { flexDirection: 'row', gap: 8 },
  controlBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  bottomBar: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' },
  shutterRing: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  shutter: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  shutterCapturing: { backgroundColor: '#f1f5f9' },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 16 },
  permissionTitle: { fontSize: 20, fontWeight: '700' },
  permissionText: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  grantBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 20, marginTop: 8 },
  grantBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelLink: { marginTop: 4 },
  cancelLinkText: { fontSize: 14 },
});
