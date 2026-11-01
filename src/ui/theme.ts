import { useColorScheme } from 'react-native';

const light = {
  bg: '#F6F7F9',
  card: '#FFFFFF',
  text: '#14171F',
  sub: '#5B6270',
  line: '#E3E6EC',
  spent: '#B3261E',
  earned: '#1B7F3B',
  accent: '#2F5BEA',
  warnBg: '#FFF4D6',
  warnText: '#6B4E00',
  errBg: '#FDE7E5',
  errText: '#7A1712',
  infoBg: '#E7EEFF',
  infoText: '#1D3A8A',
  chip: '#EDEFF4',
};

const dark: typeof light = {
  bg: '#0E1015',
  card: '#171A21',
  text: '#F1F3F7',
  sub: '#A3AABA',
  line: '#272B35',
  spent: '#FF8A80',
  earned: '#6FD48E',
  accent: '#8FA8FF',
  warnBg: '#3A2F0B',
  warnText: '#FFE08A',
  errBg: '#3C1512',
  errText: '#FFB4AB',
  infoBg: '#18224A',
  infoText: '#B9C8FF',
  chip: '#232733',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const ROW_HEIGHT = 68;
export const HEADER_HEIGHT = 92;
