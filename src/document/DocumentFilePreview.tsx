import { Platform, StyleSheet, Text, View } from 'react-native';
import type { CSSProperties } from 'react';

import { resolveDocumentColors } from './colors';
import type { DocumentFilePreviewProps } from './types';

export function DocumentFilePreview({ assetUrl, language, colors: colorsProp }: DocumentFilePreviewProps) {
  const colors = resolveDocumentColors(colorsProp);

  if (Platform.OS === 'web') {
    return renderWebPreview({ assetUrl, language, mutedTextColor: colors.mutedText });
  }

  return (
    <View style={styles.unsupported}>
      <Text style={[styles.unsupportedTitle, { color: colors.mutedText }]}>
        {language === 'binary'
          ? 'This file cannot be previewed inline.'
          : 'Inline preview is only available on web.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  unsupported: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  unsupportedTitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});

function renderWebPreview({
  assetUrl,
  language,
  mutedTextColor,
}: {
  assetUrl: string | null;
  language: DocumentFilePreviewProps['language'];
  mutedTextColor: string;
}) {
  if (!assetUrl) {
    return <div style={{ ...centeredStyle, color: mutedTextColor }}>Preview could not be loaded.</div>;
  }

  if (language === 'image') {
    return (
      <div style={centeredStyle}>
        <img
          src={assetUrl}
          alt=""
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
        />
      </div>
    );
  }

  if (language === 'video') {
    return <video src={assetUrl} style={{ ...frameStyle, background: '#000' }} controls playsInline />;
  }

  if (language === 'pdf') {
    return <iframe src={assetUrl} style={frameStyle} title="Document preview" />;
  }

  return <div style={{ ...centeredStyle, color: mutedTextColor }}>This file cannot be previewed.</div>;
}

const frameStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  border: 'none',
  display: 'block',
};

const centeredStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  boxSizing: 'border-box',
};
