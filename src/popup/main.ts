import { renderMenuScreen } from "./screens/menu.ts";
import { renderKanjiScreen } from "./screens/kanji.ts";
import { renderVocabScreen } from "./screens/vocab.ts";
import { renderQuizScreen } from "./screens/quiz.ts";
import { renderSearchScreen } from "./screens/search.ts";
import { renderJlptHistoryScreen } from "./screens/jlptHistory.ts";
import { renderStatsScreen } from "./screens/stats.ts";
import { renderReadingScreen } from "./screens/reading.ts";

type Screen = "menu" | "kanji" | "vocab" | "quiz" | "search" | "jlptHistory" | "stats" | "reading";
const VALID_SCREENS: Screen[] = ["menu", "kanji", "vocab", "quiz", "search", "jlptHistory", "stats", "reading"];

function navigate(screen: Screen, targetId?: string) {
  const app = document.getElementById("app")!;
  if (screen === "menu") {
    renderMenuScreen(app, navigate);
  } else if (screen === "kanji") {
    renderKanjiScreen(app, () => navigate("menu"), (vocabId) => navigate("vocab", vocabId), targetId);
  } else if (screen === "vocab") {
    renderVocabScreen(app, () => navigate("menu"), (kanjiId) => navigate("kanji", kanjiId), targetId);
  } else if (screen === "quiz") {
    renderQuizScreen(
      app,
      () => navigate("menu"),
      (kanjiId) => navigate("kanji", kanjiId),
      (vocabId) => navigate("vocab", vocabId),
    );
  } else if (screen === "search") {
    renderSearchScreen(
      app,
      () => navigate("menu"),
      (kanjiId) => navigate("kanji", kanjiId),
      (vocabId) => navigate("vocab", vocabId),
    );
  } else if (screen === "jlptHistory") {
    renderJlptHistoryScreen(app, () => navigate("menu"));
  } else if (screen === "stats") {
    renderStatsScreen(
      app,
      () => navigate("menu"),
      (kanjiId) => navigate("kanji", kanjiId),
      (vocabId) => navigate("vocab", vocabId),
    );
  } else if (screen === "reading") {
    renderReadingScreen(app, () => navigate("menu"));
  }
}

// Quiz (and the "⤢ mở tab" button on Kanji/Vocab) opens in a full browser
// tab instead of the popup -- see menu.ts / tabMode.ts. `?tab=1` marks the
// page as opened that way (widens the layout, see .tab-mode in style.css)
// and `#<screen>` says which screen to land on for that one open.
const params = new URLSearchParams(location.search);
if (params.get("tab") === "1") document.body.classList.add("tab-mode");

const initialScreen = location.hash.slice(1) as Screen;
if (initialScreen && initialScreen !== "menu") {
  // The hash is only meant to steer this one page load (e.g. the tab the
  // background worker just opened for a reminder click). Strip it right
  // away so a plain reload (F5) of this same tab lands on the Menu instead
  // of silently re-entering Quiz/Kanji/Vocab every time.
  history.replaceState(null, "", location.pathname + location.search);
}
navigate(VALID_SCREENS.includes(initialScreen) ? initialScreen : "menu");
