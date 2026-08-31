import { useState } from "react";
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
  | "bunpo"
  | "review"
  | "guide";

export const VALID_SCREENS: Screen[] = [
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
  "review",
  "guide",
];

interface Route {
  screen: Screen;
  targetId?: string;
  step?: string;
}

export function App() {
  const [stack, setStack] = useState<Route[]>(() => {
    // "screen" or "screen:targetId" -- the src/web/ dashboard's sidebar/card
    // links encode a deep-link id this way (see WebApp.tsx's go()) so a
    // fresh <App key={screen}/> remount can jump straight to a specific
    // card, same as a Vocab card's "chữ Hán này" link already could within
    // a single App instance via navigate("kanji", id).
    // location.hash percent-encodes non-ASCII (a kanji id like "kanji-男"
    // becomes "kanji-%E7%94%B7") -- decode it back before using it to look
    // up a card, or the lookup silently fails and falls through to the
    // first item instead of the one actually clicked.
    const [rawScreen, rawTargetId] = location.hash.slice(1).split(":");
    const initialScreen = rawScreen as Screen;
    const decodedTargetId = rawTargetId ? decodeURIComponent(rawTargetId) : undefined;
    if (initialScreen && initialScreen !== "menu") {
      // The hash is only meant to steer this one page load (e.g. the tab
      // the background worker just opened for a reminder click). Strip it
      // right away so a plain reload (F5) of this same tab lands on the
      // Menu instead of silently re-entering Quiz/Kanji/Vocab every time.
      history.replaceState(null, "", location.pathname + location.search);
    }
    return [
      {
        screen: VALID_SCREENS.includes(initialScreen) ? initialScreen : "menu",
        targetId: decodedTargetId,
      },
    ];
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
  if (screen === "review") {
    // Web-only Tailwind screen -- not ported to the extension popup UI in
    // this pass, so this stays a plain static message rather than pulling
    // Tailwind/shadcn into the extension bundle.
    return <p className="empty">Tính năng Ôn tập hiện chỉ có trên bản Web Dashboard.</p>;
  }
  if (screen === "guide") {
    return <p className="empty">Hướng dẫn sử dụng hiện chỉ có trên bản Web Dashboard.</p>;
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
