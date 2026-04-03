import type { PropsWithChildren, ReactElement } from 'react';

import type { AiKitClient } from '../client';
import { AiKitRuntimeContext } from './context';

export type AiKitProviderProps = PropsWithChildren<{
  client: AiKitClient;
}>;

export function AiKitProvider({ children, client }: AiKitProviderProps): ReactElement {
  return (
    <AiKitRuntimeContext.Provider
      value={{
        client,
        documents: client.documents,
      }}
    >
      {children}
    </AiKitRuntimeContext.Provider>
  );
}
