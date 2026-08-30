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

interface Route {
  screen: Screen;
  targetId?: string;
  step?: string;
}

function App() {
  const [stack, setStack] = useState<Route[]>(() => {
    const initialScreen = location.hash.slice(1) as Screen;
    if (initialScreen && initialScreen !== "menu") {
      // The hash is only meant to steer this one page load (e.g. the tab
      // the background worker just opened for a reminder click). Strip it
      // right away so a plain reload (F5) of this same tab lands on the
      // Menu instead of silently re-entering Quiz/Kanji/Vocab every time.
      history.replaceState(null, "", location.pathname + location.search);
    }
    return [{ screen: VALID_SCREENS.includes(initialScreen) ? initialScreen : "menu" }];
  });

  const { screen, targetId, step } = stack[stack.length - 1];

  // Every cross-screen navigation pushes a new entry, so the in-app "←"
  // button (goBack) can pop back to wherever the user actually came from
  // instead of always jumping to Menu -- e.g. Bunpo -> related vocab ->
  // Vocab -> "←" returns to that Bunpo card, not the menu. Navigating
  // within a single screen (flipping cards, changing a filter) never calls
  // this, so the stack only grows on real screen-to-screen jumps.
  function navigate(next: Screen, id?: string, initialStep?: string) {
    setStack((s) => [...s, { screen: next, targetId: id, step: initialStep }]);
  }

  function goBack() {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }

  // For a screen with its own internal "steps" (currently only Quiz:
  // setup/play/result), some step transitions shouldn't be back-able
  // (e.g. resolving on mount whether to show "resume" or "setup", or
  // starting a new quiz after finishing one) -- those replace the step on
  // the current stack entry in place instead of pushing a new one.
  function replaceStep(newStep: string) {
    setStack((s) => {
      const top = s[s.length - 1];
      return [...s.slice(0, -1), { ...top, step: newStep }];
    });
  }

  if (screen === "menu") {
    return <MenuScreen onSelect={navigate} />;
  }
  if (screen === "search") {
    return (
      <SearchScreen
        onBack={goBack}
        onOpenKanji={(kanjiId) => navigate("kanji", kanjiId)}
        onOpenVocab={(vocabId) => navigate("vocab", vocabId)}
        onOpenBunpo={(bunpoId) => navigate("bunpo", bunpoId)}
      />
    );
  }
  if (screen === "jlptHistory") {
    return <JlptHistoryScreen onBack={goBack} />;
  }
  if (screen === "stats") {
    return (
      <StatsScreen
        onBack={goBack}
        onOpenKanji={(kanjiId) => navigate("kanji", kanjiId)}
        onOpenVocab={(vocabId) => navigate("vocab", vocabId)}
      />
    );
  }
  if (screen === "vocab") {
    return (
      <VocabScreen
        onBack={goBack}
        onOpenKanji={(kanjiId) => navigate("kanji", kanjiId)}
        onOpenReading={() => navigate("reading")}
        onOpenQuizBook={() => navigate("quizBook")}
        jumpToId={targetId}
      />
    );
  }
  if (screen === "kanji") {
    return <KanjiScreen onBack={goBack} onOpenVocab={(vocabId) => navigate("vocab", vocabId)} jumpToId={targetId} />;
  }
  if (screen === "quizBook") {
    return <QuizBookScreen onBack={goBack} />;
  }
  if (screen === "reading") {
    return <ReadingScreen onBack={goBack} />;
  }
  if (screen === "bunpo") {
    return (
      <BunpoScreen
        onBack={goBack}
        onOpenReading={() => navigate("reading")}
        onOpenQuizBook={() => navigate("quizBook")}
        targetId={targetId}
      />
    );
  }
  return (
    <QuizScreen
      onBack={goBack}
      step={step}
      onStepChange={(next) => navigate("quiz", undefined, next)}
      onStepReplace={replaceStep}
      onOpenKanji={(kanjiId) => navigate("kanji", kanjiId)}
      onOpenVocab={(vocabId) => navigate("vocab", vocabId)}
      onOpenBunpo={(bunpoId) => navigate("bunpo", bunpoId)}
    />
  );
}

// Quiz (and the "⤢ mở tab" button on Kanji/Vocab) opens in a full browser
// tab instead of the popup -- see MenuScreen.tsx / TabMode.tsx. `?tab=1`
// marks the page as opened that way (widens the layout, see .tab-mode in style.css).
// On the GitHub Pages web build there's no popup to begin with -- every
// page load is already "a full tab" -- so it always gets the wider layout
// instead of the extension's narrow 320px popup style. Note: plain Chromium
// (not just the extension) exposes a stub `window.chrome` object (
// chrome.loadTimes/csi/app, left over for web-compat reasons) even with no
// extension installed, so `typeof chrome === "undefined"` alone doesn't
// detect "running as an extension" -- chrome.runtime.id only exists when
// this page was actually loaded as an extension's own page.
const params = new URLSearchParams(location.search);
const isExtensionContext = typeof chrome !== "undefined" && !!chrome.runtime?.id;
if (params.get("tab") === "1" || !isExtensionContext) {
  document.body.classList.add("tab-mode");
}

createRoot(document.getElementById("app")!).render(<App />);
