import { CalendarClock, Phone, Users } from "lucide-react";
import { useState } from "react";

import { useCanEdit } from "../../../lib/adminAuth";
import { formatIstTime, todayIst } from "../../../lib/istDate";
import type { Booking, BookingSettings } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Dialog } from "../../../shared/ui/Dialog";
import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  Input,
  PageHeader,
  Select,
  Switch,
  TableWrap,
} from "../../../shared/ui/ui";
import {
  useBookingAvailability,
  useBookings,
  useBookingSettings,
  useCancelBooking,
  useConfirmBooking,
  useCreateBooking,
  useNoShowBooking,
  useSaveBookingSettings,
  useSeatBooking,
  useTablesForBooking,
} from "../queries";

const NO_BOOKINGS: Booking[] = [];

function formatDate(date: string) {
  // bookingDate is a plain "YYYY-MM-DD" IST calendar date with no time component - format it as
  // UTC midnight so the browser's own timezone can never shift which day is shown.
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function formatSlot(slotStart: string, slotEnd: string) {
  return `${formatIstTime(slotStart)} - ${formatIstTime(slotEnd)}`;
}

const STATUS_TONE: Record<Booking["status"], BadgeTone> = {
  pending: "amber",
  confirmed: "blue",
  seated: "green",
  cancelled: "gray",
  no_show: "red",
};

const STATUS_LABEL: Record<Booking["status"], string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  seated: "Seated",
  cancelled: "Cancelled",
  no_show: "No-show",
};

function SettingsCard({ canEdit }: { canEdit: boolean }) {
  const settings = useBookingSettings();
  const save = useSaveBookingSettings();
  const [draft, setDraft] = useState<BookingSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = draft ?? settings.data;
  if (!form) return null;

  const set = (patch: Partial<BookingSettings>) => {
    setSaved(false);
    setDraft({ ...form, ...patch });
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Booking settings</h2>
        <div className="flex items-center gap-3">
          <label htmlFor="booking-enabled" className="text-sm font-medium text-slate-700">
            Take table bookings
          </label>
          <Switch id="booking-enabled" disabled={!canEdit} checked={form.enabled} onChange={(v) => set({ enabled: v })} />
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Opens at" htmlFor="booking-open">
          <Input
            id="booking-open"
            type="time"
            disabled={!canEdit}
            value={form.openTime}
            onChange={(e) => set({ openTime: e.target.value })}
          />
        </Field>
        <Field label="Closes at" htmlFor="booking-close">
          <Input
            id="booking-close"
            type="time"
            disabled={!canEdit}
            value={form.closeTime}
            onChange={(e) => set({ closeTime: e.target.value })}
          />
        </Field>
        <Field label="Slot length (minutes)" htmlFor="booking-slot-minutes">
          <Input
            id="booking-slot-minutes"
            type="number"
            min={5}
            max={240}
            disabled={!canEdit}
            value={form.slotMinutes}
            onChange={(e) => set({ slotMinutes: Number(e.target.value) })}
          />
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      {canEdit && (
        <div className="mt-3 flex items-center gap-3">
          <Button
            type="button"
            disabled={save.isPending || !draft}
            onClick={async () => {
              setError(null);
              try {
                await save.mutateAsync(form);
                setDraft(null);
                setSaved(true);
              } catch (err) {
                setError(extractErrorMessage(err));
              }
            }}
          >
            Save settings
          </Button>
          {saved && <span className="text-sm font-medium text-emerald-700">Saved</span>}
        </div>
      )}
    </Card>
  );
}

