import type { ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

type BaseColors = {
  background?: string;
  surface?: string;
  tint?: string;
  text?: string;
  error?: string;
};

function resolveColors(colors?: BaseColors) {
  return {
    background: colors?.background ?? 'rgba(0, 0, 0, 0.7)',
    surface: colors?.surface ?? '#1e1e1e',
    tint: colors?.tint ?? '#0a7ea4',
    text: colors?.text ?? '#ffffff',
    error: colors?.error ?? '#dc2626',
  };
}

export type McpConnectionOverlayProps = {
  visible?: boolean;
  statusLabel?: string;
  lastError?: string | null;
  isError?: boolean;
  onRetry?: () => void;
  colors?: BaseColors;
};

export type RunningIndicatorProps = {
  elapsedSeconds: number;
  label?: string | null;
  colors?: {
    text?: string;
    tint?: string;
  };
};

function formatElapsed(seconds: number): string {
  const n = Math.max(0, Math.floor(seconds));
  const s = n % 60;
  const m = Math.floor(n / 60);
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function McpConnectionOverlay({
  visible = false,
  statusLabel = 'サーバーに接続中...',
  lastError,
  isError = false,
  onRetry,
  colors: colorOverrides,
}: McpConnectionOverlayProps): ReactElement | null {
  if (!visible) return null;
  const colors = resolveColors(colorOverrides);

  return (
    <View style={[styles.overlay, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="large" color="#fff" style={isError ? styles.hidden : undefined} />
        <Text style={[styles.title, { color: colors.text }]}>{statusLabel}</Text>
        {lastError ? (
          <Text style={[styles.error, { color: colors.error }]} numberOfLines={3}>
            {lastError}
          </Text>
        ) : null}
        {isError && onRetry ? (
          <Pressable style={[styles.retryButton, { backgroundColor: colors.tint }]} onPress={onRetry}>
            <Text style={[styles.retryText, { color: colors.text }]}>再試行</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function RunningIndicator({
  elapsedSeconds,
  label,
  colors,
}: RunningIndicatorProps): ReactElement {
  const textColor = colors?.text ?? '#374151';
  const tintColor = colors?.tint ?? '#0a7ea4';

  return (
    <View style={runningStyles.container}>
      <ActivityIndicator size="small" color={tintColor} />
      <View style={runningStyles.textContainer}>
        {label ? (
          <Text style={[runningStyles.label, { color: textColor }]} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
        <Text style={[runningStyles.elapsed, { color: textColor, opacity: 0.6 }]}>
          {formatElapsed(elapsedSeconds)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  card: {
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    marginHorizontal: 32,
    maxWidth: 320,
  },
  hidden: {
    opacity: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  error: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryButton: {
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginTop: 4,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

const runningStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  textContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  label: {
    fontSize: 14,
    flexShrink: 1,
  },
  elapsed: {
    fontSize: 13,
  },
});
