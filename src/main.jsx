import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import AdminApp from './AdminApp.jsx';
import './style.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {document.body.dataset.page === 'admin' ? <AdminApp /> : <App />}
  </StrictMode>,
);
