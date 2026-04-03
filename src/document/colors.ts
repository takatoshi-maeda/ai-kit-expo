import type { AiKitThemeTokens } from '../client';
import type { DocumentUiColors } from './types';

const DEFAULT_COLORS: Required<DocumentUiColors> = {
  text: '#1f2937',
  mutedText: '#6b7280',
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceBorder: '#dbe3ee',
  surfaceSelected: '#e8f2ff',
  tint: '#0a7ea4',
  error: '#dc2626',
  editorSurface: '#ffffff',
};

export function resolveDocumentColors(
  colors?: DocumentUiColors,
  tokens?: AiKitThemeTokens,
): Required<DocumentUiColors> {
  return {
    ...DEFAULT_COLORS,
    text: tokens?.text ?? DEFAULT_COLORS.text,
    mutedText: tokens?.mutedText ?? DEFAULT_COLORS.mutedText,
    background: tokens?.background ?? DEFAULT_COLORS.background,
    surface: tokens?.surface ?? DEFAULT_COLORS.surface,
    surfaceBorder: tokens?.surfaceBorder ?? DEFAULT_COLORS.surfaceBorder,
    surfaceSelected: tokens?.surfaceSelected ?? DEFAULT_COLORS.surfaceSelected,
    tint: tokens?.tint ?? DEFAULT_COLORS.tint,
    error: tokens?.error ?? DEFAULT_COLORS.error,
    editorSurface: tokens?.surface ?? DEFAULT_COLORS.editorSurface,
    ...colors,
  };
}
