import { IPaymentGateway } from "../../models/PaymentGateway";
import { openSecret } from "../../utils/secretBox";
import { PaymentsRepository } from "./payments.repository";
import { PaytmCredentials } from "./paytm";
import { RazorpayCredentials } from "./razorpay";

// Reading the gateway account. Kept apart from payments.service so the orders module can ask
// "can guests pay online?" without importing the payment flow (which imports orders).

export function credentialsOf(gateway: IPaymentGateway | null): RazorpayCredentials | null {
  if (!gateway?.keyId) return null;
  const keySecret = openSecret(gateway.keySecretEnc);
  return keySecret ? { keyId: gateway.keyId, keySecret } : null;
}

export function paytmCredentialsOf(gateway: IPaymentGateway | null): PaytmCredentials | null {
  if (!gateway?.paytmMid) return null;
  const merchantKey = openSecret(gateway.paytmKeyEnc);
  return merchantKey
    ? {
        mid: gateway.paytmMid,
        merchantKey,
        website: gateway.paytmWebsite || "DEFAULT",
        environment: gateway.paytmEnvironment === "staging" ? "staging" : "production",
      }
    : null;
}

/** Whether guests can pay online: the gateway is switched on and the keys of the chosen provider can be read. */
export async function onlinePaymentAvailable(restaurantId: string): Promise<boolean> {
  const gateway = await new PaymentsRepository(restaurantId).findGateway();
  if (!gateway?.enabled) return false;
  return gateway.provider === "paytm" ? paytmCredentialsOf(gateway) !== null : credentialsOf(gateway) !== null;
}
