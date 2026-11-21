import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Optional typography must not delay sign-in when the font provider is unavailable.
const fontStylesheet = document.createElement("link");
fontStylesheet.rel = "stylesheet";
fontStylesheet.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700;750&display=swap";
fontStylesheet.media = "print";
fontStylesheet.addEventListener("load", () => { fontStylesheet.media = "all"; }, { once: true });
document.head.append(fontStylesheet);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
