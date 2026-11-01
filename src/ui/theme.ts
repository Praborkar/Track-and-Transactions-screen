/**
 * Look and feel follows the Simplify Money app: a pale blue-grey page, white rounded cards,
 * navy text, amber for the main action, Poppins. One light theme, like the app.
 */
export const theme = {
  bg: '#EEF3FA',
  card: '#FFFFFF',
  text: '#0B2545',
  sub: '#6B7A90',
  line: '#E3EAF4',
  spent: '#D9423B',
  earned: '#17915A',
  accent: '#FFC02E',
  onAccent: '#1B1B1B',
  link: '#E6A100',
  warnBg: '#FFF4D6',
  warnText: '#8A5A00',
  errBg: '#FDE9E7',
  errText: '#9A2A22',
  infoBg: '#E4EDFF',
  infoText: '#27498F',
  okBg: '#E3F6EC',
  okText: '#1B7A4E',
  chip: '#F1F5FB',
  tint: '#FFF7E0',
} as const;

export type Theme = typeof theme;

export const useTheme = (): Theme => theme;

export const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semi: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export const card = {
  backgroundColor: theme.card,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: theme.line,
  shadowColor: '#1B3B6F',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 1,
} as const;

export const SIDE = 14;
export const GAP = 14;
export const ROW_HEIGHT = 72;
export const HEADER_HEIGHT = 160;

const ICONS: Record<string, { emoji: string; bg: string }> = {
  FOOD: { emoji: '🍽️', bg: '#FFF1DC' },
  GROCERIES: { emoji: '🛒', bg: '#E3F6EA' },
  SHOPPING: { emoji: '🛍️', bg: '#EFE9FF' },
  TRAVEL: { emoji: '✈️', bg: '#E1EEFF' },
  SUBSCRIPTIONS: { emoji: '🔁', bg: '#FCE7F1' },
  HEALTH: { emoji: '💊', bg: '#E1F7F5' },
  REFUND: { emoji: '↩️', bg: '#E3F6EC' },
  BILLS: { emoji: '🧾', bg: '#FFF4D6' },
  ENTERTAINMENT: { emoji: '🎬', bg: '#F1E7FF' },
  RENT: { emoji: '🏠', bg: '#E4EDFF' },
  SALARY: { emoji: '💼', bg: '#E3F6EC' },
  TRANSFER: { emoji: '⇄', bg: '#EDF1F7' },
  TRANSFERS_OUT: { emoji: '💸', bg: '#FDEBE7' },
  INSURANCE_PREMIUM: { emoji: '🛡️', bg: '#E4EDFF' },
  BNPL_EMI: { emoji: '📅', bg: '#FFF4D6' },
};

export const iconFor = (category: string) => ICONS[category] ?? { emoji: '•', bg: '#EDF1F7' };
