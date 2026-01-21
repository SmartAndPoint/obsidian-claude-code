/**
 * ACP Client Factory
 *
 * Dependency Injection container for ACP implementations.
 * Allows swapping implementations for testing and future migrations.
 */

import type { IAcpClient, AcpClientFactory, AcpClientConfig } from "./interfaces";

/**
 * Available implementation types
 */
export type AcpImplementation = "zed" | "native";

/**
 * Registry of available implementations
 */
const implementations: Map<AcpImplementation, AcpClientFactory> = new Map();

/**
 * Current default implementation
 */
let defaultImplementation: AcpImplementation = "zed";

/**
 * Register an ACP client implementation
 * @param name Implementation identifier
 * @param factory Factory function to create the client
 */
export function registerImplementation(name: AcpImplementation, factory: AcpClientFactory): void {
  implementations.set(name, factory);
}

/**
 * Set the default implementation
 * @param name Implementation to use by default
 */
export function setDefaultImplementation(name: AcpImplementation): void {
  if (!implementations.has(name)) {
    throw new Error(`Implementation "${name}" is not registered`);
  }
  defaultImplementation = name;
}

/**
 * Get the current default implementation name
 */
export function getDefaultImplementation(): AcpImplementation {
  return defaultImplementation;
}

/**
 * Create an ACP client using the specified or default implementation
 * @param config Client configuration
 * @param implementation Optional specific implementation to use
 * @returns ACP client instance
 */
export function createAcpClient(
  config?: AcpClientConfig,
  implementation?: AcpImplementation
): IAcpClient {
  const implName = implementation ?? defaultImplementation;
  const factory = implementations.get(implName);

  if (!factory) {
    throw new Error(
      `Implementation "${implName}" is not registered. ` +
        `Available: ${Array.from(implementations.keys()).join(", ")}`
    );
  }

  return factory(config);
}

/**
 * Check if an implementation is registered
 * @param name Implementation name
 */
export function hasImplementation(name: AcpImplementation): boolean {
  return implementations.has(name);
}

/**
 * Get all registered implementation names
 */
export function getRegisteredImplementations(): AcpImplementation[] {
  return Array.from(implementations.keys());
}

/**
 * Clear all registered implementations (useful for testing)
 */
export function clearImplementations(): void {
  implementations.clear();
  defaultImplementation = "zed";
}
