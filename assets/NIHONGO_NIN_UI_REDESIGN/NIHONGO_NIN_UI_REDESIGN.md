# Nihongo Nin — UI/UX Redesign Note

> **Purpose:** Redesign the Nihongo Nin Japanese-learning web app UI while preserving all existing application logic and functionality.
>
> **Current stack:** React + Vite  
> **Target:** Responsive Web App — PC / Laptop / Tablet / Mobile  
> **Visual reference:** `nihongo-nin-ui-mockup.png`

---

## 1. Design Goal

The current UI feels somewhat simple. The new direction should make Nihongo Nin feel like a polished, modern language-learning product rather than a generic admin dashboard.

### Target feeling

- Modern
- Clean
- Friendly
- Minimal but not boring
- Japanese learning aesthetic
- Soft rounded cards
- Clear typography
- Plenty of whitespace
- Subtle shadows
- Light borders
- Soft accent colors
- Strong visual hierarchy
- Comfortable Japanese reading experience

### Inspiration

The visual direction can take inspiration from products such as:

- Duolingo
- Bunpro
- Modern language-learning applications
- Modern SaaS products

Do **not** copy another product directly. Nihongo Nin should have its own identity.

---

## 2. Critical Rule — Preserve Existing Logic

This is primarily a **UI / UX / responsive design refactor**.

Think of it as:

```text
Existing application engine
        ↓
Existing business logic
        ↓
Existing data / state / API
        ↓
NEW presentation layer
        ↓
Responsive Nihongo Nin UI
```

### Must preserve

- Business logic
- API calls
- Data fetching
- State management
- Hooks
- Authentication
- Routing
- URL structure
- localStorage / sessionStorage
- Database/data models
- Quiz logic
- Scoring
- Learning progress calculations
- Vocabulary data
- Grammar data
- Reading data
- User progress
- Existing functionality

### Do NOT

- Rewrite the entire application
- Replace React/Vite
- Change backend APIs
- Change database models
- Remove existing features
- Replace working business logic
- Replace routing unnecessarily
- Replace state management unnecessarily
- Change authentication
- Delete existing functionality
- Add fake learning data
- Hardcode progress
- Hardcode quiz results
- Hardcode vocabulary or grammar content

If something is unclear, **preserve the existing behavior**.

If a UI improvement requires changing business logic, do not do it.

---

# 3. Visual Reference

The generated visual mockup is included with this note:

**`nihongo-nin-ui-mockup.png`**

It demonstrates:

- Desktop learning dashboard
- Responsive mobile UI
- Sidebar navigation
- Mobile bottom navigation
- Daily learning progress
- Recommended learning cards
- Vocabulary
- Grammar
- Quiz
- Reading
- Progress analytics
- Calendar
- Weekly learning statistics
- Japanese-learning visual identity

The mockup is a **visual direction**, not a requirement to reproduce every pixel.

Use the existing application's real content and functionality.

---

# 4. Recommended Technology Direction

Keep the existing React + Vite architecture.

Recommended UI stack:

```text
React + Vite
    │
    ├── TypeScript
    │
    ├── Tailwind CSS
    │
    ├── shadcn/ui
    │
    ├── Lucide Icons
    │
    ├── Framer Motion (optional)
    │
    └── Recharts (only if useful / necessary)
```

### Recommended UI system

**shadcn/ui** is the preferred direction because components can be adapted directly to the project instead of forcing the application into a rigid template.

Potential components:

- Card
- Button
- Badge
- Progress
- Tabs
- Dialog
- Dropdown
- Tooltip
- Sheet
- Accordion
- Calendar
- Chart

Do not add dependencies unnecessarily if the project already has equivalent components.

---

# 5. Responsive Architecture

The application is now a **web application**, not a Chrome-extension-only interface.

It must be designed for:

```text
Desktop       1440px+
Laptop        1024–1439px
Tablet        768–1023px
Mobile        320–767px
```

