import { useCallback } from "react";

import type { PrintingStatus } from "../../lib/types";
import { extractErrorMessage } from "../../shared/api/client";
import { kitchenApi, openPdfInTab } from "../kitchen/api";
import { ordersApi } from "../orders/api";
import { posApi } from "./api";

/**
 * Printing the invoice, or the KOT and the invoice as two separate slips, for an order that was billed or paid.
 * With a printer set up the slips go to it as separate print jobs; without one they open as PDFs in new tabs (the KOT
 * and the invoice in a tab each, so they print on separate pages). Each function must be called straight from a click
 * (a tab can only be opened then) and returns the sentence to show the staff.
 */
export function usePrintSlips(printing: PrintingStatus | undefined) {
  const printInvoice = useCallback(
    async (orderId: string): Promise<string> => {
      const toPrinter = !!printing?.billPrinterConfigured;
      const tab = toPrinter ? null : window.open("", "_blank");
      try {
        if (toPrinter) {
          await ordersApi.printBill(orderId);
          return "Invoice sent to the printer";
        }
        await openPdfInTab(tab, () => ordersApi.invoicePdf(orderId));
        await posApi.invoicePrinted(orderId).catch(() => undefined);
        return "Invoice opened: print it from the new tab";
      } catch (err) {
        tab?.close();
        throw err;
      }
    },
    [printing?.billPrinterConfigured]
  );

  const printBoth = useCallback(
    // `opened`: the two tabs, when the caller had to open them straight from the click before saving and billing.
    async (orderId: string, opened?: [Window | null, Window | null]): Promise<string> => {
      const toPrinter = !!printing?.printersConfigured;
      const kotTab = toPrinter ? null : (opened?.[0] ?? window.open("", "_blank"));
      const invoiceTab = toPrinter ? null : (opened?.[1] ?? window.open("", "_blank"));
      try {
        if (toPrinter) {
          const sent = await posApi.printBoth(orderId);
          if (sent.kots > 0 && sent.invoices > 0) return "KOT and invoice sent to the printer as two slips";
          return sent.kots > 0
            ? "KOT sent to the printer. No printer is set up for bills, so the invoice was not printed."
            : "Invoice sent to the printer. No printer is set up for this KOT.";
        }
        const detail = await ordersApi.get(orderId);
        const rounds = detail.items.map((i) => i.kotRound).filter((r): r is number => typeof r === "number");
        if (rounds.length === 0) {
          kotTab?.close();
          await openPdfInTab(invoiceTab, () => ordersApi.invoicePdf(orderId));
          await posApi.invoicePrinted(orderId).catch(() => undefined);
          return "This order has no KOT yet. The invoice was opened to print.";
        }
        const latest = Math.max(...rounds);
        await Promise.all([
          openPdfInTab(kotTab, () => kitchenApi.kotPdf(orderId, latest)),
          openPdfInTab(invoiceTab, () => ordersApi.invoicePdf(orderId)),
        ]);
        await posApi.invoicePrinted(orderId).catch(() => undefined);
        return "KOT and invoice opened in two tabs: print each as its own slip";
      } catch (err) {
        kotTab?.close();
        invoiceTab?.close();
        throw new Error(extractErrorMessage(err));
      }
    },
    [printing?.printersConfigured]
  );

  return { printInvoice, printBoth };
}
