import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { LightProvider } from "./light/LightContext.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      {/* La luz envuelve a todo: es el estado mas global de la app */}
      <LightProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LightProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
