import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@fontsource/handjet/300.css";
import "@fontsource/handjet/400.css";
import "@fontsource/handjet/500.css";
import "@fontsource/handjet/600.css";
import "@fontsource/handjet/700.css";
import "./styles.css";
import "./reference-design.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
