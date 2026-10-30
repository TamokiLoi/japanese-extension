import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { VALID_SCREENS, type Screen } from "../popup/screens.ts";
import { saveLastActive } from "../popup/lastActiveState.ts";
import { WebAppShell } from "./WebAppShell.tsx";
import { ConfirmProvider } from "./components/ConfirmDialog.tsx";
import { DevToolsGuard } from "./components/DevToolsGuard.tsx";
import { LoadingScreen, type LoadingVariant } from "./components/LoadingScreen.tsx";
import { PwaUpdateManager } from "./components/PwaUpdateManager.tsx";
import {
  DEFAULT_BOTTOM_NAV_SHORTCUTS,
  loadBottomNavShortcuts,
  saveBottomNavShortcuts,
} from "./lib/bottomNavSettings.ts";
import {
  DEFAULT_SEARCH_DISPLAY_MODE,
  loadSearchDisplayMode,
  saveSearchDisplayMode,
  type SearchDisplayMode,
} from "./lib/searchSettings.ts";
import "./dark-mode.css";
import {
  applyThemeMode,
  isThemeMode,
  readThemeMode,
  saveThemeMode,
  THEME_MODE_STORAGE_KEY,
  type ThemeMode,
} from "./lib/themeSettings.ts";
import "./tailwind.css";

const HomeScreen = lazy(() => import("./screens/HomeScreen.tsx").then((module) => ({ default: module.HomeScreen })));
const VocabScreen = lazy(() => import("./screens/VocabScreen.tsx").then((module) => ({ default: module.VocabScreen })));
const FlashcardScreen = lazy(() => import("./screens/FlashcardScreen.tsx").then((module) => ({ default: module.FlashcardScreen })));
const KanjiScreen = lazy(() => import("./screens/KanjiScreen.tsx").then((module) => ({ default: module.KanjiScreen })));
const SearchScreen = lazy(() => import("./screens/SearchScreen.tsx").then((module) => ({ default: module.SearchScreen })));
const BunpoScreen = lazy(() => import("./screens/BunpoScreen.tsx").then((module) => ({ default: module.BunpoScreen })));
const BunpoMapScreen = lazy(() => import("./screens/BunpoMapScreen.tsx").then((module) => ({ default: module.BunpoMapScreen })));
const QuizScreen = lazy(() => import("./screens/QuizScreen.tsx").then((module) => ({ default: module.QuizScreen })));
const QuizBookScreen = lazy(() => import("./screens/QuizBookScreen.tsx").then((module) => ({ default: module.QuizBookScreen })));
const JlptQuestionStudyPanel = lazy(() => import("./screens/JlptQuestionStudyScreen.tsx").then((module) => ({ default: module.JlptQuestionStudyScreen })));
const ReadingScreen = lazy(() => import("./screens/ReadingScreen.tsx").then((module) => ({ default: module.ReadingScreen })));
const StatsScreen = lazy(() => import("./screens/StatsScreen.tsx").then((module) => ({ default: module.StatsScreen })));
const ReviewScreen = lazy(() => import("./screens/ReviewScreen.tsx").then((module) => ({ default: module.ReviewScreen })));
const GuideScreen = lazy(() => import("./screens/GuideScreen.tsx").then((module) => ({ default: module.GuideScreen })));
const BackupScreen = lazy(() => import("./screens/BackupScreen.tsx").then((module) => ({ default: module.BackupScreen })));
const ListeningHubScreen = lazy(() => import("./screens/ListeningHubScreen.tsx").then((module) => ({ default: module.ListeningHubScreen })));
const DeThiScreen = lazy(() => import("./screens/DeThiScreen.tsx").then((module) => ({ default: module.DeThiScreen })));
const ItBookVocabScreen = lazy(() => import("./screens/ItBookVocabScreen.tsx").then((module) => ({ default: module.ItBookVocabScreen })));
const ItBookLessonsScreen = lazy(() => import("./screens/ItBookLessonsScreen.tsx").then((module) => ({ default: module.ItBookLessonsScreen })));
const RoadmapScreen = lazy(() => import("./screens/RoadmapScreen.tsx").then((module) => ({ default: module.RoadmapScreen })));
const PodcastScreen = lazy(() => import("./screens/PodcastScreen.tsx").then((module) => ({ default: module.PodcastScreen })));
const ExamTipsScreen = lazy(() => import("./screens/ExamTipsScreen.tsx").then((module) => ({ default: module.ExamTipsScreen })));
const MatchGameScreen = lazy(() => import("./screens/MatchGameScreen.tsx").then((module) => ({ default: module.MatchGameScreen })));
const SettingsScreen = lazy(() => import("./screens/SettingsScreen.tsx").then((module) => ({ default: module.SettingsScreen })));
const LegacyApp = lazy(() => import("../popup/App.tsx").then((module) => ({ default: module.App })));

