import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// 拦截未处理的 Promise rejection（平台 SDK 等可能抛出 null rejection，避免污染错误日志）
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason === null || e.reason === undefined) {
    e.preventDefault();
    console.warn('[global] 忽略空的 unhandledrejection');
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
