import { createContext, useContext } from 'react';

import type { AiKitClient, AiKitDocumentClient } from '../client';

export type AiKitRuntimeValue = {
  client: AiKitClient;
  documents: AiKitDocumentClient;
};

const AiKitRuntimeContext = createContext<AiKitRuntimeValue | null>(null);

function useRequiredRuntimeContext(): AiKitRuntimeValue {
  const value = useContext(AiKitRuntimeContext);
  if (!value) {
    throw new Error('AiKitProvider is required.');
  }
  return value;
}

export function useAiKitRuntime(): AiKitRuntimeValue {
  return useRequiredRuntimeContext();
}

export function useAiKitClient(): AiKitClient {
  return useRequiredRuntimeContext().client;
}

export function useAiKitDocumentClient(): AiKitDocumentClient {
  return useRequiredRuntimeContext().documents;
}

export { AiKitRuntimeContext };
