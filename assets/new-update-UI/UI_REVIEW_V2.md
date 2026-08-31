# Nihongo Nin — UI Review V2 & Final Implementation Guide

> Baseline reviewed: `mockup-nihongo-nin-redesign.html`
>
> Purpose: use this document with Claude Code to implement the redesign in the **real React + Vite application** without changing existing business logic, data, routes, or learning behavior.

---

# 1. Executive decision

The current artifact is a **good visual/UX direction** and should be used as the baseline.

The main idea to keep is:

> **Content First + Progressive Disclosure**

Meaning:

```text
Page title
↓
Compact toolbar
↓
Active filters (only when needed)
↓
Main learning content
```

Do NOT return to the previous pattern:

```text
Page title
↓
Many filter chips
↓
Many category buttons
↓
Sort
↓
Random
↓
Content
```

The artifact already demonstrates the desired direction:

- mobile filter sheet
- compact toolbar
- active filter chips
- desktop sidebar
- reading list instead of a dense mobile grid
- focused "study/exercise" screens with controls removed

These are the correct foundation.

---

# 2. 🟢 KEEP — Parts that are already good

## 2.1 Mobile Content First

Keep:

```text
Header
↓
Page title
↓
[ Bộ lọc ] [ Sắp xếp ] [ Random ]
↓
Active filters
↓
Content
```

This directly solves the biggest issue in the previous UI.

---

## 2.2 Filter Sheet

Keep the mobile filter sheet/bottom-sheet concept.

All existing filter options should move inside it rather than being removed.

Example:

```text
Bộ lọc

Cấp độ
○ N5  ○ N4  ● N3  ○ N2  ○ N1

Nguồn
□ Mimikara N3
□ Tango N3
□ Tango N4

Loại từ
□ Danh từ
□ Động từ
□ Tính từ
□ Từ láy

Bộ sưu tập
□ Từ đồng nghĩa N3
□ 91 trang từ thường dùng
□ 200 động từ N3-N4

[ Xóa ]             [ Áp dụng ]
```

The exact options must come from the existing application.

Do not invent or delete options.

---

## 2.3 Active Filters

Keep active filter chips.

Example:

```text
Đang lọc:
[N3 ×] [Mimikara N3 ×] [Động từ ×]
```

On small screens:

- horizontal scroll is acceptable
- avoid creating many wrapped rows

---

## 2.4 Desktop Sidebar

Keep the general desktop pattern:

```text
┌──────────────┬─────────────────────────────┐
│ Navigation   │ Page title                  │
│              │ Toolbar                     │
│              │ Active filters               │
│              │ Content                     │
└──────────────┴─────────────────────────────┘
```

The sidebar should remain persistent on desktop.

---

## 2.5 Reading List

Keep the decision to use a readable list/card layout on mobile.

Avoid:

```text
読  読  読  読  読
読  読  読  読  読
```

The user needs enough information to distinguish one reading exercise from another.

Preferred:

```text
01
電車の中で
Speed Master N3
Trung văn · ~5 phút
Chưa làm
```

---

## 2.6 Focused Exercise Screens

Keep the artifact's concept that active exercise screens should remove unnecessary navigation/filter controls.

When the user is actually:

- reading a passage
- answering a quiz
- studying a vocabulary item

the content should dominate the viewport.

---

# 3. 🟡 CHANGE — Improvements to the artifact before implementation

## 3.1 Mobile Bottom Navigation

The artifact uses:

```text
Home | Voca | Bunpo | Quiz | More
```

Do NOT use this as the final Vietnamese UX.

Prefer:

```text
Trang chủ | Từ vựng | Ngữ pháp | Quiz | Thêm
```

If width becomes tight:

- use icons + smaller labels
- or slightly reduce spacing

Do not shorten "Từ vựng" to "Voca" or "Ngữ pháp" to "Bunpo" merely to save space.

---

## 3.2 Desktop Filter Density

The artifact puts navigation and filter controls into the same sidebar.

