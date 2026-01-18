/**
 * ACP Core
 *
 * Universal ACP (Agent Client Protocol) implementation.
 *
 * This package provides:
 * - Type definitions for ACP
 * - Interface contracts for implementations
 * - DI factory for swapping implementations
 * - Adapters (Zed, Native)
 *
 * Usage:
 * ```typescript
 * import { createAcpClient, registerImplementation } from './acp-core';
 * import { createZedAdapter } from './acp-core/adapters';
 *
 * // Register implementations
 * registerImplementation('zed', createZedAdapter);
 *
 * // Create client
 * const client = createAcpClient({ onEvent: console.log });
 *
 * // Connect and use
 * const session = await client.connect({ cwd: '/my/project' });
 * for await (const event of client.sendMessage('Hello!')) {
 *   console.log(event);
 * }
 * ```
 *
 * @packageDocumentation
 */

// Interfaces & Types
export * from "./interfaces";

// Factory & DI
export {
  createAcpClient,
  registerImplementation,
  setDefaultImplementation,
  getDefaultImplementation,
  hasImplementation,
  getRegisteredImplementations,
  clearImplementations,
  type AcpImplementation,
} from "./factory";

// Adapters
export { createZedAdapter, ZedAcpAdapter } from "./adapters";

// Future: Initialize default implementations
// This will be called when the package is imported
import { registerImplementation } from "./factory";
import { createZedAdapter } from "./adapters";

// Auto-register Zed adapter as default
registerImplementation("zed", createZedAdapter);
