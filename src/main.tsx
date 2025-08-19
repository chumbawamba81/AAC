import React from "react";
import { createRoot } from "react-dom/client"; // 👈 React 18
import App from "./App";
import AdminApp from "./admin/AdminApp";
import "./index.css";

const el = document.getElementById("root");
if (!el) {
  throw new Error("Elemento #root não encontrado no index.html");
}
const root = createRoot(el);

// Troca de app consoante a rota
const isAdmin = window.location.pathname.startsWith("/admin");

root.render(
  <React.StrictMode>
    {isAdmin ? <AdminApp /> : <App />}
  </React.StrictMode>
);
