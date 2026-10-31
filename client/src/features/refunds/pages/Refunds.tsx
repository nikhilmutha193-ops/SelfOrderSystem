import { RotateCcw, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { REFUND_REASON_LABELS, TENDER_LABELS, type Refund } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { DATE_TIME, MONEY, sheet } from "../../../shared/export/excel";
import { ExcelButton } from "../../../shared/ui/ExcelButton";
import {
  Badge,
  Card,
  CardHeader,
  ErrorText,
  Input,
  Page,
  PageHeader,
  StatCard,
  TableWrap,
} from "../../../shared/ui/ui";
import { useRefundList } from "../queries";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const iso = (d: Date) => d.toLocaleDateString("en-CA");

function refundSheet(rows: Refund[]) {
  return [
    sheet({
      name: "Refunds",
      rows,
      columns: [
        { header: "When", value: (r: Refund) => new Date(r.createdAt), format: DATE_TIME, width: 18 },
        { header: "Invoice", value: (r) => r.invoiceNumber ?? "", width: 22 },
        { header: "Customer", value: (r) => r.customerName, width: 20 },
        { header: "Items", value: (r) => r.items.map((i) => `${i.quantity} x ${i.foodName}`).join(", "), width: 36 },
        { header: "Amount", value: (r) => r.amount, format: MONEY, width: 12 },
        { header: "Method", value: (r) => TENDER_LABELS[r.method] },
        { header: "Reason", value: (r) => REFUND_REASON_LABELS[r.reason], width: 24 },
        { header: "Note", value: (r) => r.note ?? "", width: 30 },
        { header: "By", value: (r) => r.createdByName, width: 16 },
      ],
    }),
  ];
}

export default function Refunds() {
  const now = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(now));
  const list = useRefundList(from || undefined, to || undefined);
  const data = list.data;

  return (
    <Page>
      <PageHeader
        title="Refunds"
        description="Money given back on paid bills. Cash refunds come out of the cash drawer, so the shift count stays right."
        actions={
          <ExcelButton
            fileName={`refunds-${from}-to-${to}`}
            disabled={!data || data.count === 0}
            sheets={() => (data ? refundSheet(data.refunds) : [])}
          />
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">
            From
            <Input
              className="mt-1"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            To
            <Input
              className="mt-1"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
      </Card>

      <ErrorText>{list.error ? extractErrorMessage(list.error) : null}</ErrorText>

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Refunded" value={rupees(data.total)} icon={RotateCcw} tone="red" />
            <StatCard label="Refunds" value={data.count} icon={Wallet} tone="violet" />
            {(Object.entries(data.byMethod) as [keyof typeof TENDER_LABELS, number][])
              .slice(0, 2)
              .map(([method, amount]) => (
                <StatCard key={method} label={`By ${TENDER_LABELS[method]}`} value={rupees(amount)} tone="amber" />
              ))}
          </div>

          <Card>
            <CardHeader title="All refunds" description={`${data.count} in this period`} />
            {data.refunds.length === 0 ? (
              <p className="text-sm text-slate-400">No refunds in this period.</p>
            ) : (
              <TableWrap>
                <table className="w-full min-w-[44rem] text-sm">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Bill</th>
                      <th>What</th>
                      <th>Reason</th>
                      <th>By</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.refunds.map((r) => (
                      <tr key={r._id} className="border-t border-slate-100 align-top">
                        <td className="text-slate-600">{new Date(r.createdAt).toLocaleString()}</td>
                        <td>
                          <Link
                            className="font-medium text-orange-700 hover:underline"
                            to={`/admin/orders/${r.orderId}`}
                          >
                            {r.invoiceNumber ?? "Order"}
                          </Link>
                          <span className="block text-xs text-slate-500">{r.customerName}</span>
                        </td>
                        <td className="text-slate-700">
                          {r.items.length > 0
                            ? r.items.map((i) => `${i.quantity} × ${i.foodName}`).join(", ")
                            : "Amount refund"}
                          {r.note && <span className="block text-xs text-slate-500">{r.note}</span>}
                        </td>
                        <td>
                          <Badge tone="gray">{REFUND_REASON_LABELS[r.reason]}</Badge>
                        </td>
                        <td className="text-slate-600">{r.createdByName}</td>
                        <td className="text-right font-semibold tabular-nums">
                          {rupees(r.amount)}
                          <span className="block text-xs font-normal text-slate-500">{TENDER_LABELS[r.method]}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>
        </>
      )}
    </Page>
  );
}
