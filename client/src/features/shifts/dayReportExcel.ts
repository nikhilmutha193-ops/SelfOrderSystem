import { TENDER_LABELS, type DayReport, type NamedAmount, type TenderMethod } from "../../lib/types";
import { DATE_TIME, MONEY, sheet, type AnySheet } from "../../shared/export/excel";

const TYPE_LABELS: Record<string, string> = {
  "dine-in": "Dine-in",
  takeaway: "Take away",
  delivery: "Delivery",
};

interface Line {
  label: string;
  amount: number | null;
  count?: number | null;
}

function breakdown(title: string, rows: NamedAmount[], label: (name: string) => string = (n) => n): Line[] {
  return [
    { label: "", amount: null },
    { label: title, amount: null },
    ...rows.map((r) => ({
      label: label(r.name),
      amount: r.amount,
      count: r.count,
    })),
  ];
}

export function dayReportSheets(r: DayReport): AnySheet[] {
  const t = r.totals;
  const summary: Line[] = [
    { label: `Business day ${r.businessDate}`, amount: null },
    {
      label: `Bills ${r.invoiceRange.first ?? ""} to ${r.invoiceRange.last ?? ""}`.trim(),
      amount: null,
      count: t.bills,
    },
    { label: "Gross sales", amount: t.gross },
    { label: "Discounts", amount: -t.discounts },
    { label: "Service charge", amount: t.serviceCharge },
    { label: "Packaging", amount: t.packagingCharge ?? 0 },
    { label: "Taxable value", amount: t.taxable },
    ...r.taxes.map((x) => ({
      label: `${x.name} ${x.percent}%`,
      amount: x.amount,
    })),
    { label: "Round off", amount: t.roundOff },
    { label: "Net sales", amount: t.net },
    { label: "Voided bills", amount: r.voids.amount, count: r.voids.count },
    {
      label: "Cancelled bills",
      amount: r.cancelledBills.amount,
      count: r.cancelledBills.count,
    },
    {
      label: "Complimentary",
      amount: r.complimentary.value,
      count: r.complimentary.count,
    },
    ...breakdown("By order type", r.byOrderType, (n) => TYPE_LABELS[n] ?? n),
    ...breakdown("By payment", r.byPaymentMethod, (n) => TENDER_LABELS[n as TenderMethod] ?? n),
    ...breakdown("By category", r.byCategory),
  ];

  const sheets: AnySheet[] = [
    sheet({
      name: "Summary",
      rows: summary,
      columns: [
        { header: "Item", value: (l) => l.label, width: 32 },
        {
          header: "Amount (₹)",
          value: (l) => l.amount,
          format: MONEY,
          width: 14,
        },
        { header: "Count", value: (l) => l.count ?? null },
      ],
    }),
  ];

  const exceptions = [
    ...r.voids.bills.map((b) => ({ kind: "Voided", ...b })),
    ...r.cancelledBills.bills.map((b) => ({ kind: "Cancelled", ...b })),
  ];
  if (exceptions.length > 0) {
    sheets.push(
      sheet({
        name: "Voids and cancels",
        rows: exceptions,
        columns: [
          { header: "Type", value: (b) => b.kind },
          { header: "Invoice", value: (b) => b.invoiceNumber ?? "", width: 22 },
          { header: "Amount", value: (b) => b.amount, format: MONEY },
          { header: "Reason", value: (b) => b.reason ?? "", width: 36 },
        ],
      })
    );
  }

  if (r.shifts.length > 0) {
    sheets.push(
      sheet({
        name: "Shifts",
        rows: r.shifts,
        columns: [
          {
            header: "Opened",
            value: (s) => new Date(s.openedAt),
            format: DATE_TIME,
            width: 18,
          },
          {
            header: "Closed",
            value: (s) => (s.closedAt ? new Date(s.closedAt) : null),
            format: DATE_TIME,
            width: 18,
          },
          { header: "By", value: (s) => s.openedByName ?? "" },
          { header: "Float", value: (s) => s.openingFloat, format: MONEY },
          {
            header: "Expected cash",
            value: (s) => s.expectedCash,
            format: MONEY,
            width: 14,
          },
          {
            header: "Counted cash",
            value: (s) => s.countedCash,
            format: MONEY,
            width: 14,
          },
          { header: "Variance", value: (s) => s.variance, format: MONEY },
        ],
      })
    );
  }

  if (r.unsettled.length > 0) {
    sheets.push(
      sheet({
        name: "Unpaid",
        rows: r.unsettled,
        columns: [
          { header: "Customer", value: (u) => u.customerName, width: 22 },
          { header: "Status", value: (u) => u.status },
          { header: "Invoice", value: (u) => u.invoiceNumber ?? "", width: 22 },
          {
            header: "Since",
            value: (u) => new Date(u.checkinTime),
            format: DATE_TIME,
            width: 18,
          },
          { header: "Amount", value: (u) => u.amount, format: MONEY },
        ],
      })
    );
  }

  return sheets;
}
