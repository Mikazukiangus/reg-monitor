import { Component, type ErrorInfo, type ReactNode } from 'react';
import { browserLogger } from '../../shared/logging';
import { reportError } from '../lib/errorReporting';

interface State { failed: boolean; reference: string | null }

// When rendering fails, a short message and a way back instead of a blank
// page. The error is reported to the server's error tracking; the visitor
// sees only the reference it was recorded under, never the error itself.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, reference: null };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    browserLogger.error('[RegSonar] The page could not be shown:', error);
    void reportError(error, 'render').then(reference => this.setState({ reference }));
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="min-h-screen bg-page text-ink flex items-center justify-center px-4">
        <div role="alert" className="max-w-md w-full bg-panel border border-line rounded-lg p-6 shadow-xs">
          <h1 className="font-['Inter'] text-[18px] font-bold mb-2">Something went wrong</h1>
          <p className="font-['Inter'] text-[14px] text-ink-soft mb-4">
            RegSonar could not show this page. The problem has been recorded. Reloading usually fixes it; your saved notices and settings are kept on this device.
          </p>
          {this.state.reference && (
            <p className="font-['Inter'] text-[12px] text-muted mb-4">
              Reference <span className="font-['JetBrains_Mono'] text-ink-soft">{this.state.reference}</span>
            </p>
          )}
          <button
            type="button"
            onClick={() => location.reload()}
            className="px-4 py-1.5 bg-accent text-on-accent text-[12px] font-semibold rounded hover:bg-accent-deep transition-colors shadow-xs"
          >
            Reload
          </button>
        </div>
      </main>
    );
  }
}
