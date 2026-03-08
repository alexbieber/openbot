/**
 * AnimatedLogo — rainbow logo for app and web. Ring is always rainbow;
 * when isAnimating, adds pulse and brighter glow.
 */

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../theme';

const RAINBOW = [
  '#FF3B3B',
  '#FF6B00',
  '#FF9500',
  '#FFCC00',
  '#34C759',
  '#00C7BE',
  '#007AFF',
  '#5856D6',
  '#BF5AF2',
  '#FF375F',
  '#FF3B3B',
];

interface Props {
  theme: Theme;
  isAnimating?: boolean;
  size?: number;
}

export default function AnimatedLogo({ theme, isAnimating = false, size = 30 }: Props) {
  const colorAnim   = useRef(new Animated.Value(0)).current;
  const scaleAnim   = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.18)).current; // subtle glow when idle

  const ringThick = 3;
  const ringOuter = size + ringThick * 2;
  const glowOuter = ringOuter + 10;
  const containerSz = glowOuter;
  const faceRadius = size / 3;
  const ringRadius = ringOuter / 3;
  const glowRadius = glowOuter / 2.8;

  // Rainbow color cycle: always running (slow when idle, fast when replying)
  useEffect(() => {
    const duration = isAnimating ? 1800 : 5000;
    const colorLoop = Animated.loop(
      Animated.timing(colorAnim, {
        toValue: RAINBOW.length - 1,
        duration,
        useNativeDriver: false,
      }),
    );
    colorLoop.start();
    return () => colorLoop.stop();
  }, [isAnimating]);

  // Pulse + stronger glow only when replying
  useEffect(() => {
    if (isAnimating) {
      const breathe = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.10, duration: 600, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1.00, duration: 600, useNativeDriver: true }),
        ]),
      );
      Animated.timing(glowOpacity, { toValue: 0.32, duration: 300, useNativeDriver: false }).start();
      breathe.start();
      return () => {
        breathe.stop();
        Animated.timing(glowOpacity, { toValue: 0.18, duration: 300, useNativeDriver: false }).start();
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 12 }).start();
      };
    }
  }, [isAnimating]);

  const rainbowColor = colorAnim.interpolate({
    inputRange: RAINBOW.map((_, i) => i),
    outputRange: RAINBOW,
  });

  return (
    <Animated.View
      style={{
        width: containerSz,
        height: containerSz,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale: scaleAnim }],
      }}
    >
      {/* Outer glow — always visible (subtle), stronger when animating */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: glowRadius,
            backgroundColor: rainbowColor,
            opacity: glowOpacity,
          },
        ]}
      />

      {/* Rainbow ring — always visible */}
      <Animated.View
        style={{
          position: 'absolute',
          width: ringOuter,
          height: ringOuter,
          borderRadius: ringRadius,
          backgroundColor: rainbowColor,
        }}
      />

      {/* Face */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: faceRadius,
          backgroundColor: theme.avatarBg,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Ionicons
          name="sparkles"
          size={size * 0.52}
          color={theme.avatarText}
        />
      </View>
    </Animated.View>
  );
}
