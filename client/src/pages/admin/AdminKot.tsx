import KotQueueView from "../../components/KotQueueView";

export default function AdminKot() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Kitchen Queue</h1>
      <KotQueueView canCancel />
    </div>
  );
}
