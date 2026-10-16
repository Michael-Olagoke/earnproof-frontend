"use client";

/**
 * Network and contract selection UI component.
 *
 * Allows operator to choose a network and contract for reconciliation.
 * Validates input before enabling comparison.
 */

import React, { useCallback, useMemo } from "react";
import type {
  NetworkIdentifier,
  AvailableContractInfo,
} from "@/lib/reconciliation/types";
import { validateContractAddressFormat } from "@/lib/validation/reconciliation";

interface NetworkContractSelectorProps {
  selectedNetwork: NetworkIdentifier | null;
  selectedContractAddress: string | null;
  availableContracts: AvailableContractInfo[];
  onNetworkChange: (network: NetworkIdentifier) => void;
  onContractChange: (address: string) => void;
  onCompare: () => void;
  isLoading: boolean;
}

export function NetworkContractSelector(
  props: NetworkContractSelectorProps,
): React.ReactElement {
  const {
    selectedNetwork,
    selectedContractAddress,
    availableContracts,
    onNetworkChange,
    onContractChange,
    onCompare,
    isLoading,
  } = props;

  /**
   * Available networks.
   */
  const networks: NetworkIdentifier[] = useMemo(() => ["testnet", "public"], []);

  /**
   * Filter contracts to those matching selected network.
   */
  const networkContracts = useMemo(() => {
    if (!selectedNetwork) {
      return [];
    }
    return availableContracts.filter((c) => c.network === selectedNetwork);
  }, [selectedNetwork, availableContracts]);

  /**
   * Validate contract address format.
   */
  const contractAddressError = useMemo(() => {
    if (!selectedContractAddress) {
      return null;
    }
    return validateContractAddressFormat(selectedContractAddress);
  }, [selectedContractAddress]);

  /**
   * Check if comparison can proceed.
   */
  const canCompare = useMemo(() => {
    return (
      selectedNetwork &&
      selectedContractAddress &&
      !contractAddressError &&
      !isLoading
    );
  }, [selectedNetwork, selectedContractAddress, contractAddressError, isLoading]);

  return (
    <div className="space-y-6">
      {/* Network Selection */}
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Network
        </label>
        <div className="mt-2 flex gap-3">
          {networks.map((network) => (
            <button
              key={network}
              onClick={() => onNetworkChange(network)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedNetwork === network
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
              disabled={isLoading}
            >
              {network === "testnet" ? "Testnet" : "Public"}
            </button>
          ))}
        </div>
      </div>

      {/* Contract Selection */}
      <div>
        <label htmlFor="contract" className="block text-sm font-medium text-slate-700">
          Contract Address
        </label>
        <div className="mt-2 space-y-2">
          {networkContracts.length > 0 && (
            <select
              id="contract"
              value={selectedContractAddress || ""}
              onChange={(e) => onContractChange(e.target.value)}
              disabled={!selectedNetwork || isLoading}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="">Select a contract...</option>
              {networkContracts.map((contract) => (
                <option key={contract.address} value={contract.address}>
                  {contract.name || contract.address}
                  {contract.description ? ` - ${contract.description}` : ""}
                </option>
              ))}
            </select>
          )}

          {/* Manual contract address input */}
          <div className="text-xs text-slate-500">
            Or enter contract address directly:
          </div>
          <input
            type="text"
            placeholder="C..."
            value={selectedContractAddress || ""}
            onChange={(e) => onContractChange(e.target.value.trim())}
            disabled={!selectedNetwork || isLoading}
            className={`w-full rounded-md border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 ${
              contractAddressError
                ? "border-red-300 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-500"
                : "border-slate-300 focus:border-slate-900 focus:ring-slate-900"
            }`}
          />

          {/* Address validation error */}
          {contractAddressError && (
            <p className="text-xs text-red-600">{contractAddressError}</p>
          )}
        </div>
      </div>

      {/* Compare Button */}
      <button
        onClick={onCompare}
        disabled={!canCompare}
        className={`w-full rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          canCompare
            ? "bg-slate-900 text-white hover:bg-slate-800"
            : "bg-slate-100 text-slate-400 cursor-not-allowed"
        }`}
      >
        {isLoading ? "Comparing..." : "Compare Digests"}
      </button>
    </div>
  );
}
