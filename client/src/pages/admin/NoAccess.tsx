import { Card } from "../../shared/ui/ui";

export default function NoAccess() {
  return (
    <Card>
      <h1 className="text-xl font-semibold text-slate-800">No access</h1>
      <p className="mt-2 text-sm text-slate-600">
        Your account doesn't have permission to open this page. Ask the restaurant owner to grant you access under Admin
        Users.
      </p>
    </Card>
  );
}
