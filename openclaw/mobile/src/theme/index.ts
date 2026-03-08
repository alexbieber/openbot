import { useColorScheme } from 'react-native';
import { useSettingsStore } from '../stores/settings';

export interface Theme {
  bg: string;
  surface: string;
  surfaceAlt: string;
  surfaceHover: string;
  border: string;
  borderSubtle: string;
  text: string;
  textMuted: string;
  textDim: string;
  accent: string;
  accentLight: string;
  accentSurface: string;
  danger: string;
  success: string;
  warning: string;
  userBubble: string;
  userBubbleText: string;
  aiBubble: string;
  aiBubbleText: string;
  inputBg: string;
  inputBorder: string;
  statusBar: 'light-content' | 'dark-content';
  tabBarBg: string;
  tabBarBorder: string;
  codeBg: string;
  avatarBg: string;
  avatarText: string;
}

// Clean neutral-dark like Claude's dark mode
export const darkTheme: Theme = {
  bg: '#0F0F0F',
  surface: '#1A1A1A',
  surfaceAlt: '#222222',
  surfaceHover: '#2A2A2A',
  border: '#2E2E2E',
  borderSubtle: '#242424',
  text: '#ECECEC',
  textMuted: '#A0A0A0',
  textDim: '#666666',
  accent: '#D97757',
  accentLight: '#E8977A',
  accentSurface: '#2A1A12',
  danger: '#E05252',
  success: '#4CAF7D',
  warning: '#E8A84C',
  userBubble: '#262626',
  userBubbleText: '#ECECEC',
  aiBubble: 'transparent',
  aiBubbleText: '#ECECEC',
  inputBg: '#1A1A1A',
  inputBorder: '#2E2E2E',
  statusBar: 'light-content',
  tabBarBg: '#141414',
  tabBarBorder: '#222222',
  codeBg: '#0A0A0A',
  avatarBg: '#2A1A12',
  avatarText: '#D97757',
};

// Clean white like Claude's light mode
export const lightTheme: Theme = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F5',
  surfaceHover: '#EFEFEF',
  border: '#E8E8E8',
  borderSubtle: '#F0F0F0',
  text: '#1A1A1A',
  textMuted: '#666666',
  textDim: '#A0A0A0',
  accent: '#C4603C',
  accentLight: '#D97757',
  accentSurface: '#FDF3EF',
  danger: '#C0392B',
  success: '#2D7A56',
  warning: '#B8741A',
  userBubble: '#F0F0F0',
  userBubbleText: '#1A1A1A',
  aiBubble: 'transparent',
  aiBubbleText: '#1A1A1A',
  inputBg: '#FFFFFF',
  inputBorder: '#E8E8E8',
  statusBar: 'dark-content',
  tabBarBg: '#FFFFFF',
  tabBarBorder: '#EEEEEE',
  codeBg: '#F6F6F6',
  avatarBg: '#FDF3EF',
  avatarText: '#C4603C',
};

export function useTheme(): Theme {
  const { theme } = useSettingsStore();
  const systemScheme = useColorScheme();

  if (theme === 'system') {
    return systemScheme === 'light' ? lightTheme : darkTheme;
  }
  return theme === 'light' ? lightTheme : darkTheme;
}