Test approximately at:

- 1440px
- 1280px
- 1024px
- 768px
- 430px
- 390px
- 375px
- 320px

### No horizontal overflow

Ensure:

- No horizontal scrolling caused by layout bugs
- No clipped text
- No buttons outside viewport
- No cards wider than viewport
- No unusable tables
- No desktop sidebar consuming most of the mobile screen

---

# 6. Desktop Layout

Recommended structure:

```text
┌─────────────────────────────────────────────────────┐
│ Sidebar │ Top Header                                │
│         ├───────────────────────────────────────────┤
│         │                                           │
│         │ Main Content                              │
│         │                                           │
│         │                                           │
└─────────────────────────────────────────────────────┘
```

## Sidebar

Brand:

```text
🇯🇵 Nihongo Nin
日本語を学ぼう
```

Navigation groups:

### 学習する

- 🏠 Home
- 単語 (Vocabulary)
- 文法 (Grammar)
- 漢字 (Kanji)
- 読む (Reading)

### 練習する

- クイズ (Quiz)
- 問題集 (Exercise)
- タイピング (Typing)

### その他

- 進捗 (Progress)
- ブックマーク (Bookmark)
- 設定 (Settings)

Sidebar should be compact and visually calm.

---

# 7. Mobile Layout

Do **not** simply shrink the desktop sidebar.

Use a mobile-specific navigation system.

Recommended:

```text
┌─────────────────────────┐
│ ☰  Nihongo Nin      👤 │
├─────────────────────────┤
│                         │
│       Main Content      │
│                         │
│                         │
├─────────────────────────┤
│ Home Learn Quiz Progress│
└─────────────────────────┘
```

### Mobile components

- Mobile Header
- Bottom Navigation
- Responsive Cards
- Touch-friendly Controls
- Horizontal scrolling only where appropriate

Minimum touch target should generally be around **44px**.

Important actions should be comfortable to operate with one hand.

---

# 8. Home / Dashboard

The Home page should feel like a **learning dashboard**, not an admin dashboard.

Recommended order:

1. Greeting
2. Today's learning progress
3. Today's recommendations
4. Learning progress
5. Weekly learning statistics
6. Recent activity if existing data supports it

## Greeting

Example:

```text
おかえりなさい！

今日も一緒に日本語を頑張りましょう。
```

## Today's Progress

```text
今日の学習進捗

75%

22 / 30 分

[ 続ける → ]
```

Use real progress data.

Do not invent statistics.

## Recommended Learning

Four cards:

```text
┌────────────┐
│ 単語       │
│ Vocabulary │
│            │
│ N3語彙     │
│ 20単語   → │
└────────────┘

┌────────────┐
│ 文法       │
│ Grammar    │
│            │
│ ～わけではない│
│ 初級文法  → │
└────────────┘

┌────────────┐
│ 読む       │
│ Reading    │
│            │
│ 短い文章   │
│ 1 passage→ │
└────────────┘

┌────────────┐
│ クイズ     │
│ Quiz       │
│            │
│ N3総合問題 │
│ 20問     → │
└────────────┘
```

---

# 9. Vocabulary UI

Vocabulary should be optimized for fast learning/review.

Recommended:

```text
N3 Vocabulary

[すべて] [新しい] [学習中] [覚えた]

────────────────────────

経験
けいけん

experience

例文:
いろいろな経験をすることは大切です。

🔊                         ☆
```

Preserve existing:

- Vocabulary data
- Search
- Filtering
- Sorting
- Audio
- Bookmark
- Learning status
- Review logic

Only improve presentation.

---

# 10. Grammar UI

Use a large, readable learning card.

Example:

```text
┌──────────────────────────────────────┐
│ ～わけではない                    N3 │
│                                      │
│ 意味                                 │
│ 「必ずしも〜とは限らない」           │
│                                      │
│ 接続                                 │
│ 普通形 + わけではない                │
│                                      │
│ 例文                                 │
│ 日本語が嫌いなわけではありません。   │
│                                      │
│ 💡 Point                             │
│ ...                                  │
└──────────────────────────────────────┘
```

