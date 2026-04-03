# ai-kit-expo

Reusable Expo-facing ai-kit runtime and UI package.

## Scope

- Shared MCP/JSON-RPC client runtime
- Shared thread runtime and thread UI
- Shared document workspace runtime and UI
- Shared provider/runtime hooks

This package does not own app-specific routing, auth UI, or product-specific concepts such as Codefleet backlog models.

## Usage

```ts
import { createAiKitClient } from '@takatoshi-maeda/ai-kit-expo';

const client = createAiKitClient({
  baseUrl: 'https://example.com',
  defaultAgentName: 'assistant',
  documentBasePath: '/api/codefleet/documents',
});
```

`documentBasePath` must be provided by the host app when its backend does not expose the default `/api/documents` routes.
