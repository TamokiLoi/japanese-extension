import { useEffect, useState } from "react";
import { App, VALID_SCREENS, type Screen } from "../popup/App.tsx";
import { WebAppShell } from "./WebAppShell.tsx";
import { HomeScreen } from "./screens/HomeScreen.tsx";
import { VocabScreen } from "./screens/VocabScreen.tsx";
import { KanjiScreen } from "./screens/KanjiScreen.tsx";
import { SearchScreen } from "./screens/SearchScreen.tsx";
import { BunpoScreen } from "./screens/BunpoScreen.tsx";
import { QuizScreen } from "./screens/QuizScreen.tsx";
import { QuizBookScreen } from "./screens/QuizBookScreen.tsx";
import { ReadingScreen } from "./screens/ReadingScreen.tsx";
import { StatsScreen } from "./screens/StatsScreen.tsx";
import "./tailwind.css";

function readFromHash(): { screen: Screen; targetId?: string } {
  // See App.tsx's initializer for why this needs decodeURIComponent.
  const [rawScreen, rawTargetId] = location.hash.slice(1).split(":");
  const screen = rawScreen as Screen;
  return {
    screen: VALID_SCREENS.includes(screen) ? screen : "menu",
    targetId: rawTargetId ? decodeURIComponent(rawTargetId) : undefined,
  };
}

// Web-only dashboard shell. Phase 1 wrapped every screen in <App/> unchanged;
// Phase 3 progressively replaces individual screens with real Tailwind/
// shadcn redesigns here (Vocab first) while everything not yet redesigned
// still falls through to <App key={navKey}/> -- same component the
// extension uses, so screens not yet touched keep working exactly as
// before. Sidebar/bottom-nav/card clicks change location.hash (optionally
// "screen:targetId" for a deep link, e.g. a Vocab card's kanji-char jump)
// and remount by key, reusing App's existing hash-on-mount read (see
// App.tsx) instead of adding a router. Each screen's own internal
// back/forward stack (App's `navigate`/`goBack`) still works exactly as
// before once inside a section rendered via <App/>.
export function WebApp() {
  const [{ screen, targetId }, setRoute] = useState(readFromHash);

  useEffect(() => {
    document.body.classList.add("web-shell");
    return () => document.body.classList.remove("web-shell");
  }, []);

  function go(next: Screen, id?: string) {
    location.hash = id ? `${next}:${id}` : next;
    setRoute({ screen: next, targetId: id });
    window.scrollTo(0, 0);
  }

  const navKey = targetId ? `${screen}:${targetId}` : screen;

  let content: React.ReactNode;
  if (screen === "menu") {
    content = <HomeScreen onNavigate={go} />;
  } else if (screen === "vocab") {
    content = (
      <VocabScreen
        onOpenKanji={(kanjiId) => go("kanji", kanjiId)}
        onOpenReading={() => go("reading")}
        onOpenQuizBook={() => go("quizBook")}
        jumpToId={targetId}
      />
    );
  } else if (screen === "search") {
    content = (
      <SearchScreen
        onOpenKanji={(kanjiId) => go("kanji", kanjiId)}
        onOpenVocab={(vocabId) => go("vocab", vocabId)}
        onOpenBunpo={(bunpoId) => go("bunpo", bunpoId)}
      />
    );
  } else if (screen === "kanji") {
    content = <KanjiScreen onOpenVocab={(vocabId) => go("vocab", vocabId)} jumpToId={targetId} />;
  } else if (screen === "bunpo") {
    content = (
      <BunpoScreen onOpenReading={() => go("reading")} onOpenQuizBook={() => go("quizBook")} targetId={targetId} />
    );
  } else if (screen === "quiz") {
    content = (
      <QuizScreen
        onOpenKanji={(kanjiId) => go("kanji", kanjiId)}
        onOpenVocab={(vocabId) => go("vocab", vocabId)}
        onOpenBunpo={(bunpoId) => go("bunpo", bunpoId)}
      />
    );
  } else if (screen === "quizBook") {
    content = <QuizBookScreen />;
  } else if (screen === "reading") {
    content = <ReadingScreen />;
  } else if (screen === "stats") {
    content = <StatsScreen onNavigate={go} />;
  } else {
    content = <App key={navKey} />;
  }

  return (
    <WebAppShell active={screen} onNavigate={go}>
      {content}
    </WebAppShell>
  );
}