Prioritize:

- Japanese typography
- Clear hierarchy
- Example sentences
- Grammar pattern highlighting
- Readability
- Optional collapsible sections

Do not modify grammar data or learning logic.

---

# 11. Quiz UI

The quiz should feel focused and distraction-free.

Example:

```text
Question 7 / 20

次の文の意味は？

日本へ行きたくなりました。

┌────────────────────────────┐
│ A. Tôi đã đi Nhật          │
└────────────────────────────┘

┌────────────────────────────┐
│ B. Tôi bắt đầu muốn đi Nhật│
└────────────────────────────┘

┌────────────────────────────┐
│ C. Tôi không muốn đi Nhật  │
└────────────────────────────┘

┌────────────────────────────┐
│ D. Tôi sẽ đi Nhật          │
└────────────────────────────┘

             [次の問題 →]
```

Preserve:

- Answer validation
- Scoring
- Question generation
- Randomization
- Question progress
- Result calculation

Only redesign the interface.

---

# 12. Reading UI

Reading needs to prioritize **content readability**.

Recommended:

```text
┌─────────────────────────────────────┐
│ 読む                                │
│                                     │
│ 友達との旅行                        │
│                                     │
│ 昨週、友達と京都に旅行に行きました。 │
│ 天気はとてもよくて、観光するには... │
│                                     │
│ ...                                 │
│                                     │
├─────────────────────────────────────┤
│ 質問に答える                        │
│                                     │
│ Q1. 誰と旅行に行きましたか？        │
│                                     │
│ ○ 家族と                            │
│ ● 友達と                            │
└─────────────────────────────────────┘
```

Prioritize:

- Large readable Japanese text
- Comfortable line height
- Narrow reading width
- Clear paragraphs
- Vocabulary highlighting if already supported
- Questions below passage
- Mobile readability

Avoid surrounding the reading content with too many distracting cards.

---

# 13. Progress UI

Use real learning data where available.

Potential structure:

```text
学習レポート

┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ 学習時間 │ │ 学習単語 │ │ 問題数   │ │ 正解率   │
│18h 32m   │ │324       │ │567       │ │78%       │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

Then:

- Weekly activity
- Skill progress
- Vocabulary progress
- Grammar progress
- Reading progress

If charts already exist, restyle them.

If charts do not exist, a lightweight chart library may be introduced only when justified.

**Never create fake data.**

---

# 14. Design System

## Typography

Recommended:

```text
Japanese: Noto Sans JP
English:  Inter
```

Use suitable fallbacks.

Japanese text should remain readable on mobile.

## Border Radius

Recommended:

- Cards: 12–16px
- Buttons: 8–12px
- Inputs: 10–12px

Avoid making everything excessively rounded.

## Color Direction

Mostly neutral interface:

```text
Background → very light neutral
Cards      → white
Primary    → Japanese-inspired red / pink
Secondary  → indigo / purple
Success    → green
Warning    → orange
```

Do not make the entire application red.

Use primary accent mainly for:

- Primary buttons
- Active navigation
- Progress indicators
- Important highlights

---

# 15. Icons

Use Lucide Icons if appropriate.

Icons should be:

- Consistent
- Simple
- Small
- Secondary to text

Do not replace all text labels with icons.

---

# 16. Component Architecture

Avoid one giant React component.

Recommended structure:

```text
src/
├── components/
│   ├── layout/
│   │   ├── AppShell
│   │   ├── Sidebar
│   │   ├── Header
│   │   ├── MobileHeader
│   │   └── MobileBottomNav
│   │
│   ├── dashboard/
│   │   ├── Greeting
│   │   ├── DailyProgressCard
│   │   ├── RecommendationCards
│   │   ├── LearningProgress
│   │   └── WeeklyStats
│   │
│   ├── vocabulary/
│   │   ├── VocabularyHeader
│   │   ├── VocabularyFilters
│   │   ├── VocabularyCard
│   │   └── VocabularyList
│   │
│   ├── grammar/
│   │   ├── GrammarHeader
│   │   ├── GrammarCard
│   │   ├── GrammarExample
│   │   └── GrammarPoint
│   │
│   ├── quiz/
│   │   ├── QuizProgress
│   │   ├── QuestionCard
│   │   ├── AnswerOption
│   │   └── QuizNavigation
│   │
│   └── reading/
│       ├── ReadingHeader
│       ├── ReadingContent
│       └── ReadingQuestion
│
└── ...
```

Adapt this structure to the actual existing project.

Do not blindly create directories if equivalent components already exist.

---

# 17. Implementation Strategy

Before modifying anything, inspect the repository.

Identify:

1. Project structure
2. Routing
3. Existing pages
4. Shared components
5. State management
6. API/data fetching
7. CSS/Tailwind setup
8. Business-logic-heavy components
9. Safe presentation-layer components

Then create an implementation plan.

### Preferred process

```text
Step 1
Audit existing project

        ↓

