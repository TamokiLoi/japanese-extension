import { useCallback, useEffect, useRef, useState } from "react";
import { App, VALID_SCREENS, type Screen } from "../popup/App.tsx";
import { saveLastActive } from "../popup/lastActiveState.ts";
import { WebAppShell } from "./WebAppShell.tsx";
import { ConfirmProvider } from "./components/ConfirmDialog.tsx";
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
import { BackupScreen } from "./screens/BackupScreen.tsx";
import { ListeningHubScreen } from "./screens/ListeningHubScreen.tsx";
import { DeThiScreen } from "./screens/DeThiScreen.tsx";
import "./tailwind.css";

// "/" in dev/the extension build, "/japanese-extension/" on GitHub Pages
// (see vite.config.ts's `base`) -- routes are built/read relative to this so
// the same code works under either.
const BASE = import.meta.env.BASE_URL;

type ReturnTo = { screen: Screen; targetId?: string };

function readFromPath(): { screen: Screen; targetId?: string; returnTo: ReturnTo | null } {
  const path = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : location.pathname.replace(/^\/+/, "");
  // First path segment is the screen, the rest (rejoined) is the target id --
  // see App.tsx's initializer for why this needs decodeURIComponent (a kanji
  // id like "kanji-男" round-trips through the URL percent-encoded).
  const [rawScreen, ...rest] = path.split("/").filter(Boolean);
  const rawTargetId = rest.length > 0 ? rest.join("/") : undefined;
  const screen = rawScreen as Screen;
  // "Quay lại" state travels as ?from=<screen>&fromId=<id> instead of plain
  // React/ref state -- a page reload or a manual browser back/forward (both
  // of which only replay the URL) then still resolves the right "return to"
  // target, and a copied/shared link keeps working the same way.
  const params = new URLSearchParams(location.search);
  const fromScreen = params.get("from");
  const returnTo: ReturnTo | null =
    fromScreen && VALID_SCREENS.includes(fromScreen as Screen) ? { screen: fromScreen as Screen, targetId: params.get("fromId") ?? undefined } : null;
  return {
    screen: VALID_SCREENS.includes(screen) ? screen : "menu",
    targetId: rawTargetId ? decodeURIComponent(rawTargetId) : undefined,
    returnTo,
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
  const [{ screen, targetId, returnTo }, setRoute] = useState(readFromPath);
  // Several screens (Kanji/Vocab/Bunpo/QuizBook/Reading/Listening/Dictation)
  // page between items -- Trước/Tiếp, tapping a grid tile, jumping via the
  // question palette -- entirely through their own local/persisted state,
  // never through go(). Left untracked, a cross-link fired mid-browsing
  // would capture whatever targetId the URL happened to have on *entry*
  // (often none), so "quay lại" would land back on the screen's default
  // view instead of the exact item the user was on. Each such screen calls
  // syncCurrentItem() below whenever its own current item changes; this ref
  // (not React state -- see syncCurrentItem) always holds the freshest one.
  const currentItemRef = useRef<string | undefined>(targetId);

  useEffect(() => {
    document.body.classList.add("web-shell");
    return () => document.body.classList.remove("web-shell");
  }, []);

  // Keeps the address bar honest (a manual refresh or copied link still
  // resolves to the right item) without going through setRoute/go() -- a
  // *real* route change would re-run the screen's own jumpToId/targetId
  // effect on every single Trước/Tiếp tap, which for e.g. KanjiScreen also
  // resets the level/progress filters (see resolveJumpState's comment).
  // replaceState never touches those, so it's paging-safe. The `?from=`
  // query string (see readFromPath) rides along untouched, since only the
  // pathname portion is rebuilt here.
  const syncCurrentItem = useCallback(
    (id: string | undefined) => {
      currentItemRef.current = id;
      const path = id ? `${BASE}${screen}/${encodeURIComponent(id)}` : `${BASE}${screen}`;
      history.replaceState(null, "", path + location.search);
    },
    [screen],
  );

  // go() below already pushes a new history entry every time it calls
  // history.pushState, so the browser's own back/forward buttons -- and, on
  // mobile, the OS edge-swipe back gesture -- already move through this
  // app's navigation history. What was missing is this: nothing was
  // listening for the "popstate" event fired by those, so going back only
  // moved the address bar while the still-mounted React tree kept showing
  // whatever screen it last rendered. Sync the two by re-reading the path
  // (now including ?from=/?fromId=) on every popstate.
  useEffect(() => {
    function onPopState() {
      const next = readFromPath();
      setRoute(next);
      currentItemRef.current = next.targetId;
      window.scrollTo(0, 0);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function go(next: Screen, id?: string, opts: { linking?: boolean } = {}) {
    // Menu is the root ("/japanese-extension/"), not "/japanese-extension/menu"
    // -- it's the landing page, not a content category.
    let path = next === "menu" && !id ? BASE : `${BASE}${next}${id ? `/${encodeURIComponent(id)}` : ""}`;
    // Where to send the user back to after they followed a cross-content
    // link (e.g. a Kanji reference from inside a Reading passage) -- carried
    // as ?from=<screen>&fromId=<id> (see readFromPath) rather than plain
    // React state, so a reload/shared link/browser back-forward all still
    // resolve the right "return to" target instead of just this one live
    // session. Set whenever go() is called with a target id (every current
    // cross-link call site passes one; a plain section switch via the
    // bottom nav/sidebar never does) unless explicitly suppressed (goBack()
    // itself does, to stay one level deep instead of chaining back↔back).
    const nextReturnTo: ReturnTo | null = opts.linking !== false && id ? { screen, targetId: currentItemRef.current } : null;
    if (nextReturnTo) {
      const params = new URLSearchParams({ from: nextReturnTo.screen });
      if (nextReturnTo.targetId) params.set("fromId", nextReturnTo.targetId);
      path += `?${params}`;
    }
    history.pushState(null, "", path);
    currentItemRef.current = id;
    setRoute({ screen: next, targetId: id, returnTo: nextReturnTo });
    window.scrollTo(0, 0);
    // Fire-and-forget -- Home's "Tiếp tục học" banner reads this back on its
    // own next mount, nothing here needs to await it.
    void saveLastActive(next, id);
  }

  function goBack() {
    if (!returnTo) return;
    go(returnTo.screen, returnTo.targetId, { linking: false });
  }

  const navKey = targetId ? `${screen}:${targetId}` : screen;

  let content: React.ReactNode;
  if (screen === "menu") {
    content = <HomeScreen onNavigate={go} />;
  } else if (screen === "vocab") {
    content = (
      <VocabScreen
        onOpenKanji={(kanjiId) => go("kanji", kanjiId)}
        onOpenReading={(passageId) => go("reading", passageId)}
        onOpenQuizBook={(questionId) => go("quizBook", questionId)}
        onOpenQuiz={() => go("quiz")}
        jumpToId={targetId}
        onCurrentItemChange={syncCurrentItem}
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
    content = (
      <KanjiScreen
        onOpenVocab={(vocabId) => go("vocab", vocabId)}
        onOpenQuiz={() => go("quiz")}
        jumpToId={targetId}
        onCurrentItemChange={syncCurrentItem}
      />
    );
  } else if (screen === "bunpo") {
    content = (
      <BunpoScreen
        onOpenReading={(passageId) => go("reading", passageId)}
        onOpenQuizBook={(questionId) => go("quizBook", questionId)}
        targetId={targetId}
        onCurrentItemChange={syncCurrentItem}
      />
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
    content = <QuizBookScreen targetId={targetId} onCurrentItemChange={syncCurrentItem} />;
  } else if (screen === "reading") {
    content = (
      <ReadingScreen
        targetId={targetId}
        onOpenVocab={(vocabId) => go("vocab", vocabId)}
        onOpenBunpo={(bunpoId) => go("bunpo", bunpoId)}
        onCurrentItemChange={syncCurrentItem}
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
  } else if (screen === "backup") {
    content = <BackupScreen />;
  } else if (screen === "listening") {
    content = <ListeningHubScreen initialTab="listening" jumpToId={targetId} onCurrentItemChange={syncCurrentItem} />;
  } else if (screen === "dictation") {
    content = <ListeningHubScreen initialTab="dictation" jumpToId={targetId} onCurrentItemChange={syncCurrentItem} />;
  } else if (screen === "exams") {
    content = <DeThiScreen targetId={targetId} />;
  } else {
    content = <App key={navKey} />;
  }

  return (
    <ConfirmProvider>
      <WebAppShell active={screen} onNavigate={go} returnTo={returnTo} onGoBack={goBack}>
        {content}
      </WebAppShell>
    </ConfirmProvider>
  );
}
