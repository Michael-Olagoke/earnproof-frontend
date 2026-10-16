/**
 * Tests for reconciliation validation schemas and logic.
 *
 * Covers contract address validation, network selection, authorization,
 * and consistency checks.
 */

import { describe, it, expect } from "@jest/globals";
import {
  reconciliationInputSchema,
  userRoleSchema,
  isRoleAuthorizedForReconciliation,
  validateContractAddressFormat,
  validateNetworkConsistency,
  validateContractConsistency,
  contractAddressSchema,
} from "@/lib/validation/reconciliation";
import { MOCK_CONTRACT_ADDRESS, MOCK_ALTERNATIVE_CONTRACT_ADDRESS } from "@/tests/fixtures/reconciliation-fixtures";

describe("reconciliation validation", () => {
  describe("contract address validation", () => {
    it("accepts valid contract address", () => {
      const result = contractAddressSchema.safeParse(MOCK_CONTRACT_ADDRESS);
      expect(result.success).toBe(true);
    });

    it("rejects address not starting with C", () => {
      const result = contractAddressSchema.safeParse(
        "GBDE4723EB188743EA6FA31B25670131D592375F35E7997F19A8FB0F635CFFC7C",
      );
      expect(result.success).toBe(false);
    });

    it("rejects address with wrong length", () => {
      const result = contractAddressSchema.safeParse("CBDE4723EB");
      expect(result.success).toBe(false);
    });

    it("rejects empty address", () => {
      const result = contractAddressSchema.safeParse("");
      expect(result.success).toBe(false);
    });

    it("validates format without API calls", () => {
      const error = validateContractAddressFormat(
        "INVALID_ADDRESS_TOO_SHORT",
      );
      expect(error).not.toBeNull();
      expect(error).toContain("Invalid contract address");
    });

    it("returns null for valid address format", () => {
      const error = validateContractAddressFormat(MOCK_CONTRACT_ADDRESS);
      expect(error).toBeNull();
    });
  });

  describe("network validation", () => {
    it("accepts testnet", () => {
      const result = reconciliationInputSchema.safeParse({
        network: "testnet",
        contractAddress: MOCK_CONTRACT_ADDRESS,
      });
      expect(result.success).toBe(true);
    });

    it("accepts public", () => {
      const result = reconciliationInputSchema.safeParse({
        network: "public",
        contractAddress: MOCK_CONTRACT_ADDRESS,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid network", () => {
      const result = reconciliationInputSchema.safeParse({
        network: "mainnet" as any,
        contractAddress: MOCK_CONTRACT_ADDRESS,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("authorization", () => {
    it("authorizes ADMIN role", () => {
      const result = userRoleSchema.safeParse("ADMIN");
      expect(result.success).toBe(true);
      expect(isRoleAuthorizedForReconciliation("ADMIN")).toBe(true);
    });

    it("authorizes ISSUER role", () => {
      const result = userRoleSchema.safeParse("ISSUER");
      expect(result.success).toBe(true);
      expect(isRoleAuthorizedForReconciliation("ISSUER")).toBe(true);
    });

    it("denies WORKER role", () => {
      expect(isRoleAuthorizedForReconciliation("WORKER")).toBe(false);
    });

    it("denies DEVELOPER role", () => {
      expect(isRoleAuthorizedForReconciliation("DEVELOPER")).toBe(false);
    });
  });

  describe("consistency checks", () => {
    it("validates matching networks", () => {
      const error = validateNetworkConsistency("testnet", "testnet");
      expect(error).toBeNull();
    });

    it("detects mismatched networks", () => {
      const error = validateNetworkConsistency("testnet", "public");
      expect(error).not.toBeNull();
      expect(error).toContain("Network mismatch");
    });

    it("validates matching contracts (case-insensitive)", () => {
      const error = validateContractConsistency(
        MOCK_CONTRACT_ADDRESS,
        MOCK_CONTRACT_ADDRESS.toLowerCase(),
      );
      expect(error).toBeNull();
    });

    it("detects mismatched contracts", () => {
      const error = validateContractConsistency(
        MOCK_CONTRACT_ADDRESS,
        MOCK_ALTERNATIVE_CONTRACT_ADDRESS,
      );
      expect(error).not.toBeNull();
      expect(error).toContain("Contract mismatch");
    });
  });
});