Step 2
Identify UI-only components

        ↓

Step 3
Create AppShell / responsive navigation

        ↓

Step 4
Redesign Home

        ↓

Step 5
Redesign Vocabulary

        ↓

Step 6
Redesign Grammar

        ↓

Step 7
Redesign Quiz

        ↓

Step 8
Redesign Reading

        ↓

Step 9
Redesign Progress

        ↓

Step 10
Responsive QA
```

Implement incrementally.

Keep the application working after each major section.

---

# 18. Claude Code Prompt

Use the following prompt when asking Claude Code to implement the redesign:

```text
# UI/UX Redesign — Nihongo Nin Web App

Redesign the existing Nihongo Nin application UI to look like a polished, modern Japanese language learning web app.

The application is now a responsive web application, not a Chrome-extension-only UI.

Target devices:
- Desktop / PC
- Laptop
- Tablet
- Mobile phone

Use the provided Nihongo Nin UI mockup as the main visual direction.

IMPORTANT:
This is primarily a UI / UX / responsive design refactor.

Before making changes, inspect the existing repository thoroughly.

You MUST preserve:
- Existing business logic
- Existing API calls
- Existing data fetching
- Existing state management
- Existing hooks
- Existing authentication
- Existing routing
- Existing URL structure
- Existing localStorage/sessionStorage usage
- Existing database/data models
- Existing quiz logic
- Existing scoring logic
- Existing learning progress calculations
- Existing vocabulary/grammar/reading data
- Existing user progress
- Existing functionality

Do NOT rewrite working logic just because you think it can be improved.

Do NOT change API contracts.
Do NOT change backend behavior.
Do NOT change data structures unless absolutely required for rendering the new UI.

If the current implementation is messy but functional, leave the logic untouched and improve the presentation layer around it.

The desired visual language:
- Modern
- Clean
- Friendly
- Minimal but not boring
- Japanese learning aesthetic
- Soft rounded cards
- Clear typography
- Plenty of whitespace
- Subtle shadows
- Light borders
- Soft accent colors
- Strong visual hierarchy
- Comfortable Japanese reading experience

Avoid:
- Generic admin dashboard appearance
- Excessive gradients
- Excessive colors
- Huge text everywhere
- Dense tables
- Overly complicated navigation
- Excessive animations
- Cluttered cards

Keep React + Vite.

Use the project's existing UI system where possible. If appropriate, use Tailwind CSS, shadcn/ui, Lucide icons, and lightweight animation/chart libraries without unnecessary dependencies.

Desktop:
- Persistent sidebar
- Top header
- Main content

