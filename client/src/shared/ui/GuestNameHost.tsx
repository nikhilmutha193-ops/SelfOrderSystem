import { useState, useSyncExternalStore } from "react";

import { Dialog } from "./Dialog";
import { Button, Input } from "./ui";

interface Pending {
  id: number;
  tableLabel?: string;
  resolve: (name: string) => void;
}

let queue: Pending[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/**
 * Asks staff for the guest's name when they place an order for a table (POS and captain app). Resolves with the name,
 * or "" when staff skip it (or close the box).
 */
export function askGuestName(tableLabel?: string): Promise<string> {
  return new Promise((resolve) => {
    queue = [...queue, { id: nextId++, tableLabel, resolve }];
    notify();
  });
}

function settle(id: number, name: string) {
  const pending = queue.find((p) => p.id === id);
  if (!pending) return;
  queue = queue.filter((p) => p.id !== id);
  pending.resolve(name.trim());
  notify();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const current = () => queue[0] ?? null;

export default function GuestNameHost() {
  const pending = useSyncExternalStore(subscribe, current, current);
  if (!pending) return null;
  return <GuestNameForm key={pending.id} pending={pending} />;
}

function GuestNameForm({ pending }: { pending: Pending }) {
  const [name, setName] = useState("");
  return (
    <Dialog
      open
      size="sm"
      title="Guest name"
      description={pending.tableLabel ? `${pending.tableLabel} - you can skip this.` : "You can skip this."}
      onClose={() => settle(pending.id, "")}
      onSubmit={(e) => {
        e.preventDefault();
        settle(pending.id, name);
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => settle(pending.id, "")}>
            Skip
          </Button>
          <Button type="submit">Continue</Button>
        </>
      }
    >
      <Input
        autoFocus
        aria-label="Guest name"
        placeholder="Guest name"
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
    </Dialog>
  );
}
