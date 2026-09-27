import { ShieldAlert } from "lucide-react";

import { Card, EmptyState, Page } from "../../shared/ui/ui";

export default function NoAccess() {
  return (
    <Page>
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="No access"
          description="Your account doesn't have permission to open this page. Ask the restaurant owner to grant you access under Admin Users."
        />
      </Card>
    </Page>
  );
}
