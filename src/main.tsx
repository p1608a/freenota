// 1. Global Error Handler (Must be first)
window.onerror = function (message, source, lineno, colno, error) {
  document.body.innerHTML = `
        <div style="background:maroon;color:white;padding:20px;font-family:monospace;z-index:9999;position:fixed;top:0;left:0;width:100%;height:100%;">
            <h1>Global Crash</h1>
            <p><strong>Message:</strong> ${message}</p>
            <p><strong>Source:</strong> ${source}:${lineno}:${colno}</p>
            <pre>${error?.stack}</pre>
        </div>
    `;
  return true;
};

import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 2. Clear any existing content
document.body.innerHTML = '<div id="root"></div>';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'red', fontFamily: 'monospace' }}>
          <h1>React Render Error</h1>
          <pre>{this.state.error?.toString()}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
} catch (e) {
  document.body.innerHTML = `<div style="color:red;padding:20px;"><h1>Critical Startup Error (Catch)</h1><pre>${e}</pre></div>`;
}
