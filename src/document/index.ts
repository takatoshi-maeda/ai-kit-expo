import type { ReactElement } from 'react';

export { createAiKitDocumentClient } from '../client';
export type { AiKitDocumentClient, AiKitDocumentClientConfig } from '../client';

export type DocumentWorkspaceProps = {
  rootPath?: string;
};

export function DocumentWorkspace(_props: DocumentWorkspaceProps): ReactElement | null {
  return null;
}
