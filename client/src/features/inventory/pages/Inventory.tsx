import { ChartColumn, ClipboardCheck, Package, ReceiptText, ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useCanEdit } from "../../../lib/adminAuth";
import { usePageTour, type TourStep } from "../../../shared/ui/PageTour";
import { Alert, Page, PageHeader, Tabs } from "../../../shared/ui/ui";
import { CountsTab } from "../components/CountsTab";
import { PurchasesTab } from "../components/PurchasesTab";
import { RecipesTab } from "../components/RecipesTab";
import { ReportsTab } from "../components/ReportsTab";
import { StockTab } from "../components/StockTab";

const TABS = [
  { value: "stock", label: "Stock", icon: Package },
  { value: "recipes", label: "Recipes", icon: ScrollText },
  { value: "purchases", label: "Purchases", icon: ReceiptText },
  { value: "counts", label: "Stock count", icon: ClipboardCheck },
  { value: "reports", label: "Reports", icon: ChartColumn },
] as const;

type TabKey = (typeof TABS)[number]["value"];

const GUIDE_DISMISSED_KEY = "selforder_inventory_guide_dismissed";

function GuideCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Alert tone="info" title="How Inventory works, in short" onClose={onDismiss}>
      <ul className="mt-1 list-disc space-y-1 pl-4">
        <li>
          <b>Stock</b>: add the ingredients you buy. Setting the "Bought in" unit is optional - it just labels how
          much you get for the money, the app always tracks the actual count.
        </li>
        <li>
          <b>Recipes</b>: give each dish its ingredients so stock goes down automatically when a KOT is sent - dishes
          without a recipe never touch stock.
        </li>
        <li>
          <b>Update stock</b> (on the Stock tab): the everyday action. Just type what's actually on the shelf -
          no need to work out wastage vs. adjustment yourself.
        </li>
        <li>
          <b>Purchases</b>: record what you bought and at what price - this is what keeps the average cost accurate.
        </li>
        <li>
          <b>Stock count</b>: for a full physical count of everything at once, e.g. weekly or month-end.
        </li>
        <li>
          <b>Deactivate vs. Delete</b>: turn an item off to retire it while keeping its history (it drops off lists);
          Delete only works for an item that's never had any purchases, counts or wastage recorded.
        </li>
      </ul>
    </Alert>
  );
}

export default function Inventory() {
  const canEdit = useCanEdit("inventory");
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get("tab"))?.value ?? "stock") as TabKey;
  const [guideDismissed, setGuideDismissed] = useState(() => {
    try {
      return localStorage.getItem(GUIDE_DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  function dismissGuide() {
    setGuideDismissed(true);
    try {
      localStorage.setItem(GUIDE_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "inventory-tabs",
        title: "Five tabs",
        description:
          "Stock: your ingredients and updating what's on the shelf. Recipes: give each dish its ingredients. Purchases: record what you bought and at what price. Stock count: a full physical count at once. Reports: usage, purchases and food cost.",
      },
    ],
    []
  );
  usePageTour(tourSteps);

  return (
    <Page>
      <PageHeader
        title="Inventory"
        description="Ingredients, recipes and purchases. Stock goes down when a KOT is sent and comes back if an item is cancelled before cooking."
      />
      {!guideDismissed && <GuideCard onDismiss={dismissGuide} />}
      <div data-tour="inventory-tabs">
        <Tabs<TabKey>
          value={tab}
          onChange={(key) => setParams({ tab: key }, { replace: true })}
          items={TABS.map((t) => ({ ...t }))}
        />
      </div>
      {tab === "stock" && <StockTab canEdit={canEdit} />}
      {tab === "recipes" && <RecipesTab canEdit={canEdit} />}
      {tab === "purchases" && <PurchasesTab canEdit={canEdit} />}
      {tab === "counts" && <CountsTab canEdit={canEdit} />}
      {tab === "reports" && <ReportsTab />}
    </Page>
  );
}