// "/" in dev/the extension build, "/japanese-extension/" on GitHub Pages
// (see vite.config.ts's `base`) -- routes are built/read relative to this so
// the same code works under either.
const BASE = import.meta.env.BASE_URL;

type ReturnTo = { screen: Screen; targetId?: string; targetSenseId?: string; searchQuery?: string; searchTypes?: string[] };

function lookupRouteName(screen: Screen): string {
  return screen === "vocab" ? "goi" : screen;
}

function getLoadingPresentation(screen: Screen): { variant: LoadingVariant; title: string } {
  if (screen === "menu") return { variant: "home", title: "Trang chủ" };
  if (screen === "reading" || screen === "news" || screen === "aiStories" || screen === "savedStories") {
    const titles = { reading: "Luyện đọc", news: "Đọc báo", aiStories: "Truyện AI", savedStories: "Truyện đã lưu" };
    return { variant: "reading", title: titles[screen] };
  }
  if (screen === "listening" || screen === "dictation" || screen === "podcast") {
    const titles = { listening: "Luyện nghe", dictation: "Nghe chép chính tả", podcast: "Podcast" };
    return { variant: "listening", title: titles[screen] };
  }
  if (screen === "exams" || screen === "jlptHistory") {
    return { variant: "exam", title: screen === "exams" ? "Đề thi JLPT" : "Lịch sử đề thi" };
  }
  if (screen === "quiz" || screen === "quizBook" || screen === "translationPractice") {
    const titles = { quiz: "Quiz", quizBook: "Luyện đề", translationPractice: "Luyện dịch" };
    return { variant: "quiz", title: titles[screen] };
  }
  if (screen === "stats") return { variant: "stats", title: "Thống kê" };
  if (screen === "guide") return { variant: "guide", title: "Hướng dẫn" };
  if (screen === "examTips") return { variant: "exam", title: "Mẹo làm bài thi" };
  if (screen === "roadmap") return { variant: "roadmap", title: "Lộ trình N3" };
  if (screen === "matchGame") return { variant: "match", title: "Ghép cặp" };

  const titles: Partial<Record<Screen, string>> = {
    kanji: "Kanji",
    vocab: "Từ vựng",
    flashcards: "Flashcard",
    search: "Tra cứu",
    bunpo: "Ngữ pháp",
    bunpoMap: "Sơ đồ ngữ pháp",
    review: "Ôn tập",
    backup: "Sao lưu dữ liệu",
    itBookVocab: "Từ vựng IT",
    itBookLessons: "Bài học IT",
    settings: "Cài đặt",
  };
  return { variant: "study", title: titles[screen] ?? "nội dung học" };
}

