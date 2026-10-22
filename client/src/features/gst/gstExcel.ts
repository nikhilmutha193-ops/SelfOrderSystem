import type { GstReport } from "../../lib/types";
import { DATE_TIME, MONEY, sheet, type ExcelColumn } from "../../shared/export/excel";

type Invoice = GstReport["invoices"][number];

export function gstSheets(report: GstReport) {
  const taxNames = [...new Set(report.invoices.flatMap((r) => r.taxLines.map((t) => t.name)))];
  const invoiceColumns: ExcelColumn<Invoice>[] = [
    { header: "Invoice", value: (r) => r.invoiceNumber ?? "Legacy bill", width: 22 },
    { header: "Billed", value: (r) => (r.billedAt ? new Date(r.billedAt) : null), format: DATE_TIME, width: 18 },
    { header: "Customer", value: (r) => r.customerName, width: 22 },
    { header: "Customer GSTIN", value: (r) => r.customerGstin, width: 18 },
    { header: "Status", value: (r) => r.status },
    { header: "Gross sales", value: (r) => r.subtotal, format: MONEY },
    { header: "Discount", value: (r) => r.discount, format: MONEY },
    { header: "Service charge", value: (r) => r.serviceCharge, format: MONEY },
    { header: "Packaging", value: (r) => r.packagingCharge, format: MONEY },
    { header: "Taxable value", value: (r) => r.taxableValue, format: MONEY, width: 14 },
    ...taxNames.map((name): ExcelColumn<Invoice> => ({
      header: name,
      value: (r) => r.taxLines.find((t) => t.name === name)?.amount ?? null,
      format: MONEY,
    })),
    { header: "Total GST", value: (r) => r.gst, format: MONEY },
    { header: "Round off", value: (r) => r.roundOff, format: MONEY },
    { header: "Invoice value", value: (r) => r.grandTotal, format: MONEY, width: 14 },
    { header: "Place of supply", value: (r) => r.placeOfSupply, width: 18 },
    { header: "SAC", value: (r) => r.sac },
  ];

  const s = report.summary;
  const summaryRows: { label: string; value: number | string }[] = [
    { label: "Period", value: `${report.from} to ${report.to}` },
    { label: "GSTIN", value: report.gstin || "-" },
    { label: "Invoices", value: s.invoices },
    { label: "Gross sales", value: s.grossSales },
    { label: "Discounts", value: s.discounts },
    { label: "Service charge", value: s.serviceCharge },
    { label: "Packaging", value: s.packaging },
    { label: "Taxable value", value: s.taxableValue },
    { label: "Total GST", value: s.gst },
    { label: "Round off", value: s.roundOff },
    { label: "Invoice value", value: s.invoiceValue },
    { label: "B2B taxable value (customer GSTIN)", value: report.b2b.taxableValue },
    { label: "B2B GST", value: report.b2b.gst },
    { label: "B2C taxable value", value: report.b2c.taxableValue },
    { label: "B2C GST", value: report.b2c.gst },
    { label: `Voided invoices (${report.excluded.voided.count}), not counted`, value: report.excluded.voided.value },
    {
      label: `Cancelled invoices (${report.excluded.cancelled.count}), not counted`,
      value: report.excluded.cancelled.value,
    },
  ];

  return [
    sheet({
      name: "Summary",
      columns: [
        { header: "Item", value: (r: (typeof summaryRows)[number]) => r.label, width: 44 },
        { header: "Value", value: (r) => r.value, format: MONEY, width: 22 },
      ],
      rows: summaryRows,
    }),
    sheet({
      name: "By tax",
      columns: [
        { header: "Tax", value: (r: GstReport["byComponent"][number]) => r.name, width: 14 },
        { header: "Rate %", value: (r) => r.percent },
        { header: "Taxable value", value: (r) => r.taxableValue, format: MONEY, width: 16 },
        { header: "Tax amount", value: (r) => r.amount, format: MONEY, width: 16 },
        { header: "Invoices", value: (r) => r.invoices },
      ],
      rows: report.byComponent,
    }),
    sheet({
      name: "By GST rate",
      columns: [
        { header: "GST rate %", value: (r: GstReport["bySlab"][number]) => r.rate },
        { header: "Taxable value", value: (r) => r.taxableValue, format: MONEY, width: 16 },
        { header: "Total GST", value: (r) => r.gst, format: MONEY, width: 16 },
        { header: "Invoices", value: (r) => r.invoices },
      ],
      rows: report.bySlab,
    }),
    sheet({
      name: "By day",
      columns: [
        { header: "Date", value: (r: GstReport["byDay"][number]) => r.date, width: 14 },
        { header: "Invoices", value: (r) => r.invoices },
        { header: "Taxable value", value: (r) => r.taxableValue, format: MONEY, width: 16 },
        { header: "Total GST", value: (r) => r.gst, format: MONEY, width: 16 },
        { header: "Invoice value", value: (r) => r.invoiceValue, format: MONEY, width: 16 },
      ],
      rows: report.byDay,
    }),
    sheet({ name: "Invoices", columns: invoiceColumns, rows: report.invoices }),
  ];
}
