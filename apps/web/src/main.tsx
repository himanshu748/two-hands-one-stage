import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { Landing } from "./Landing.js";
import "./styles.css";
const element = document.getElementById("root");
if (!element) throw new Error("Application root is missing");
const studio =
  window.location.pathname === "/studio" ||
  window.location.pathname === "/example" ||
  window.location.pathname.startsWith("/example/") ||
  window.location.pathname.startsWith("/studio/");
createRoot(element).render(
  <React.StrictMode>{studio ? <App /> : <Landing />}</React.StrictMode>,
);