function readFromPath(): { screen: Screen; targetId?: string; targetSenseId?: string; returnTo: ReturnTo | null } {
  const path = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : location.pathname.replace(/^\/+/, "");
  // First path segment is the screen, the rest (rejoined) is the target id --
  // see App.tsx's initializer for why this needs decodeURIComponent (a kanji
  // id like "kanji-男" round-trips through the URL percent-encoded).
  const [rawScreen, ...rest] = path.split("/").filter(Boolean);
  const rawTargetId = rest.length > 0 ? rest.join("/") : undefined;
  const screen = (rawScreen === "goi" ? "vocab" : rawScreen) as Screen;
  // "Quay lại" state travels as ?from=<screen>&fromId=<id> instead of plain
  // React/ref state -- a page reload or a manual browser back/forward (both
  // of which only replay the URL) then still resolves the right "return to"
  // target, and a copied/shared link keeps working the same way.
  const params = new URLSearchParams(location.search);
  const fromScreen = params.get("from");
  const returnTo: ReturnTo | null =
    fromScreen && VALID_SCREENS.includes(fromScreen as Screen)
      ? {
          screen: fromScreen as Screen,
          targetId: params.get("fromId") ?? undefined,
          targetSenseId: params.get("fromSense") ?? undefined,
          searchQuery: params.get("fromQ") ?? undefined,
          searchTypes: params.get("fromTypes")?.split(",").filter(Boolean),
        }
      : null;
  return {
    screen: VALID_SCREENS.includes(screen) ? screen : "menu",
    targetId: rawTargetId ? decodeURIComponent(rawTargetId) : params.get("param") ?? undefined,
    targetSenseId: params.get("sense") ?? undefined,
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
  const [{ screen, targetId, targetSenseId, returnTo }, setRoute] = useState(readFromPath);
  const [quizBookJlptMode, setQuizBookJlptMode] = useState(false);
  const [bottomNavShortcuts, setBottomNavShortcuts] = useState<Screen[]>(DEFAULT_BOTTOM_NAV_SHORTCUTS);
  const [searchDisplayMode, setSearchDisplayMode] = useState<SearchDisplayMode>(DEFAULT_SEARCH_DISPLAY_MODE);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readThemeMode);
  const [searchPopupOpen, setSearchPopupOpen] = useState(() => new URLSearchParams(location.search).get("lookup") === "1");
  const routeSyncPendingRef = useRef(true);
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
  const currentSenseRef = useRef<string | undefined>(targetSenseId);

  useEffect(() => {
    document.body.classList.add("web-shell");
    void loadBottomNavShortcuts().then(setBottomNavShortcuts);
    void loadSearchDisplayMode().then(setSearchDisplayMode);
    return () => document.body.classList.remove("web-shell");
  }, []);

  useEffect(() => {
    applyThemeMode(themeMode);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChange = () => {
      if (themeMode === "system") applyThemeMode("system");
    };
    if (typeof media.addEventListener === "function") media.addEventListener("change", onSystemThemeChange);
    else media.addListener(onSystemThemeChange);
    return () => {
      if (typeof media.removeEventListener === "function") media.removeEventListener("change", onSystemThemeChange);
      else media.removeListener(onSystemThemeChange);
    };
  }, [themeMode]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== THEME_MODE_STORAGE_KEY) return;
      setThemeMode(isThemeMode(event.newValue) ? event.newValue : "system");
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function updateBottomNavShortcuts(shortcuts: Screen[]) {
    setBottomNavShortcuts(shortcuts);
    void saveBottomNavShortcuts(shortcuts);
  }

  function updateSearchDisplayMode(mode: SearchDisplayMode) {
    setSearchDisplayMode(mode);
    void saveSearchDisplayMode(mode);
  }

  function updateThemeMode(mode: ThemeMode) {
    setThemeMode(mode);
    saveThemeMode(mode);
  }

  // Keeps the address bar honest (a manual refresh or copied link still
  // resolves to the right item) without going through setRoute/go() -- a
  // *real* route change would re-run the screen's own jumpToId/targetId
  // effect on every single Trước/Tiếp tap, which for e.g. KanjiScreen also
  // resets the level/progress filters (see resolveJumpState's comment).
  // replaceState never touches those, so it's paging-safe. The `?from=`
  // query string (see readFromPath) rides along untouched, since only the
  // pathname portion is rebuilt here.
  const syncCurrentItem = useCallback(
    (id: string | undefined, text?: string, senseId?: string) => {
      // Item screens report `undefined` once before their persisted state has
      // loaded. Keep a deep link intact until the actual target is emitted.
      if (!id && routeSyncPendingRef.current && currentItemRef.current) return;
      const previousId = currentItemRef.current;
      const previousSenseId = currentSenseRef.current;
      currentItemRef.current = id;
      currentSenseRef.current = senseId;
      const url = new URL(location.href);
      const routeName = lookupRouteName(screen);
      const relativePath = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length).replace(/^\/+/, "") : url.pathname.replace(/^\/+/, "");
      const currentRouteName = relativePath.split("/")[0];
      const isTextLookupRoute = url.searchParams.has("param") && currentRouteName === routeName && ["vocab", "kanji", "bunpo"].includes(screen);

      if (id && isTextLookupRoute && text) {
        url.searchParams.set("param", text);
        if (screen === "bunpo" && senseId) url.searchParams.set("sense", senseId);
        else if (screen === "bunpo") url.searchParams.delete("sense");
        const href = `${url.pathname}${url.search}${url.hash}`;
        if (routeSyncPendingRef.current || id === previousId || (screen === "bunpo" && senseId !== previousSenseId)) {
          history.replaceState(history.state, "", href);
        } else {
          history.pushState(null, "", href);
        }
      } else {
        const path = id ? `${BASE}${screen}/${encodeURIComponent(id)}` : `${BASE}${screen}`;
        const params = new URLSearchParams(location.search);
        if (screen === "bunpo" && senseId) params.set("sense", senseId);
        else if (screen === "bunpo") params.delete("sense");
        const query = params.toString();
        history.replaceState(history.state, "", `${path}${query ? `?${query}` : ""}`);
      }
      routeSyncPendingRef.current = false;
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
      if (next.screen !== "quizBook") setQuizBookJlptMode(false);
      setRoute(next);
      setSearchPopupOpen(new URLSearchParams(location.search).get("lookup") === "1");
      currentItemRef.current = next.targetId;
      currentSenseRef.current = next.targetSenseId;
      routeSyncPendingRef.current = true;
      window.scrollTo(0, 0);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function go(next: Screen, id?: string, opts: { linking?: boolean; lookupText?: string; searchQuery?: string; searchTypes?: string[]; senseId?: string; kanjiView?: "map"; examTipsLevel?: "N3"; examTipsSkill?: "reading" | "listening"; examTipsLesson?: string } = {}) {
    if (next !== "quizBook") setQuizBookJlptMode(false);
    // Menu is the root ("/japanese-extension/"), not "/japanese-extension/menu"
    // -- it's the landing page, not a content category.
    let path = opts.lookupText !== undefined
      ? `${BASE}${lookupRouteName(next)}`
      : next === "menu" && !id
        ? BASE
        : `${BASE}${next}${id ? `/${encodeURIComponent(id)}` : ""}`;
    // Where to send the user back to after they followed a cross-content
    // link (e.g. a Kanji reference from inside a Reading passage) -- carried
    // as ?from=<screen>&fromId=<id> (see readFromPath) rather than plain
    // React state, so a reload/shared link/browser back-forward all still
    // resolve the right "return to" target instead of just this one live
    // session. Set whenever go() is called with a target id (every current
    // cross-link call site passes one; a plain section switch via the
    // bottom nav/sidebar never does) unless explicitly suppressed (goBack()
    // itself does, to stay one level deep instead of chaining back↔back).
    const sourceSearch = screen === "search" ? new URLSearchParams(location.search) : null;
    const nextReturnTo: ReturnTo | null = opts.linking !== false && id
      ? {
          screen,
          targetId: currentItemRef.current,
          targetSenseId: screen === "bunpo" ? currentSenseRef.current : undefined,
          searchQuery: sourceSearch?.get("q") ?? undefined,
          searchTypes: sourceSearch?.get("types")?.split(",").filter(Boolean),
        }
      : null;
    if (nextReturnTo) {
      const params = new URLSearchParams({ from: nextReturnTo.screen });
      if (nextReturnTo.targetId) params.set("fromId", nextReturnTo.targetId);
      if (nextReturnTo.targetSenseId) params.set("fromSense", nextReturnTo.targetSenseId);
      if (nextReturnTo.screen === "search") {
        const currentSearch = new URLSearchParams(location.search);
        if (currentSearch.has("q")) params.set("fromQ", currentSearch.get("q") ?? "");
        if (currentSearch.has("types")) params.set("fromTypes", currentSearch.get("types") ?? "");
      }
      if (opts.lookupText !== undefined) params.set("param", opts.lookupText);
      if (opts.senseId) params.set("sense", opts.senseId);
      path += `?${params}`;
    } else if (opts.lookupText !== undefined) {
      const params = new URLSearchParams({ param: opts.lookupText });
      if (opts.senseId) params.set("sense", opts.senseId);
      path += `?${params}`;
    } else if (opts.searchQuery !== undefined || opts.searchTypes !== undefined) {
      const params = new URLSearchParams();
      if (opts.searchQuery) params.set("q", opts.searchQuery);
      if (opts.searchTypes?.length) params.set("types", opts.searchTypes.join(","));
      const query = params.toString();
      if (query) path += `?${query}`;
    } else if (next === "examTips") {
      const params = new URLSearchParams({ level: opts.examTipsLevel ?? "N3", skill: opts.examTipsSkill ?? "reading" });
      if (opts.examTipsLesson) params.set("lesson", opts.examTipsLesson);
      path += `?${params.toString()}`;
    } else if (next === "bunpo" && opts.senseId) {
      path += `?${new URLSearchParams({ sense: opts.senseId })}`;
    }
    if (next === "kanji" && opts.kanjiView === "map") {
      const queryIndex = path.indexOf("?");
      const basePath = queryIndex >= 0 ? path.slice(0, queryIndex) : path;
      const params = new URLSearchParams(queryIndex >= 0 ? path.slice(queryIndex + 1) : "");
      params.set("view", "map");
      path = `${basePath}?${params.toString()}`;
    }
    history.pushState({ lookupPopup: false }, "", path);
    currentItemRef.current = id;
    currentSenseRef.current = opts.senseId;
    routeSyncPendingRef.current = true;
    setRoute({ screen: next, targetId: id, targetSenseId: opts.senseId, returnTo: nextReturnTo });
    window.scrollTo(0, 0);
    // Fire-and-forget -- Home's "Tiếp tục học" banner reads this back on its
    // own next mount, nothing here needs to await it.
    void saveLastActive(next, id, opts.senseId);
  }

  function navigate(next: Screen, id?: string) {
    if (next === "search" && searchDisplayMode === "popup" && !id) {
      const url = new URL(location.href);
      url.searchParams.set("lookup", "1");
      history.pushState({ lookupPopup: true }, "", url);
      setSearchPopupOpen(true);
      return;
    }
    go(next, id);
  }

  function goBack() {
    if (!returnTo) return;
    go(returnTo.screen, returnTo.targetId, {
      linking: false,
      senseId: returnTo.targetSenseId,
      searchQuery: returnTo.searchQuery,
      searchTypes: returnTo.searchTypes,
    });
  }

  function openSearchResult(next: Screen, id: string, text: string, senseId?: string) {
    go(next, id, { lookupText: text, senseId });
  }

  function closeSearchPopup() {
    if (new URLSearchParams(location.search).get("lookup") === "1" && history.state?.lookupPopup === true) {
      history.back();
      return;
    }
    const url = new URL(location.href);
    url.searchParams.delete("lookup");
    url.searchParams.delete("q");
    url.searchParams.delete("types");
    history.replaceState(history.state, "", url);
    setSearchPopupOpen(false);
  }

  const navKey = targetId ? `${screen}:${targetId}` : screen;
  const loadingPresentation = getLoadingPresentation(screen);

  let content: React.ReactNode;
  if (screen === "menu") {
    content = <HomeScreen onNavigate={go} />;
  } else if (screen === "vocab") {
    content = (
      <VocabScreen
        onOpenKanji={(kanjiId) => go("kanji", kanjiId)}
        onOpenKanjiMap={(kanjiId) => go("kanji", kanjiId, { kanjiView: "map" })}
        onOpenReading={(passageId) => go("reading", passageId)}
        onOpenQuizBook={(questionId) => go("quizBook", questionId)}
        onOpenQuiz={() => go("quiz")}
        onOpenVocab={(vocabId) => go("vocab", vocabId)}
        jumpToId={targetId}
        onCurrentItemChange={syncCurrentItem}
      />
    );
  } else if (screen === "flashcards") {
    content = <FlashcardScreen onOpenVocab={(vocabId) => go("vocab", vocabId)} />;
  } else if (screen === "search") {
    content = (
      <SearchScreen
        onOpenKanji={(kanjiId, text) => openSearchResult("kanji", kanjiId, text)}
        onOpenVocab={(vocabId, text) => openSearchResult("vocab", vocabId, text)}
        onOpenBunpo={(bunpoId, senseId, text) => openSearchResult("bunpo", bunpoId, text, senseId)}
      />
    );
  } else if (screen === "kanji") {
    content = (
      <KanjiScreen
        onOpenVocab={(vocabId) => go("vocab", vocabId)}
        onOpenQuiz={() => go("quiz")}
        jumpToId={targetId}
        initialMapMode={new URLSearchParams(location.search).get("view") === "map"}
        onCurrentItemChange={syncCurrentItem}
      />
    );
  } else if (screen === "bunpo") {
    content = (
      <BunpoScreen
        onOpenReading={(passageId) => go("reading", passageId)}
        onOpenQuizBook={(questionId) => go("quizBook", questionId)}
        onOpenMap={(level) => go("bunpoMap", level === "N3" ? "N3" : undefined)}
        targetId={targetId}
        targetSenseId={targetSenseId}
        onCurrentItemChange={syncCurrentItem}
      />
    );
  } else if (screen === "bunpoMap") {
    content = (
      <BunpoMapScreen
        level={targetId === "N3" ? "N3" : "N5"}
        onChangeLevel={(level) => go("bunpoMap", level === "N3" ? "N3" : undefined)}
        onOpenBunpo={(bunpoId, senseId) => go("bunpo", bunpoId, { senseId })}
        onBackToGrammar={() => go("bunpo")}
      />
    );
  } else if (screen === "quiz") {
    content = (
      <QuizScreen
        onOpenKanji={(kanjiId) => go("kanji", kanjiId)}
        onOpenVocab={(vocabId) => go("vocab", vocabId)}
        onOpenBunpo={(bunpoId, senseId) => go("bunpo", bunpoId, { senseId })}
      />
    );
  } else if (screen === "quizBook") {
    content = quizBookJlptMode ? (
      <JlptQuestionStudyPanel onBack={() => setQuizBookJlptMode(false)} onBackLabel="Luyện đề" />
    ) : (
      <QuizBookScreen
        targetId={targetId}
        onCurrentItemChange={syncCurrentItem}
        onOpenJlptPractice={() => setQuizBookJlptMode(true)}
      />
    );
  } else if (screen === "reading" || screen === "news" || screen === "aiStories" || screen === "savedStories") {
    content = (
      <ReadingScreen
        collection={screen === "news" ? "news" : screen === "reading" ? "all" : "stories"}
        savedOnlyView={screen === "savedStories"}
        targetId={targetId}
        onOpenSavedStories={() => go("savedStories")}
        onOpenStories={() => go("aiStories")}
        onOpenExamTips={() => go("examTips", undefined, { examTipsSkill: "reading" })}
        onOpenVocab={(vocabId) => go("vocab", vocabId)}
        onOpenBunpo={(bunpoId, senseId) => go("bunpo", bunpoId, { senseId })}
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
        onOpenBunpo={(bunpoId, senseId) => go("bunpo", bunpoId, { senseId })}
        onDone={() => go("menu")}
      />
    );
  } else if (screen === "guide") {
    content = <GuideScreen onNavigate={navigate} />;
  } else if (screen === "examTips") {
    content = <ExamTipsScreen onNavigate={go} />;
  } else if (screen === "backup") {
    content = <BackupScreen />;
  } else if (screen === "listening") {
    content = <ListeningHubScreen initialTab="listening" jumpToId={targetId} onCurrentItemChange={syncCurrentItem} onOpenExamTips={() => go("examTips", undefined, { examTipsSkill: "listening" })} />;
  } else if (screen === "dictation") {
    content = <ListeningHubScreen initialTab="dictation" jumpToId={targetId} onCurrentItemChange={syncCurrentItem} onOpenExamTips={() => go("examTips", undefined, { examTipsSkill: "listening" })} />;
  } else if (screen === "exams") {
    content = <DeThiScreen targetId={targetId} onNavigate={go} onCurrentItemChange={syncCurrentItem} />;
  } else if (screen === "itBookVocab") {
    content = <ItBookVocabScreen jumpToLesson={targetId ? Number(targetId) : undefined} />;
  } else if (screen === "itBookLessons") {
    content = <ItBookLessonsScreen onOpenVocab={(lesson) => go("itBookVocab", String(lesson))} />;
  } else if (screen === "roadmap") {
    content = <RoadmapScreen onNavigate={go} />;
  } else if (screen === "podcast") {
    content = (
      <PodcastScreen
        jumpToId={targetId}
        onCurrentItemChange={syncCurrentItem}
        onOpenVocab={(vocabId) => go("vocab", vocabId)}
        onOpenBunpo={(bunpoId, senseId) => go("bunpo", bunpoId, { senseId })}
      />
    );
  } else if (screen === "matchGame") {
    content = <MatchGameScreen />;
  } else if (screen === "settings") {
    content = (
      <SettingsScreen
        shortcuts={bottomNavShortcuts}
        onChange={updateBottomNavShortcuts}
        searchDisplayMode={searchDisplayMode}
        onSearchDisplayModeChange={updateSearchDisplayMode}
        themeMode={themeMode}
        onThemeModeChange={updateThemeMode}
      />
    );
  } else {
    content = <LegacyApp key={navKey} />;
  }

  return (
    <DevToolsGuard>
      <ConfirmProvider>
        <PwaUpdateManager />
        <WebAppShell
          active={screen === "bunpoMap" ? "bunpo" : screen}
          onNavigate={navigate}
          returnTo={returnTo}
          onGoBack={goBack}
          bottomNavShortcuts={bottomNavShortcuts}
          searchPopupEnabled={searchDisplayMode === "popup"}
          themeMode={themeMode}
          onThemeModeChange={updateThemeMode}
        >
          <Suspense fallback={<LoadingScreen {...loadingPresentation} />}>{content}</Suspense>
        </WebAppShell>
{searchPopupOpen ? (
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Tra cứu nhanh"
    className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 md:p-8"
    onClick={closeSearchPopup}
  >
    <div
      className="relative mx-auto min-h-0 max-h-[calc(100dvh-1.5rem)] max-w-3xl overflow-hidden rounded-2xl bg-white pt-10 shadow-2xl md:max-h-none md:pt-2"
      onClick={(event) => event.stopPropagation()}
    >
              <button
                type="button"
                aria-label="Đóng Tra cứu"
                onClick={closeSearchPopup}
                className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-neutral-500 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-100 hover:text-neutral-800"
              >
                <X size={18} />
              </button>
              <Suspense fallback={<LoadingScreen variant="study" title="Tra cứu nhanh" />}>
                <SearchScreen
                  popup
                  onOpenKanji={(id, text) => {
                    setSearchPopupOpen(false);
                    openSearchResult("kanji", id, text);
                  }}
                  onOpenVocab={(id, text) => {
                    setSearchPopupOpen(false);
                    openSearchResult("vocab", id, text);
                  }}
                  onOpenBunpo={(id, senseId, text) => {
                    setSearchPopupOpen(false);
                    openSearchResult("bunpo", id, text, senseId);
                  }}
                />
              </Suspense>
            </div>
          </div>
        ) : null}
      </ConfirmProvider>
    </DevToolsGuard>
  );
}
