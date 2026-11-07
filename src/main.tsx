import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="h-full grid place-items-center p-6 text-center">
        <div>
          <h1 className="text-xl font-bold text-gold">Something went wrong</h1>
          <p className="text-sm text-muted mt-2">{this.state.error.message}</p>
          <p className="text-sm text-muted mt-1">Your last save is safe in this browser.</p>
          <button className="mt-4 min-h-11 px-4 rounded-lg bg-gold text-gold-ink font-semibold" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
