import { Clock, Wrench } from "lucide-react";
import { useEffect, useState } from "react";

export interface MaintenanceContent {
  title: string;
  message: string;
  imageUrl: string;
  startAt: string | null;
  endAt: string | null;
  restaurantName: string;
  logoUrl: string;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function timeLeft(endAt: string, now: number): string | null {
  const minutes = Math.ceil((new Date(endAt).getTime() - now) / 60000);
  if (minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

/** The "under maintenance" screen: the picture, the message and when the site is expected back. */
export default function MaintenanceView({ content, preview = false }: { content: MaintenanceContent; preview?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const left = content.endAt ? timeLeft(content.endAt, now) : null;

  return (
    <div
      className={`flex flex-col items-center justify-center bg-slate-50 px-4 py-8 text-center ${preview ? "min-h-[28rem] rounded-xl" : "min-h-screen"}`}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-raised ring-1 ring-slate-200">
        {content.imageUrl ? (
          <img src={content.imageUrl} alt="" className="max-h-72 w-full object-cover" />
        ) : (
          <div className="flex h-40 items-center justify-center bg-slate-100 text-slate-400">
            <Wrench className="h-14 w-14" aria-hidden="true" />
          </div>
        )}
        <div className="flex flex-col items-center gap-3 px-6 py-6">
          {content.logoUrl ? (
            <img src={content.logoUrl} alt={content.restaurantName} className="h-10 w-auto" />
          ) : (
            content.restaurantName && <p className="text-sm font-semibold text-slate-500">{content.restaurantName}</p>
          )}
          <h1 className="text-2xl font-bold text-slate-900">{content.title}</h1>
          {content.message && <p className="whitespace-pre-line text-sm text-slate-600">{content.message}</p>}

          {(content.startAt || content.endAt) && (
            <div className="mt-1 flex w-full flex-col gap-1 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="flex items-center justify-center gap-2 font-medium text-slate-900">
                <Clock className="h-4 w-4" aria-hidden="true" /> Maintenance window
              </p>
              {content.startAt && (
                <p>
                  <span className="text-slate-500">Starts: </span>
                  {when(content.startAt)}
                </p>
              )}
              {content.endAt && (
                <p>
                  <span className="text-slate-500">Expected back: </span>
                  {when(content.endAt)}
                </p>
              )}
              {left && <p className="font-medium text-orange-700">About {left} to go</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
