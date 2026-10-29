import { IPaymentGateway } from "../../models/PaymentGateway";
import { openSecret } from "../../utils/secretBox";
import { PaymentsRepository } from "./payments.repository";
import { RazorpayCredentials } from "./razorpay";

// Reading the gateway account. Kept apart from payments.service so the orders module can ask
// "can guests pay online?" without importing the payment flow (which imports orders).

export function credentialsOf(gateway: IPaymentGateway | null): RazorpayCredentials | null {
  if (!gateway?.keyId) return null;
  const keySecret = openSecret(gateway.keySecretEnc);
  return keySecret ? { keyId: gateway.keyId, keySecret } : null;
}

/** Whether guests can pay online: the gateway is switched on and its keys can be read. */
export async function onlinePaymentAvailable(restaurantId: string): Promise<boolean> {
  const gateway = await new PaymentsRepository(restaurantId).findGateway();
  return !!gateway?.enabled && credentialsOf(gateway) !== null;
}
