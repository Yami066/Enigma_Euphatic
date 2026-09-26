import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "../i18n";

// Keeps one broken screen from blanking the whole app; resets when the route changes.
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Screen crashed", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const t = i18n.t.bind(i18n);
    return (
      <div className="mx-auto max-w-md space-y-3 rounded-2xl bg-white p-6 text-center ring-1 ring-line">
        <p className="font-semibold">{t("crash.title", "Something went wrong on this screen.")}</p>
        <p className="text-sm text-muted">{t("crash.text", "Your case is safe. Reload to try again.")}</p>
        <button
          className="focus-ring inline-flex h-11 items-center rounded-xl bg-brand-700 px-4 font-medium text-white hover:bg-brand-800"
          onClick={() => window.location.reload()}
        >
          {t("crash.reload", "Reload")}
        </button>
      </div>
    );
  }
}
