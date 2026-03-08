import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import AnimatedLogo from './AnimatedLogo';
import type { Theme } from '../theme';

interface Props {
  theme: Theme;
}

export default function TypingIndicator({ theme }: Props) {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const createAnim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 320, useNativeDriver: true }),
          Animated.delay(640),
        ]),
      );

    const anims = dots.map((d, i) => createAnim(d, i * 160));
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={styles.wrapper}>
      <AnimatedLogo theme={theme} isAnimating size={28} />
      <View style={styles.dotsRow}>
        {dots.map((anim, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: theme.textDim,
                transform: [{
                  translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }),
                }],
                opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,   // AnimatedLogo has its own glow padding
    paddingVertical: 8,
    gap: 2,
  },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