function NewBookingDialog({ date, onClose }: { date: string; onClose: () => void }) {
  const availability = useBookingAvailability(date);
  const create = useCreateBooking();
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [slotStart, setSlotStart] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const openSlots = (availability.data ?? []).filter((s) => s.available);

  return (
    <Dialog
      open
      onClose={onClose}
      title="New booking"
      description={formatDate(date)}
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (!slotStart) {
          setError("Choose a time slot");
          return;
        }
        try {
          await create.mutateAsync({
            customerName: customerName.trim(),
            phone: phone.trim(),
            partySize,
            bookingDate: date,
            slotStart,
            notes: notes.trim() || undefined,
          });
          onClose();
        } catch (err) {
          setError(extractErrorMessage(err));
        }
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            Book table
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Guest name" htmlFor="booking-name">
          <Input id="booking-name" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </Field>
        <Field label="Contact number" htmlFor="booking-phone" hint="Mandatory - used to confirm the booking">
          <Input
            id="booking-phone"
            required
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoFocus={false}
          />
        </Field>
        <Field label="Party size" htmlFor="booking-party">
          <Input
            id="booking-party"
            type="number"
            min={1}
            max={100}
            required
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
          />
        </Field>
        <Field label="Time slot" htmlFor="booking-slot">
          <Select id="booking-slot" required value={slotStart} onChange={(e) => setSlotStart(e.target.value)}>
            <option value="" disabled>
              {availability.isLoading ? "Loading slots..." : openSlots.length === 0 ? "No slots available" : "Choose a slot"}
            </option>
            {openSlots.map((s) => (
              <option key={s.slotStart} value={s.slotStart}>
                {s.slotStart} - {s.slotEnd} ({s.remaining} table{s.remaining === 1 ? "" : "s"} free)
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" htmlFor="booking-notes" className="sm:col-span-2">
          <Input id="booking-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
    </Dialog>
  );
}

function ConfirmDialog({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const tables = useTablesForBooking(booking._id);
  const confirm = useConfirmBooking();
  const [tableId, setTableId] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Confirm ${booking.customerName}'s booking`}
      description={formatSlot(booking.slotStart, booking.slotEnd)}
      size="sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (!tableId) {
          setError("Choose a table");
          return;
        }
        try {
          await confirm.mutateAsync({ id: booking._id, tableId });
          onClose();
        } catch (err) {
          setError(extractErrorMessage(err));
        }
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={confirm.isPending}>
            Confirm booking
          </Button>
        </>
      }
    >
      <Field label="Table" htmlFor="confirm-table">
        <Select id="confirm-table" required value={tableId} onChange={(e) => setTableId(e.target.value)}>
          <option value="" disabled>
            {tables.isLoading ? "Loading tables..." : "Choose a table"}
          </option>
          {(tables.data ?? []).map((t) => (
            <option key={t.tableId} value={t.tableId} disabled={!t.available}>
              {t.code}
              {t.available ? "" : " (booked in this slot)"}
            </option>
          ))}
        </Select>
      </Field>
      <ErrorText>{error}</ErrorText>
    </Dialog>
  );
}

function BookingRow({ booking, canEdit }: { booking: Booking; canEdit: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const cancel = useCancelBooking();
  const seat = useSeatBooking();
  const noShow = useNoShowBooking();
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <>
      <tr className="border-t border-slate-100">
        <td className="tabular-nums whitespace-nowrap">{formatSlot(booking.slotStart, booking.slotEnd)}</td>
        <td>{booking.customerName}</td>
        <td className="tabular-nums whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            <Phone size={14} className="text-slate-400" aria-hidden="true" />
            {booking.phoneDisplay ?? booking.phone}
          </span>
        </td>
        <td className="text-right tabular-nums">
          <span className="inline-flex items-center gap-1">
            <Users size={14} className="text-slate-400" aria-hidden="true" />
            {booking.partySize}
          </span>
        </td>
        <td>{booking.tableCode ?? "-"}</td>
        <td>
          <Badge tone={STATUS_TONE[booking.status]} dot>
            {STATUS_LABEL[booking.status]}
          </Badge>
        </td>
        {canEdit && (
          <td>
            <div className="flex flex-wrap justify-end gap-2">
              {(booking.status === "pending" || booking.status === "confirmed") && (
                <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
                  {booking.status === "confirmed" ? "Change table" : "Confirm"}
                </Button>
              )}
              {booking.status === "confirmed" && (
                <Button size="sm" variant="secondary" onClick={() => run(() => seat.mutateAsync(booking._id))}>
                  Seat
                </Button>
              )}
              {(booking.status === "pending" || booking.status === "confirmed") && (
                <Button size="sm" variant="ghost" onClick={() => run(() => noShow.mutateAsync(booking._id))}>
                  No-show
                </Button>
              )}
              {(booking.status === "pending" || booking.status === "confirmed") && (
                <Button size="sm" variant="ghost" onClick={() => run(() => cancel.mutateAsync({ id: booking._id }))}>
                  Cancel
                </Button>
              )}
            </div>
          </td>
        )}
      </tr>
      {error && (
        <tr>
          <td colSpan={7}>
            <ErrorText>{error}</ErrorText>
          </td>
        </tr>
      )}
      {confirming && <ConfirmDialog booking={booking} onClose={() => setConfirming(false)} />}
    </>
  );
}

export default function Bookings() {
  const canEdit = useCanEdit("bookings");
  const [date, setDate] = useState(todayIst());
  const [creating, setCreating] = useState(false);
  const bookings = useBookings(date);
  const list = (bookings.data?.bookings ?? NO_BOOKINGS).filter((b) => b.status !== "cancelled");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Table Bookings"
        description="Bookings are taken over the phone or in person. A confirmed booking holds its table until the guest is seated."
      />
      <SettingsCard canEdit={canEdit} />
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Field label="Date" htmlFor="booking-date" className="w-48">
            <Input id="booking-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {canEdit && (
            <Button type="button" onClick={() => setCreating(true)}>
              New booking
            </Button>
          )}
        </div>
        <ErrorText>{bookings.error ? extractErrorMessage(bookings.error) : null}</ErrorText>
        {list.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No bookings for this date" />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Guest</th>
                  <th>Phone</th>
                  <th className="text-right">Party</th>
                  <th>Table</th>
                  <th>Status</th>
                  {canEdit && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <BookingRow key={b._id} booking={b} canEdit={canEdit} />
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      {creating && <NewBookingDialog date={date} onClose={() => setCreating(false)} />}
    </div>
  );
}
