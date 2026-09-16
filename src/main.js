import "./styles/index.css";
import { createApp } from "./ui/app.js";

createApp(document.querySelector("#app")).catch((error) => {
  console.error(error);
  document.querySelector("#app").innerHTML = `<main class="fatal-error"><h1>No pudimos abrir StudyHub</h1><p>Recarga la página. Tus datos locales no serán borrados.</p></main>`;
});
