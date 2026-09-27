import { ChartColumn, ClipboardCheck, Package, ReceiptText, ScrollText } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { useCanEdit } from "../../../lib/adminAuth";
import { Page, PageHeader, Tabs } from "../../../shared/ui/ui";
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

export default function Inventory() {
  const canEdit = useCanEdit("inventory");
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get("tab"))?.value ?? "stock") as TabKey;

  return (
    <Page>
      <PageHeader
        title="Inventory"
        description="Ingredients, recipes and purchases. Stock goes down when a KOT is sent and comes back if an item is cancelled before cooking."
      />
      <Tabs<TabKey>
        value={tab}
        onChange={(key) => setParams({ tab: key }, { replace: true })}
        items={TABS.map((t) => ({ ...t }))}
      />
      {tab === "stock" && <StockTab canEdit={canEdit} />}
      {tab === "recipes" && <RecipesTab canEdit={canEdit} />}
      {tab === "purchases" && <PurchasesTab canEdit={canEdit} />}
      {tab === "counts" && <CountsTab canEdit={canEdit} />}
      {tab === "reports" && <ReportsTab />}
    </Page>
  );
}