Mobile:
- Mobile header
- Bottom navigation
- Responsive cards
- Touch-friendly controls
- Do NOT simply shrink the desktop sidebar

Recommended navigation:

学習する
- Home
- Vocabulary
- Grammar
- Kanji
- Reading

練習する
- Quiz
- Exercise
- Typing

その他
- Progress
- Bookmark
- Settings

Redesign:
1. Home / Dashboard
2. Vocabulary
3. Grammar
4. Quiz
5. Reading
6. Progress

Use real existing data only.
Do not create fake statistics.

For Home:
- Greeting
- Today's learning progress
- Recommended learning
- Skill progress
- Weekly statistics

For Vocabulary:
- Filters
- Search
- Vocabulary cards
- Audio/bookmark controls
- Learning status

For Grammar:
- Grammar pattern
- Meaning
- Formation
- Examples
- Notes / points

For Quiz:
- Question progress
- Question card
- Answer options
- Next button
- Existing scoring/validation unchanged

For Reading:
- Comfortable Japanese reading layout
- Passage
- Questions
- Existing reading functionality unchanged

For Progress:
- Existing learning statistics
- Skill progress
- Weekly activity
- Charts only when supported by real data

Responsive breakpoints should work well around:
- 1440px
- 1280px
- 1024px
- 768px
- 430px
- 390px
- 375px
- 320px

No horizontal overflow.

Before coding:
1. Audit the repository.
2. Identify routing, state, API/data flow and existing UI components.
3. Identify which components contain business logic.
4. Identify which components can safely be visually refactored.
5. Produce a concise implementation plan.

Then implement incrementally.

After implementation:
- Run the application
- Verify all routes
- Verify navigation
- Verify vocabulary
- Verify grammar
- Verify quiz
- Verify reading
- Verify progress
- Verify authentication if applicable
- Check desktop
- Check mobile
- Check TypeScript errors
- Check console errors
- Check horizontal overflow

If there is a conflict between visual redesign and existing functionality:

EXISTING FUNCTIONALITY ALWAYS WINS.

Do not rewrite the application architecture merely to achieve the new visual design.
```

---

# 19. Definition of Done

The redesign is considered successful when:

### Functionality

- Existing features still work
- Existing data still works
- Existing APIs still work
- Existing routes still work
- Quiz behavior is unchanged
- Progress calculations are unchanged

### Visual

- UI no longer feels generic/simple
- Consistent design system
- Clear learning hierarchy
- Japanese typography is comfortable
- Cards and navigation feel polished
- Visual identity is consistent

### Responsive

- PC works well
- Laptop works well
- Tablet works well
- Mobile works well
- No horizontal overflow
- Touch targets are comfortable

### Code

- No unnecessary rewrite
- No duplicated logic
- Reusable presentation components
- Existing conventions respected
- TypeScript passes
- No major console errors

---

# 20. Recommended Priority

If implementation time is limited, prioritize:

```text
1. App Shell / Navigation       ⭐⭐⭐⭐⭐
2. Home Dashboard               ⭐⭐⭐⭐⭐
3. Mobile Responsive UX         ⭐⭐⭐⭐⭐
4. Vocabulary                   ⭐⭐⭐⭐
5. Grammar                      ⭐⭐⭐⭐
6. Quiz                         ⭐⭐⭐⭐
7. Reading                      ⭐⭐⭐⭐
8. Progress                     ⭐⭐⭐
9. Animations / polish          ⭐⭐
```

The biggest improvement should come from the **overall layout and responsive experience**, not from adding lots of decorative effects.

---

# 21. Design Principle

The core principle for Nihongo Nin:

> **Make learning feel simple, focused, and rewarding.**

Every UI decision should make it easier for the user to:

```text
Open app
   ↓
Know what to study
   ↓
Start immediately
   ↓
Practice comfortably
   ↓
See progress
   ↓
Want to continue tomorrow
```

Avoid turning the application into a complicated statistics dashboard.
