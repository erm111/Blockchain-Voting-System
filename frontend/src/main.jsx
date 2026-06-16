import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import Home from "./pages/Home.jsx";
import Admin from "./pages/Admin.jsx";
import Voters from "./pages/Voters.jsx";
import Vote from "./pages/Vote.jsx";
import Results from "./pages/Results.jsx";
import { WalletProvider } from "./lib/WalletContext.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <WalletProvider>
        <Routes>
          <Route element={<App />}>
            <Route index element={<Home />} />
            <Route path="admin" element={<Admin />} />
            <Route path="admin/voters" element={<Voters />} />
            <Route path="vote" element={<Vote />} />
            <Route path="results" element={<Results />} />
          </Route>
        </Routes>
      </WalletProvider>
    </BrowserRouter>
  </React.StrictMode>
);
