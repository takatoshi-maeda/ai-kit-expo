import { useCallback, useRef, type ReactElement } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import type { ThreadMessage } from '../types';
import { ThreadMessageView } from './ThreadMessageView';
import type { ThreadDetailProps } from './types';

export function ThreadDetail({
  messages,
  elapsedSeconds,
  colors,
  onCopyMessage,
}: ThreadDetailProps): ReactElement {
  const listRef = useRef<FlatList<ThreadMessage>>(null);

  const handleContentSizeChange = useCallback(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ThreadMessageView
            message={item}
            liveElapsed={elapsedSeconds}
            colors={colors}
            onCopyMessage={onCopyMessage}
          />
        )}
        contentContainerStyle={styles.content}
        onContentSizeChange={handleContentSizeChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingVertical: 8,
  },
});