This is acceptable for the mockup but should be implemented carefully.

If a filter section becomes long:

```text
Cấp độ
Nguồn
Loại từ
Bộ sưu tập
Trạng thái
...
```

use collapsible sections.

Example:

```text
BỘ LỌC

Cấp độ                 ˅
  ● N3
  ○ N4

Nguồn                  ˅
  ☑ Mimikara N3
  □ Tango N3

Loại từ                >
Bộ sưu tập             >
Trạng thái              >
```

Do not create a permanently huge sidebar.

---

## 3.3 Toolbar Semantics

Keep:

```text
[ Bộ lọc ] [ Sắp xếp ] [ Random ]
```

but treat the controls differently.

### Bộ lọc

Opens filter UI.

### Sắp xếp

Opens sort options.

### Random

Is an action.

Random should NOT become a persistent checkbox/filter.

---

## 3.4 Search

If the existing screen already has search functionality, keep it.

Preferred placement:

```text
Page title
↓
Search
↓
Toolbar
↓
Content
```

or:

```text
Page title

[ 🔎 Tìm kiếm... ]

[ Bộ lọc ] [ Sắp xếp ] [ Random ]
```

Do not remove existing search logic.

---

# 4. 🔴 DO NOT implement these artifact aspects literally

## 4.1 Mock data

Values shown in the artifact such as:

```text
3,046 từ
男性
Mimikara N3
135 bài
0 / 135
```

are visual examples.

They are NOT new application data.

The real app must continue to use its existing:

- API
- local data
- database
- state
- filtering
- pagination
- progress
- learning status

---

## 4.2 Do not rewrite business logic

Claude Code must NOT rewrite:

- SRS/review logic
- learned/unlearned state
- progress calculation
- quiz scoring
- quiz generation
- pagination
- search logic
- filter state logic
- routing
- API contracts
- database schemas

unless a separate bug is discovered and explicitly requested.

---

## 4.3 Do not replace working components unnecessarily

Before creating a new component, search for an existing equivalent.

Prefer:

```text
existing component
↓
extend/refactor
↓
reuse
```

instead of:

```text
new component
+
old component
+
duplicate logic
```

---

# 5. Final Mobile Architecture

## Global

```text
┌──────────────────────────────┐
│ ☰  Nihongo Nin               │
├──────────────────────────────┤
│                              │
│ Từ vựng                      │
│ 3,046 từ                     │
│                              │
│ [ Bộ lọc ] [ Sắp xếp ] [↻] │
│                              │
│ [N3 ×] [Mimikara ×]          │
│                              │
│ ┌──────────────────────────┐ │
│ │                          │ │
│ │       MAIN CONTENT       │ │
│ │                          │ │
│ └──────────────────────────┘ │
│                              │
├──────────────────────────────┤
│ Trang chủ Từ vựng Ngữ pháp  │
│ Quiz                    Thêm │
└──────────────────────────────┘
```

---

# 6. Vocabulary — Final UX

## Default state

```text
Từ vựng
3,046 từ

[ Bộ lọc ] [ Sắp xếp ] [ Random ]

────────────────────────

男性
だんせい

NAM TÍNH
đàn ông

[✓ Đã thuộc]

────────────────────────
```

The vocabulary card should appear early in the viewport.

---

## Filter state

Only show active filters after the user chooses them:

```text
[ Bộ lọc (3) ] [ Sắp xếp ] [ Random ]

Đang lọc:
[N3 ×] [Mimikara N3 ×] [Động từ ×]
```

---

# 7. Reading — Final UX

## Default

```text
Luyện đọc
135 bài

[ Bộ lọc ] [ Sắp xếp ] [ Random ]

Đã hoàn thành
0 / 135

────────────────────────

01
電車の中で
Speed Master N3
Trung văn · ~5 phút
Chưa làm

02
日本人の生活
Speed Master N3
Trung văn · ~7 phút
Chưa làm
```

## Desktop

Use a table/list if useful:

