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
import { ReviewScreen } from "./screens/ReviewScreen.tsx";
import { GuideScreen } from "./screens/GuideScreen.tsx";
import { ListeningHubScreen } from "./screens/ListeningHubScreen.tsx";
import { DeThiScreen } from "./screens/DeThiScreen.tsx";
import "./tailwind.css";

// "/" in dev/the extension build, "/japanese-extension/" on GitHub Pages
// (see vite.config.ts's `base`) -- routes are built/read relative to this so
// the same code works under either.
const BASE = import.meta.env.BASE_URL;

function readFromPath(): { screen: Screen; targetId?: string } {
  const path = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : location.pathname.replace(/^\/+/, "");
  // First path segment is the screen, the rest (rejoined) is the target id --
  // see App.tsx's initializer for why this needs decodeURIComponent (a kanji
  // id like "kanji-男" round-trips through the URL percent-encoded).
  const [rawScreen, ...rest] = path.split("/").filter(Boolean);
  const rawTargetId = rest.length > 0 ? rest.join("/") : undefined;
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
// before. Sidebar/bottom-nav/card clicks push a real path via the History
// API (optionally "/screen/targetId" for a deep link, e.g. a Vocab card's
// kanji-char jump) and remount by key. GitHub Pages has no server-side SPA
// rewrite, so a direct link or a reload on a non-root path relies on
// public/404.html's redirect + index.html's matching restore script to land
// back here with the right path before this router ever reads it. Each
// screen's own internal back/forward stack (App's `navigate`/`goBack`) still
// works exactly as before once inside a section rendered via <App/>.
export function WebApp() {
  const [{ screen, targetId }, setRoute] = useState(readFromPath);

  useEffect(() => {
    document.body.classList.add("web-shell");
    return () => document.body.classList.remove("web-shell");
  }, []);

  // go() below already pushes a new history entry every time it calls
  // history.pushState, so the browser's own back/forward buttons -- and, on
  // mobile, the OS edge-swipe back gesture -- already move through this
  // app's navigation history. What was missing is this: nothing was
  // listening for the "popstate" event fired by those, so going back only
  // moved the address bar while the still-mounted React tree kept showing
  // whatever screen it last rendered. Sync the two by re-reading the path on
  // every popstate.
  useEffect(() => {
    function onPopState() {
      setRoute(readFromPath());
      window.scrollTo(0, 0);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function go(next: Screen, id?: string) {
    // Menu is the root ("/japanese-extension/"), not "/japanese-extension/menu"
    // -- it's the landing page, not a content category.
    const path = next === "menu" && !id ? BASE : `${BASE}${next}${id ? `/${encodeURIComponent(id)}` : ""}`;
    history.pushState(null, "", path);
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
    content = <KanjiScreen onOpenVocab={(vocabId) => go("vocab", vocabId)} onOpenQuiz={() => go("quiz")} jumpToId={targetId} />;
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
    content = <QuizBookScreen targetId={targetId} />;
  } else if (screen === "reading") {
    content = (
      <ReadingScreen
        targetId={targetId}
        onOpenVocab={(vocabId) => go("vocab", vocabId)}
        onOpenBunpo={(bunpoId) => go("bunpo", bunpoId)}
        onOpenStats={() => go("stats", "reading")}
      />
    );
  } else if (screen === "stats") {
    content = <StatsScreen onNavigate={go} targetId={targetId} />;
  } else if (screen === "review") {
    content = (
      <ReviewScreen
        onOpenKanji={(kanjiId) => go("kanji", kanjiId)}
        onOpenVocab={(vocabId) => go("vocab", vocabId)}
        onOpenBunpo={(bunpoId) => go("bunpo", bunpoId)}
        onDone={() => go("menu")}
      />
    );
  } else if (screen === "guide") {
    content = <GuideScreen />;
  } else if (screen === "listening") {
    content = <ListeningHubScreen initialTab="listening" jumpToId={targetId} />;
  } else if (screen === "dictation") {
    content = <ListeningHubScreen initialTab="dictation" jumpToId={targetId} />;
  } else if (screen === "dethi") {
    content = <DeThiScreen targetId={targetId} />;
  } else {
    content = <App key={navKey} />;
  }

  return (
    <WebAppShell active={screen} onNavigate={go}>
      {content}
    </WebAppShell>
  );
}
