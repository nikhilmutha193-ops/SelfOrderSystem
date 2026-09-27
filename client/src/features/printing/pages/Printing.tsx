import { useCanEdit } from "../../../lib/adminAuth";
import type { PrintAgent, Printer, Station } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { ErrorText, PageHeader } from "../../../shared/ui/ui";
import { AgentsCard } from "../components/AgentsCard";
import { JobsCard } from "../components/JobsCard";
import { PrintersCard } from "../components/PrintersCard";
import { StationsCard } from "../components/StationsCard";
import { usePrintAgents, usePrinters, useStations } from "../queries";

const NO_STATIONS: Station[] = [];
const NO_AGENTS: PrintAgent[] = [];
const NO_PRINTERS: Printer[] = [];

export default function Printing() {
  const canEdit = useCanEdit("printing");
  const stations = useStations();
  const agents = usePrintAgents();
  const printers = usePrinters();
  const loadError = stations.error ?? agents.error ?? printers.error;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Printers & Stations"
        description={
          <>Print KOTs at the right kitchen station and bills at the counter, straight to thermal printers.</>
        }
      />
      <ErrorText>{loadError ? extractErrorMessage(loadError) : null}</ErrorText>
      <div className="grid gap-6 lg:grid-cols-2">
        <StationsCard stations={stations.data ?? NO_STATIONS} canEdit={canEdit} />
        <AgentsCard agents={agents.data ?? NO_AGENTS} canEdit={canEdit} />
      </div>
      <PrintersCard
        printers={printers.data ?? NO_PRINTERS}
        agents={agents.data ?? NO_AGENTS}
        stations={stations.data ?? NO_STATIONS}
        canEdit={canEdit}
      />
      <JobsCard canEdit={canEdit} />
    </div>
  );
}
