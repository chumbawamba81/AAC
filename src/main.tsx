// src/main.tsx
import React from "react";
import { createRoot } from "react-dom/client"; // 👈 React 18
import App from "./App";
import AdminApp from "./admin/AdminApp";
import QRCodePage from "./pages/QRCodePage"; // 👈 importa a nova página
import "./index.css";

const el = document.getElementById("root");
if (!el) {
  throw new Error("Elemento #root não encontrado no index.html");
}
const root = createRoot(el);

// Troca de app consoante a rota
const path = window.location.pathname;
const isAdmin = path.startsWith("/admin");
const isQRCode = path.startsWith("/qrcode");

root.render(
  <React.StrictMode>
    {isAdmin ? <AdminApp /> : isQRCode ? <QRCodePage /> : <App />}
  </React.StrictMode>
);