```text
# | Tiêu đề | Nguồn | Độ dài | Trạng thái
```

---

# 8. Grammar — Final UX

```text
Ngữ pháp
1,253 mục

[ Bộ lọc ] [ Sắp xếp ] [ Tìm kiếm ]

[N3 ×]

────────────────────────

～わけではない

Không hẳn là...

普通形 + わけではない

Ví dụ
...
```

Do not expose every grammar category as permanent chips.

---

# 9. Kanji — Final UX

```text
Kanji
N3 · 370 chữ

[ Bộ lọc ] [ Sắp xếp ] [ Random ]

────────────────────────

男

オン: ダン・ナン
くん: おとこ

男性
男の子
男女

[ Chưa học ]
```

---

# 10. Quiz — Final UX

Keep the current quiz configuration concept:

```text
Quiz

Nội dung
[ Kanji ] [ Từ vựng ] [ Ngữ pháp ]

Dạng câu hỏi
[ Xem chữ, đoán nghĩa ]
[ Xem nghĩa, đoán chữ ]

Số câu hỏi
[ 10 câu ▼ ]

Phạm vi
[ Theo bộ lọc hiện tại ▼ ]

[ Bắt đầu ]
```

Do not change scoring or question-generation logic.

---

# 11. Navigation

## Mobile

Bottom nav:

```text
Trang chủ
Từ vựng
Ngữ pháp
Quiz
Thêm
```

Drawer:

```text
Nihongo Nin
日本語を学ぼう

🏠 Trang chủ

HỌC
  Kanji
  Từ vựng
  Ngữ pháp
  Luyện đọc

LUYỆN THI
  Luyện đề
  Quiz

CÔNG CỤ
  Tra cứu
  Thống kê
```

Routes must remain unchanged.

---

# 12. Design System

Create/reuse shared primitives:

```text
PageHeader
FilterBar
ActiveFilters
FilterSheet
SortDropdown
ContentCard
StatusBadge
EmptyState
```

Do not duplicate implementations across pages.

---

# 13. Responsive behavior

Test at:

```text
360px
375px
390px
414px
768px
1024px
1280px
1440px
1920px
```

## At 360px

Must not have:

- horizontal page overflow
- clipped buttons
- broken Japanese text
- bottom nav overlapping content
- filter toolbar wrapping into an ugly multi-row block

If necessary, allow the active-filter row to horizontally scroll.

---

# 14. Visual direction

Keep the current Nihongo Nin visual identity.

Do not completely redesign the brand.

Maintain:

- current primary accent
- soft cards
- moderate border radius
- light shadows
- clear typography
- Japanese-friendly font stack
- restrained use of colors

The goal is:

> **calm, modern, focused study app**

not:

> dashboard packed with controls.

---

# 15. Implementation Plan for Claude Code

## Phase 0 — Audit first

Before editing anything:

1. Inspect React/Vite structure.
2. Inspect routing.
3. Inspect global layout.
4. Inspect mobile navigation.
5. Inspect desktop sidebar.
6. Inspect Vocabulary.
7. Inspect Kanji.
8. Inspect Grammar.
9. Inspect Reading.
10. Inspect Quiz.
11. Find shared filter/state components.
12. Identify business/data logic that must remain untouched.

Do NOT immediately start rewriting.

Output an implementation plan first.

---

## Phase 1 — Shared UI

Implement/reuse:

```text
PageHeader
FilterBar
ActiveFilters
FilterSheet
SortDropdown
```

Then verify no functional regression.

---

## Phase 2 — Vocabulary

Implement Content First.

Verify:

- all existing filters work
- clear works
- sort works
- random works
- search works
- pagination works
- learned state works
- next/previous works
- data remains unchanged

---

## Phase 3 — Reading

Implement:

- compact toolbar
- filter sheet
- readable mobile list
- desktop table/list
- progress preservation

---

## Phase 4 — Kanji + Grammar

Apply the same shared patterns.

Do not create separate UX systems.

