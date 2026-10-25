
  import { createRoot } from "react-dom/client";
  import App from "./app/App.jsx";
  import "./styles/index.css";
  import { installRequestTimeouts } from "./api/request";
  installRequestTimeouts();

  createRoot(document.getElementById("root")).render(<App />);
