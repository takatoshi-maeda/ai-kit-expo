import type { ReactElement } from 'react';

export type McpConnectionOverlayProps = {
  visible?: boolean;
};

export type RunningIndicatorProps = {
  visible?: boolean;
};

export function McpConnectionOverlay({
  visible = false,
}: McpConnectionOverlayProps): ReactElement | null {
  return visible ? null : null;
}

export function RunningIndicator({ visible = false }: RunningIndicatorProps): ReactElement | null {
  return visible ? null : null;
}
