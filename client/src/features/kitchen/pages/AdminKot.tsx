import { Page, PageHeader } from "../../../shared/ui/ui";
import KotQueueView from "../components/KotQueueView";

export default function AdminKot() {
  return (
    <Page>
      <PageHeader
        title="Kitchen Queue"
        description="Every item sent to the kitchen, grouped by ticket. Move items along as they cook and serve."
      />
      <KotQueueView canCancel />
    </Page>
  );
}
