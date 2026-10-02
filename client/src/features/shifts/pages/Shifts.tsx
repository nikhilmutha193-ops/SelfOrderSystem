import { useState } from "react";

import { useCanEdit } from "../../../lib/adminAuth";
import { cashSuggestions } from "../../../lib/cash";
import { extractErrorMessage } from "../../../shared/api/client";
import { Badge, Button, Card, ErrorText, Input, PageHeader, Select, TableWrap } from "../../../shared/ui/ui";
import { useCashMovement, useCloseShift, useCurrentShift, useOpenShift, useShiftHistory } from "../queries";

const rupees = (n: number | undefined | null) => `₹${(n ?? 0).toFixed(2)}`;

const OPENING_FLOAT_PRESETS = [500, 1000, 2000, 5000, 10000];
const CASH_MOVEMENT_PRESETS = [50, 100, 200, 500, 1000, 2000];

function when(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "-";
}

function AmountChips({ values, onPick }: { values: number[]; onPick: (v: number) => void }) {
  if (values.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(v)}
          className="min-h-[36px] rounded-full border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 tabular-nums hover:bg-slate-100"
        >
          ₹{v}
        </button>
      ))}
    </div>
  );
}

export default function Shifts() {
  const canEdit = useCanEdit("dayClose");
  const current = useCurrentShift();
  const history = useShiftHistory();
  const openShift = useOpenShift();
  const cash = useCashMovement();
  const closeShift = useCloseShift();

  const [float, setFloat] = useState("0");
  const [moveType, setMoveType] = useState<"in" | "out">("out");
  const [moveAmount, setMoveAmount] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setError(null);
    try {
      await action();
      after?.();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const shift = current.data;
  const variancePreview = shift && counted !== "" ? Number(counted) - (shift.expectedCash ?? 0) : null;
  // Cash is physical, so round the expected figure to whole rupees before offering it as a chip -
  // the first value is the exact expected amount, the rest are round-up alternatives.
  const expectedRounded = shift ? Math.round(shift.expectedCash ?? 0) : null;
  const closeChipValues = expectedRounded !== null ? [expectedRounded, ...cashSuggestions(expectedRounded)] : [];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Cash shifts"
        description={
          <>
            Open a shift with the cash in the drawer, record cash taken in or out, and count the drawer when you close.
          </>
        }
      />

      <ErrorText>{error ?? (current.error ? extractErrorMessage(current.error) : null)}</ErrorText>

      {!shift ? (
        <Card>
          <h2 className="mb-4 text-base font-semibold text-slate-900">No shift is open</h2>
          {canEdit ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => openShift.mutateAsync(Number(float) || 0));
              }}
            >
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm font-medium text-slate-700">
                  Cash in the drawer now (₹)
                  <Input
                    id="shift-float"
                    className="mt-1 !w-40"
                    type="number"
                    min={0}
                    step="0.01"
                    value={float}
                    onChange={(e) => setFloat(e.target.value)}
                  />
                </label>
                <Button type="submit" disabled={openShift.isPending}>
                  Open shift
                </Button>
              </div>
              <AmountChips values={OPENING_FLOAT_PRESETS} onPick={(v) => setFloat(String(v))} />
            </form>
          ) : (
            <p className="text-sm text-slate-500">You can view shifts but not open one.</p>
          )}
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Shift open</h2>
                <p className="text-sm text-slate-500">
                  Since {when(shift.openedAt)}
                  {shift.openedByName && ` by ${shift.openedByName}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-500">Expected in drawer</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{rupees(shift.expectedCash)}</p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-slate-500">Opening float</dt>
                <dd className="font-semibold tabular-nums">{rupees(shift.openingFloat)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Cash sales</dt>
                <dd className="font-semibold tabular-nums">{rupees(shift.cashSales)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Cash in</dt>
                <dd className="font-semibold tabular-nums">{rupees(shift.cashIn)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Cash out</dt>
                <dd className="font-semibold tabular-nums">{rupees(shift.cashOut)}</dd>
              </div>
            </dl>
            {shift.cashMovements.length > 0 && (
              <ul className="mt-4 flex flex-col gap-1 border-t border-slate-100 pt-3 text-sm">
                {shift.cashMovements.map((m, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="text-slate-600">
                      {m.type === "in" ? "Cash in" : "Cash out"}: {m.reason}
                      {m.byName && <span className="text-slate-400"> · {m.byName}</span>}
                    </span>
                    <span className="tabular-nums">
                      {m.type === "in" ? "+" : "-"}
                      {rupees(m.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {canEdit && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <h2 className="mb-4 text-base font-semibold text-slate-900">Cash in or out</h2>
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(
                      () => cash.mutateAsync({ type: moveType, amount: Number(moveAmount), reason: moveReason.trim() }),
                      () => {
                        setMoveAmount("");
                        setMoveReason("");
                      }
                    );
                  }}
                >
                  <div className="flex gap-2">
                    <Select
                      id="cash-type"
                      className="!w-32"
                      value={moveType}
                      onChange={(e) => setMoveType(e.target.value as "in" | "out")}
                    >
                      <option value="out">Cash out</option>
                      <option value="in">Cash in</option>
                    </Select>
                    <Input
                      id="cash-amount"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Amount"
                      value={moveAmount}
                      onChange={(e) => setMoveAmount(e.target.value)}
                    />
                  </div>
                  <AmountChips values={CASH_MOVEMENT_PRESETS} onPick={(v) => setMoveAmount(String(v))} />
                  <Input
                    id="cash-reason"
                    placeholder="Reason, e.g. bought milk"
                    maxLength={120}
                    value={moveReason}
                    onChange={(e) => setMoveReason(e.target.value)}
                  />
                  <div>
                    <Button type="submit" disabled={cash.isPending}>
                      Record
                    </Button>
                  </div>
                </form>
              </Card>

              <Card>
                <h2 className="mb-4 text-base font-semibold text-slate-900">Close shift</h2>
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(
                      () => closeShift.mutateAsync({ countedCash: Number(counted), note: note.trim() || undefined }),
                      () => {
                        setCounted("");
                        setNote("");
                      }
                    );
                  }}
                >
                  <label className="text-sm font-medium text-slate-700">
                    Cash counted in the drawer (₹)
                    <Input
                      id="shift-counted"
                      className="mt-1"
                      type="number"
                      min={0}
                      step="0.01"
                      value={counted}
                      onChange={(e) => setCounted(e.target.value)}
                    />
                  </label>
                  {closeChipValues.length > 0 && (
                    <AmountChips values={closeChipValues} onPick={(v) => setCounted(String(v))} />
                  )}
                  {variancePreview !== null && (
                    <p
                      className={`text-sm font-semibold ${
                        Math.abs(variancePreview) < 0.01
                          ? "text-green-700"
                          : variancePreview < 0
                            ? "text-red-600"
                            : "text-amber-700"
                      }`}
                    >
                      {Math.abs(variancePreview) < 0.01
                        ? "Drawer matches"
                        : variancePreview < 0
                          ? `Short by ${rupees(-variancePreview)}`
                          : `Over by ${rupees(variancePreview)}`}
                    </p>
                  )}
                  <Input
                    id="shift-note"
                    placeholder="Note (optional)"
                    maxLength={200}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div>
                    <Button type="submit" disabled={closeShift.isPending || counted === ""}>
                      Close shift
                    </Button>
                  </div>
                </form>
              </Card>
            </div>
          )}
        </>
      )}

      <Card>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Recent shifts</h2>
        <TableWrap>
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr>
                <th>Opened</th>
                <th>Closed</th>
                <th className="text-right">Float</th>
                <th className="text-right">Expected</th>
                <th className="text-right">Counted</th>
                <th className="text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {(history.data ?? []).map((s) => (
                <tr key={s._id} className="border-t border-slate-100">
                  <td>{when(s.openedAt)}</td>
                  <td>{s.isOpen ? <Badge tone="amber">Open</Badge> : when(s.closedAt)}</td>
                  <td className="text-right tabular-nums">{rupees(s.openingFloat)}</td>
                  <td className="text-right tabular-nums">{s.isOpen ? "-" : rupees(s.expectedCash)}</td>
                  <td className="text-right tabular-nums">{s.isOpen ? "-" : rupees(s.countedCash)}</td>
                  <td
                    className={`py-1.5 text-right tabular-nums ${
                      (s.variance ?? 0) < 0 ? "text-red-600" : (s.variance ?? 0) > 0 ? "text-amber-700" : ""
                    }`}
                  >
                    {s.isOpen ? "-" : rupees(s.variance)}
                  </td>
                </tr>
              ))}
              {(history.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                    No shifts yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}
