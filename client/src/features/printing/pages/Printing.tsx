import { useMemo } from "react";

import { useCanEdit } from "../../../lib/adminAuth";
import type { PrintAgent, Printer, Station } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { usePageTour, type TourStep } from "../../../shared/ui/PageTour";
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

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "printing-stations",
        title: "Kitchen stations",
        description: "A station is a section of the kitchen - a dish's category routes its KOT to one.",
      },
      {
        target: "printing-agents",
        title: "Print agents",
        description:
          "A restaurant PC running the print agent app. Pair one with a one-time code, then it polls for jobs and sends them to its printers.",
      },
      {
        target: "printing-printers",
        title: "Printers",
        description: "Add a printer under an agent, point it at a network printer or a Windows shared one, and assign it to stations or the bill.",
      },
      {
        target: "printing-jobs",
        title: "Print jobs",
        description: "Every ticket and bill sent to a printer, with its status - retry a failed one from here.",
      },
    ],
    []
  );
  usePageTour(tourSteps);

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
        <div data-tour="printing-stations">
          <StationsCard stations={stations.data ?? NO_STATIONS} canEdit={canEdit} />
        </div>
        <div data-tour="printing-agents">
          <AgentsCard agents={agents.data ?? NO_AGENTS} canEdit={canEdit} />
        </div>
      </div>
      <div data-tour="printing-printers">
        <PrintersCard
          printers={printers.data ?? NO_PRINTERS}
          agents={agents.data ?? NO_AGENTS}
          stations={stations.data ?? NO_STATIONS}
          canEdit={canEdit}
        />
      </div>
      <div data-tour="printing-jobs">
        <JobsCard canEdit={canEdit} />
      </div>
    </div>
  );
}
