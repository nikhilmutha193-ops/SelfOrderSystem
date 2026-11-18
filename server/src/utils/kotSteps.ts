import type { IKotSettings } from "../models/Restaurant";

/**
 * The steps a dish goes through in the kitchen: Waiting, then Cooking (preparing), Ready, Served.
 * The owner can switch off Cooking, Ready or Served, and the dish skips it:
 *  - no Cooking: Waiting goes straight to Ready (or Served when Ready is off too)
 *  - no Ready: Cooking goes straight to Served
 *  - no Served: marking a dish Ready also serves it (Ready is the last step)
 * Ready and Served can't both be off, or a dish would never finish.
 */
export interface KotSteps {
  preparing: boolean;
  ready: boolean;
  served: boolean;
}

export function kotStepsOf(settings: Partial<Pick<IKotSettings, "steps">> | null | undefined): KotSteps {
  return {
    preparing: settings?.steps?.preparing !== false,
    ready: settings?.steps?.ready !== false,
    served: settings?.steps?.served !== false,
  };
}
