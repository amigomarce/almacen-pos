import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { esAppEscritorio, instalarBloqueoDeTeclas } from './kiosco.js';
import './estilos.css';

// Solo en la app de escritorio: en el navegador de desarrollo F5 y compañía siguen sirviendo.
if (esAppEscritorio()) instalarBloqueoDeTeclas();

const raiz = document.getElementById('root');
if (!raiz) throw new Error('Falta el elemento #root en index.html');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
