import React from "react";
import { BrandLogo } from "../brand/BrandLogo";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center text-foreground selection:bg-secondary">
          <div className="max-w-md w-full space-y-6 rounded-[12px] border border-border bg-card p-8 shadow-sm">
            <div className="flex justify-center mb-2">
              <BrandLogo variant="mark" width={32} decorative />
            </div>
            <div className="mx-auto flex size-12 items-center justify-center rounded-[5px] bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-[var(--status-danger)]">
              <svg
                className="size-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-medium tracking-tight text-foreground">Something went wrong</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                An unexpected error occurred while rendering this interface. Reloading will restore your workspace.
              </p>
            </div>
            {this.state.error && process.env.NODE_ENV !== "production" && (
              <div className="max-h-32 overflow-auto rounded-[5px] bg-secondary p-3 text-left text-xs font-mono text-[var(--status-danger)] border border-border">
                {this.state.error.toString()}
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-[5px] bg-primary text-primary-foreground hover:bg-[var(--primary-hover)] active:bg-[var(--primary-pressed)] text-sm font-medium transition-colors cursor-pointer"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
