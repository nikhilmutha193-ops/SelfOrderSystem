import type { ServiceFlow } from "./types";
import { usePublicSettings } from "./usePublicSettings";

/** The restaurant's flow: "restaurant" (pay after) or "cafe" (pay first). The restaurant flow until it is known. */
export function useServiceFlow(): ServiceFlow {
  return usePublicSettings()?.serviceFlow ?? "restaurant";
}
