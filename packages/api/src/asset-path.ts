import { z } from "zod";

export const STORED_ASSET_PATH_REGEX = /^\/uploads\/(?:[^/\s\\?#]+\/)*[^/\s\\?#]+$/;
export const STORED_ASSET_PATH_ERROR =
  "Avatar must be a relative stored asset path under /uploads/.";

/**
 * Validates that a value is a provider-relative stored asset path under
 * `/uploads/` without traversal segments (ADR 0004).
 */
export function isStoredAssetPath(value: string): boolean {
  return (
    value.length <= 2048 &&
    STORED_ASSET_PATH_REGEX.test(value) &&
    !value.split("/").some((segment) => segment === "." || segment === "..")
  );
}

export const storedAssetPathSchema = z
  .string()
  .max(2048)
  .refine(isStoredAssetPath, STORED_ASSET_PATH_ERROR);
