import { useState } from "react";

import { cashSuggestions } from "../../../lib/cash";
import { extractErrorMessage } from "../../../shared/api/client";
import { Dialog } from "../../../shared/ui/Dialog";
import { Badge, Button, ErrorText, Input, Select } from "../../../shared/ui/ui";
import { AmountChips } from "../../shifts/components/shiftBits";
import { CASH_MOVEMENT_PRESETS, OPENING_FLOAT_PRESETS, rupees, when } from "../../shifts/format";
import { useCashMovement, useCloseShift, useOpenShift, useTodayShifts } from "../../shifts/queries";

/**
 * The cashier's cash drawer for today: open the shift with the float, record cash taken in or out, and count the
 * drawer to close it. Only today's shifts are listed here; the full history is in Admin → Cash shifts.
 */
export function CashDrawerDialog({
  open,
  onClose,
  canEdit,
}: {
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
}) {
  const today = useTodayShifts(open);
  const openShift = useOpenShift();
  const cash = useCashMovement();
  const closeShift = useCloseShift();

  const [float, setFloat] = useState("");
  const [moveType, setMoveType] = useState<"in" | "out">("out");
  const [moveAmount, setMoveAmount] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const shifts = today.data ?? [];
  const current = shifts.find((s) => s.isOpen) ?? null;
  const closedToday = shifts.filter((s) => !s.isOpen);
  const expected = current ? Math.round(current.expectedCash ?? 0) : null;
  const difference = current && counted !== "" ? Number(counted) - (current.expectedCash ?? 0) : null;

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setError(null);
    try {
      await action();
      after?.();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Cash drawer · today"
      description="Cash for today only. The full history of shifts is in Admin → Cash shifts."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-5 text-sm">
        <ErrorText>{error ?? (today.error ? extractErrorMessage(today.error) : null)}</ErrorText>

        {!current ? (
          <section>
            <h3 className="mb-2 text-base font-semibold text-slate-900">
              {closedToday.length > 0 ? "Today's shift is closed" : "No shift is open"}
            </h3>
            {canEdit ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () => openShift.mutateAsync(Number(float) || 0),
                    () => setFloat(""),
                  );
                }}
              >
                <label className="text-sm font-medium text-slate-700">
                  Cash in the drawer now (₹)
                  <Input
                    className="mt-1 !w-44"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    placeholder="0"
                    value={float}
                    onChange={(e) => setFloat(e.target.value)}
                  />
                </label>
                <AmountChips values={OPENING_FLOAT_PRESETS} onPick={(v) => setFloat(String(v))} />
                <div>
                  <Button type="submit" loading={openShift.isPending}>
                    Open shift
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-slate-500">You can view the drawer but not open a shift.</p>
            )}
          </section>
        ) : (
          <>
            <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Shift open</h3>
                  <p className="text-slate-500">
                    Since {when(current.openedAt)}
                    {current.openedByName && ` by ${current.openedByName}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-slate-500">Expected in drawer</p>
                  <p className="text-2xl font-bold tabular-nums text-slate-900">{rupees(current.expectedCash)}</p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <dt className="text-slate-500">Opening float</dt>
                  <dd className="font-semibold tabular-nums">{rupees(current.openingFloat)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Cash sales</dt>
                  <dd className="font-semibold tabular-nums">{rupees(current.cashSales)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Cash in</dt>
                  <dd className="font-semibold tabular-nums">{rupees(current.cashIn)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Cash out</dt>
                  <dd className="font-semibold tabular-nums">{rupees(current.cashOut)}</dd>
                </div>
                {(current.cashRefunds ?? 0) > 0 && (
                  <div>
                    <dt className="text-slate-500">Cash refunds</dt>
                    <dd className="font-semibold tabular-nums">{rupees(current.cashRefunds)}</dd>
                  </div>
                )}
              </dl>
              {current.cashMovements.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 border-t border-slate-200 pt-3">
                  {current.cashMovements.map((m, i) => (
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
            </section>

            {canEdit && (
              <div className="grid gap-5 md:grid-cols-2">
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(
                      () =>
                        cash.mutateAsync({ type: moveType, amount: Number(moveAmount), reason: moveReason.trim() }),
                      () => {
                        setMoveAmount("");
                        setMoveReason("");
                      },
                    );
                  }}
                >
                  <h3 className="text-base font-semibold text-slate-900">Cash in or out</h3>
                  <div className="flex gap-2">
                    <Select
                      aria-label="Cash in or out"
                      className="!w-32"
                      value={moveType}
                      onChange={(e) => setMoveType(e.target.value as "in" | "out")}
                    >
                      <option value="out">Cash out</option>
                      <option value="in">Cash in</option>
                    </Select>
                    <Input
                      aria-label="Amount"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      placeholder="Amount"
                      value={moveAmount}
                      onChange={(e) => setMoveAmount(e.target.value)}
                    />
                  </div>
                  <AmountChips values={CASH_MOVEMENT_PRESETS} onPick={(v) => setMoveAmount(String(v))} />
                  <Input
                    aria-label="Reason"
                    placeholder="Reason, e.g. bought milk"
                    maxLength={120}
                    value={moveReason}
                    onChange={(e) => setMoveReason(e.target.value)}
                  />
                  <div>
                    <Button type="submit" loading={cash.isPending} disabled={!moveAmount || moveReason.trim().length < 3}>
                      Record
                    </Button>
                  </div>
                </form>

                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(
                      () => closeShift.mutateAsync({ countedCash: Number(counted), note: note.trim() || undefined }),
                      () => {
                        setCounted("");
                        setNote("");
                      },
                    );
                  }}
                >
                  <h3 className="text-base font-semibold text-slate-900">Close shift</h3>
                  <label className="text-sm font-medium text-slate-700">
                    Cash counted in the drawer (₹)
                    <Input
                      className="mt-1"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={counted}
                      onChange={(e) => setCounted(e.target.value)}
                    />
                  </label>
                  {expected !== null && (
                    <AmountChips values={[expected, ...cashSuggestions(expected)]} onPick={(v) => setCounted(String(v))} />
                  )}
                  {difference !== null && (
                    <p
                      className={`font-semibold ${
                        Math.abs(difference) < 0.01 ? "text-green-700" : difference < 0 ? "text-red-600" : "text-amber-700"
                      }`}
                    >
                      {Math.abs(difference) < 0.01
                        ? "Drawer matches"
                        : difference < 0
                          ? `Short by ${rupees(-difference)}`
                          : `Over by ${rupees(difference)}`}
                    </p>
                  )}
                  <Input
                    aria-label="Note"
                    placeholder="Note (optional)"
                    maxLength={200}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div>
                    <Button type="submit" loading={closeShift.isPending} disabled={counted === ""}>
                      Close shift
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}

        {closedToday.length > 0 && (
          <section>
            <h3 className="mb-2 text-base font-semibold text-slate-900">Closed today</h3>
            <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
              {closedToday.map((s) => (
                <li key={s._id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="text-slate-600">
                    {when(s.openedAt)} to {when(s.closedAt)}
                    {s.closedByName && <span className="text-slate-400"> · {s.closedByName}</span>}
                  </span>
                  <span className="flex items-center gap-3 tabular-nums">
                    <span>
                      Counted {rupees(s.countedCash)} of {rupees(s.expectedCash)}
                    </span>
                    <Badge tone={Math.abs(s.variance ?? 0) < 0.01 ? "green" : (s.variance ?? 0) < 0 ? "red" : "amber"}>
                      {Math.abs(s.variance ?? 0) < 0.01 ? "Matches" : rupees(s.variance)}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  );
}
