import React from "react";
import { BrandLogo } from "../brand/BrandLogo";
import { BrandState } from "../brand/BrandState";

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
          <div className="max-w-md w-full space-y-4 rounded-[12px] border border-border bg-card p-8 shadow-sm">
            <BrandState
              name="error"
              title="This page could not load"
              description="Reload the page to try again. Saved projects and submissions will still be available; changes you have not saved may need to be entered again."
              action={
                <button
                  onClick={this.handleReset}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-[5px] bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors cursor-pointer mt-2"
                >
                  Reload page
                </button>
              }
            />
            {this.state.error && process.env.NODE_ENV !== "production" && (
              <div className="max-h-32 overflow-auto rounded-[5px] bg-secondary p-3 text-left text-xs font-mono text-[var(--status-danger)] border border-border">
                {this.state.error.toString()}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
