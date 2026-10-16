/**
 * API client for reconciliation/digest comparison.
 *
 * Provides functions to fetch backend contract state projections
 * and live on-chain digests for comparison.
 *
 * Uses the established API client patterns:
 * - retryRead() for GET operations (automatic retry on transient failures)
 * - Bearer token authentication
 * - Strongly typed responses with generics
 * - Error normalization via normalizeError()
 */

import { apiClient } from "./client";
import { retryRead } from "./retry";
import type {
  BackendContractStateProjection,
  ContractStateDigest,
  NetworkIdentifier,
  AvailableContractInfo,
} from "@/lib/reconciliation/types";
import {
  backendContractStateProjectionSchema,
  contractStateDigestV1Schema,
} from "@/lib/validation/reconciliation";

/**
 * Fetch backend's projected contract state for reconciliation.
 *
 * The backend maintains a projection of what the on-chain contract state
 * should be (useful for detecting divergence from live state). This endpoint
 * returns the current projection including the expected digest and metadata.
 *
 * Errors are retried automatically on transient failures (429, 503, 504).
 * Validation errors (4xx except 429) fail immediately.
 *
 * @param token - Bearer token for authentication
 * @param network - Stellar network identifier ("testnet" | "public")
 * @param contractAddress - Contract address to get projection for
 * @param signal - AbortSignal for cancellation
 * @returns Backend projection with expected digest
 * @throws Normalized error on failure
 */
export async function getBackendContractStateProjection(
  token: string,
  network: NetworkIdentifier,
  contractAddress: string,
  signal: AbortSignal,
): Promise<BackendContractStateProjection> {
  return retryRead(async (retrySignal) => {
    const response = await apiClient<BackendContractStateProjection>({
      path: `/reconciliation/contract-state-projection?network=${encodeURIComponent(network)}&contractAddress=${encodeURIComponent(contractAddress)}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: retrySignal,
    });

    // Validate response against schema to ensure contract consistency
    const validated = backendContractStateProjectionSchema.parse(response);

    return validated;
  }, signal);
}

/**
 * Fetch live on-chain contract state digest from Stellar network.
 *
 * Queries the live Stellar contract (via Horizon or direct RPC) to compute
 * or retrieve the current digest of the contract state. This represents
 * the true current state of the contract on-chain.
 *
 * Errors are retried automatically on transient failures (429, 503, 504).
 * If the contract is not found on-chain, returns a 404 error.
 *
 * @param token - Bearer token for authentication
 * @param network - Stellar network identifier
 * @param contractAddress - Contract address to fetch digest for
 * @param signal - AbortSignal for cancellation
 * @returns Live digest from on-chain state
 * @throws Normalized error on failure (404 if contract not found)
 */
export async function getLiveContractStateDigest(
  token: string,
  network: NetworkIdentifier,
  contractAddress: string,
  signal: AbortSignal,
): Promise<ContractStateDigest> {
  return retryRead(async (retrySignal) => {
    const response = await apiClient<ContractStateDigest>({
      path: `/reconciliation/live-digest?network=${encodeURIComponent(network)}&contractAddress=${encodeURIComponent(contractAddress)}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: retrySignal,
    });

    // Validate response against versioned schema
    // Currently only v1 is recognized; unknown versions fail closed
    const validated = validateDigestVersion(response);

    return validated;
  }, signal);
}

/**
 * Fetch list of available contracts for selection in reconciliation UI.
 *
 * Returns all known contracts that can be reconciled, grouped by network.
 * This list comes from backend's registry of tracked contracts.
 *
 * @param token - Bearer token for authentication
 * @param signal - AbortSignal for cancellation
 * @returns List of available contracts with metadata
 * @throws Normalized error on failure
 */
export async function getAvailableContractsForReconciliation(
  token: string,
  signal: AbortSignal,
): Promise<AvailableContractInfo[]> {
  return retryRead(async (retrySignal) => {
    const response = await apiClient<AvailableContractInfo[]>({
      path: "/reconciliation/available-contracts",
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: retrySignal,
    });

    // Validate each contract in the list
    if (!Array.isArray(response)) {
      throw new Error("Expected array of available contracts");
    }

    return response.map((contract) => {
      // Basic validation of contract structure
      if (
        !contract.address ||
        !contract.network ||
        typeof contract.address !== "string" ||
        typeof contract.network !== "string"
      ) {
        throw new Error("Invalid contract metadata in available contracts list");
      }
      return contract;
    });
  }, signal);
}

/**
 * Validate digest version and schema.
 *
 * Currently only v1 digests are recognized. Unknown versions
 * fail closed with a clear error.
 *
 * @param digest - Digest to validate
 * @returns Validated digest
 * @throws Error if version is not recognized
 */
function validateDigestVersion(digest: unknown): ContractStateDigest {
  // Try to extract version before full validation
  if (typeof digest === "object" && digest !== null && "version" in digest) {
    const version = (digest as Record<string, unknown>).version;

    if (version === "v1") {
      return contractStateDigestV1Schema.parse(digest);
    }

    // Unknown version: fail closed
    throw new Error(
      `Unsupported digest version: ${version}. Only v1 is supported.`,
    );
  }

  // No version field: fail closed
  throw new Error("Digest missing version field");
}