---

## Phase 5 — Navigation

Group drawer sections.

Do not change routes.

---

## Phase 6 — QA

Test all screen sizes and all existing interactions.

---

# 16. Claude Code master prompt

Copy this section directly into Claude Code:

---

**TASK**

Read `UI_REVIEW_V2.md` completely before making changes.

You are modifying an existing production React + Vite application.

Your task is to implement the UI/UX redesign described in this document.

## Critical constraints

**UI/UX changes only.**

Preserve existing:

- business logic
- API behavior
- data
- database schema
- routes
- state management
- filtering behavior
- search behavior
- pagination
- learning/review logic
- progress calculation
- quiz generation
- quiz scoring

Do not rewrite working architecture without a concrete reason.

Do not replace real data with mockup data.

Do not delete existing functionality just because the new layout is more compact.

## First step — AUDIT

Do NOT immediately edit files.

First inspect the project and report:

1. relevant routes
2. relevant pages
3. shared layout components
4. existing filter components
5. existing state/data logic
6. existing responsive behavior
7. which components can be reused
8. exact files you plan to modify
9. implementation order

Then wait for approval if the environment/workflow requires it; otherwise proceed with the safest implementation plan.

## Implementation priorities

1. Content First
2. Progressive Disclosure
3. Mobile usability
4. Desktop/mobile consistency
5. Component reuse
6. Minimal code changes
7. Zero functional regression

## Important mobile rule

Do NOT expose a large collection of filter chips by default.

Use:

```text
[ Bộ lọc ] [ Sắp xếp ] [ Random ]
```

and open filters through a mobile sheet/modal.

Only show active filters after the user has selected them.

## Important desktop rule

Use persistent sidebar/filter sections where appropriate.

If filter sections become too tall, make them collapsible.

## Important navigation rule

Mobile bottom navigation should use:

```text
Trang chủ | Từ vựng | Ngữ pháp | Quiz | Thêm
```

The drawer can group:

```text
HỌC
LUYỆN THI
CÔNG CỤ
```

Do not change existing routes.

## Reading rule

Mobile Reading must prioritize readable titles/source/type/status.

Do not use a dense grid of identical `読` cards as the primary mobile experience.

## Validation

After implementation:

- run/build the app
- check for TypeScript errors
- check for console errors
- test 360/375/390/414px
- test 768/1024/1280/1440px
- verify no horizontal overflow
- verify existing filters
- verify search
- verify sort
- verify random
- verify pagination
- verify learned status
- verify navigation
- verify quiz behavior

At the end, provide:

```text
Files changed
What changed
Logic intentionally preserved
Potential risks
QA performed
```

---

# 17. Final acceptance criteria

## 🟢 UX

- [ ] Content appears earlier on mobile.
- [ ] Filter UI is collapsed by default.
- [ ] Filter Sheet works.
- [ ] Active filters are visible.
- [ ] Sort is compact.
- [ ] Random is an action.
- [ ] Reading is readable on mobile.
- [ ] Desktop and mobile use the same information architecture.
- [ ] Navigation is clear.

## 🟢 Functional

- [ ] No existing data removed.
- [ ] No route changed.
- [ ] No API contract changed.
- [ ] No learning logic changed.
- [ ] No quiz scoring changed.
- [ ] Existing filters still work.
- [ ] Search still works.
- [ ] Pagination still works.
- [ ] Progress still works.

## 🟢 Technical

- [ ] No unnecessary duplicate components.
- [ ] No unnecessary dependencies.
- [ ] No TypeScript errors.
- [ ] No obvious console errors.
- [ ] No mobile horizontal overflow.
- [ ] Responsive at 360–1920px.

---

# 18. Final UX philosophy

Nihongo Nin should feel like:

> **an application for studying one thing at a time**

not:

> **a dashboard showing every possible control at once.**

The application can remain powerful internally.

The UI should reveal that power progressively.

**Simple by default.  
Powerful when needed.  
Content always comes first.**
