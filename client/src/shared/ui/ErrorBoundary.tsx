import { Component, type ErrorInfo, type ReactNode } from "react";

import { exportLogs, log } from "../../lib/logger";

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error("ui crashed", { error: error.message, componentStack: info.componentStack?.slice(0, 500) });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-800">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">The page hit an unexpected error. Reloading usually fixes it.</p>
          <p className="mt-3 rounded bg-slate-50 p-2 font-mono text-xs text-slate-500">{error.message}</p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(exportLogs())}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Copy diagnostics
            </button>
          </div>
        </div>
      </div>
    );
  }
}
