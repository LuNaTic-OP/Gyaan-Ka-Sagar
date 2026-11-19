import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('Application ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center px-6">
          <div className="max-w-lg w-full bg-white border border-[#E8E2D6] rounded-2xl p-8 text-center">
            <h1 className="font-serif text-2xl font-semibold text-[#2B2B2B] mb-3">
              Something went quiet in the reading room
            </h1>
            <p className="text-sm text-[#6B6B6B] mb-6 leading-relaxed">
              We encountered an unexpected issue while loading the library. Please refresh the page
              to continue.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-[#2F5D62] text-white text-sm font-medium hover:bg-[#244A4E] transition-colors cursor-pointer"
            >
              Reload Library
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
