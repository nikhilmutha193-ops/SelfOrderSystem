import type { CartLine } from "../../lib/types";

export function cartCount(cart: CartLine[]) {
  return cart.reduce((n, l) => n + l.quantity, 0);
}

export function cartTotal(cart: CartLine[]) {
  return cart.reduce((sum, l) => sum + l.price * l.quantity, 0);
}
