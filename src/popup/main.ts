import { renderMenuScreen } from "./screens/menu.ts";
import { renderKanjiScreen } from "./screens/kanji.ts";

type Screen = "menu" | "kanji";

function navigate(screen: Screen) {
  const app = document.getElementById("app")!;
  if (screen === "menu") {
    renderMenuScreen(app, navigate);
  } else if (screen === "kanji") {
    renderKanjiScreen(app, () => navigate("menu"));
  }
}

navigate("menu");
