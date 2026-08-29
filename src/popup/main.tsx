import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MenuScreen } from "./screens/MenuScreen.tsx";
import { KanjiScreen } from "./screens/KanjiScreen.tsx";
import { VocabScreen } from "./screens/VocabScreen.tsx";
import { QuizScreen } from "./screens/QuizScreen.tsx";
import { SearchScreen } from "./screens/SearchScreen.tsx";
import { JlptHistoryScreen } from "./screens/JlptHistoryScreen.tsx";
import { StatsScreen } from "./screens/StatsScreen.tsx";
import { ReadingScreen } from "./screens/ReadingScreen.tsx";
import { QuizBookScreen } from "./screens/QuizBookScreen.tsx";
import { BunpoScreen } from "./screens/BunpoScreen.tsx";

export type Screen =
  | "menu"
  | "kanji"
  | "vocab"
  | "quiz"
  | "search"
  | "jlptHistory"
  | "stats"
  | "reading"
  | "quizBook"
  | "bunpo";

const VALID_SCREENS: Screen[] = [
  "menu",
  "kanji",
  "vocab",
  "quiz",
  "search",
  "jlptHistory",
  "stats",
  "reading",
  "quizBook",
  "bunpo",
];

function App() {
  const [{ screen, targetId }, setRoute] = useState<{ screen: Screen; targetId?: string }>(() => {
    const initialScreen = location.hash.slice(1) as Screen;
    if (initialScreen && initialScreen !== "menu") {
      // The hash is only meant to steer this one page load (e.g. the tab
      // the background worker just opened for a reminder click). Strip it
      // right away so a plain reload (F5) of this same tab lands on the
      // Menu instead of silently re-entering Quiz/Kanji/Vocab every time.
      history.replaceState(null, "", location.pathname + location.search);
    }
    return { screen: VALID_SCREENS.includes(initialScreen) ? initialScreen : "menu" };
  });

  function navigate(next: Screen, id?: string) {
    setRoute({ screen: next, targetId: id });
  }

  if (screen === "menu") {
    return <MenuScreen onSelect={navigate} />;
  }
  if (screen === "search") {
    return (
      <SearchScreen
        onBack={() => navigate("menu")}
        onOpenKanji={(kanjiId) => navigate("kanji", kanjiId)}
        onOpenVocab={(vocabId) => navigate("vocab", vocabId)}
      />
    );
  }
  if (screen === "jlptHistory") {
    return <JlptHistoryScreen onBack={() => navigate("menu")} />;
  }
  if (screen === "stats") {
    return (
      <StatsScreen
        onBack={() => navigate("menu")}
        onOpenKanji={(kanjiId) => navigate("kanji", kanjiId)}
        onOpenVocab={(vocabId) => navigate("vocab", vocabId)}
      />
    );
  }
  if (screen === "vocab") {
    return <VocabScreen onBack={() => navigate("menu")} onOpenKanji={(kanjiId) => navigate("kanji", kanjiId)} jumpToId={targetId} />;
  }
  if (screen === "kanji") {
    return <KanjiScreen onBack={() => navigate("menu")} onOpenVocab={(vocabId) => navigate("vocab", vocabId)} jumpToId={targetId} />;
  }
  if (screen === "quizBook") {
    return <QuizBookScreen onBack={() => navigate("menu")} />;
  }
  if (screen === "reading") {
    return <ReadingScreen onBack={() => navigate("menu")} />;
  }
  if (screen === "bunpo") {
    return (
      <BunpoScreen
        onBack={() => navigate("menu")}
        onOpenReading={() => navigate("reading")}
        onOpenQuizBook={() => navigate("quizBook")}
        targetId={targetId}
      />
    );
  }
  return (
    <QuizScreen
      onBack={() => navigate("menu")}
      onOpenKanji={(kanjiId) => navigate("kanji", kanjiId)}
      onOpenVocab={(vocabId) => navigate("vocab", vocabId)}
      onOpenBunpo={(bunpoId) => navigate("bunpo", bunpoId)}
    />
  );
}

// Quiz (and the "⤢ mở tab" button on Kanji/Vocab) opens in a full browser
// tab instead of the popup -- see MenuScreen.tsx / TabMode.tsx. `?tab=1`
// marks the page as opened that way (widens the layout, see .tab-mode in style.css).
const params = new URLSearchParams(location.search);
if (params.get("tab") === "1") document.body.classList.add("tab-mode");

createRoot(document.getElementById("app")!).render(<App />);
