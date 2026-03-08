# Shannon Launcher — PM Builder Handoff

**Date:** March 7, 2026
**From:** Planner Agent
**To:** PM Agent (for Claude Code builder sessions)

---

## Project Summary

The Shannon Launcher is a standalone Electron desktop app that serves as a personal software hub — users browse an app library, install apps with one click, receive updates, and launch apps. Inspired by the Epic Games Launcher. Enterprise-level quality.

**Stack:** Electron + React + TypeScript + Tailwind + Zustand
**Distribution:** NSIS installer via GitHub Releases
**Platform:** Windows (macOS deferred)
**Working Directory:** `C:\Claude Access Point\Launcher`

---

## What Has Been Completed (Planner Phase)

### Spec Documents (in `specs/`)
- `LAUNCHER_SPEC.md` — Original vision and architecture (written by PM4)
- `DETAILED_SPEC.md` — Full technical spec: all TypeScript interfaces, every IPC channel with exact names/shapes/directions, GitHub API parsing, NSIS install details, download manager architecture, config system, 7 edge cases, complete UI/UX specs (colors, layout, badges, animations), self-update flow, Zustand store design, electron-builder config
- `MASTER_INDEX.md` — Single-page project map: build order, ClickUp task IDs, cross-cutting rules (IPC patterns, state management, config writes, error handling, type sharing), design tokens, animation standards, naming conventions, placeholders, pipeline workflow, architecture diagram

### Task Files (in `tasks/`)
| File | Size | Tasks | ACs | Scope |
|------|------|-------|-----|-------|
| `L1_tasks.md` | 37.9 KB | 9 | 9 | Electron Shell + Config System |
| `L2_tasks.md` | 42.2 KB | 9 | 15 | Library UI + App Cards |
| `L3_tasks.md` | 37.6 KB | 11 | 13 | GitHub Release Checker |
| `L4_tasks.md` | 47.8 KB | 10 | 16 | Install + Update Flow |
| `L5_tasks.md` | 31.7 KB | 9 | 17 | Launch + App Management |
| `L6_tasks.md` | 39.7 KB | 8 | 18 | Settings + Polish + Packaging |

Each task file contains: scope summary, tasks with full code implementations, implementation notes, acceptance criteria, files touched, and a **standalone Builder Prompt** at the bottom that can be fed directly to Claude Code.

### ClickUp (List: "Shannon Launcher — Build Sessions", ID: `901711761261`)
- 6 parent tasks: L1 through L6
- 56 subtasks nested under parents (L1.1–L1.9, L2.1–L2.9, etc.)
- All status: "To Do"

---

## Build Order

Sessions MUST be built sequentially. Each depends on the previous.

| # | Session | ClickUp Parent ID | Task File |
|---|---------|-------------------|-----------|
| 1 | L1 — Electron Shell + Config System | `86e088k1m` | `tasks/L1_tasks.md` |
| 2 | L2 — Library UI + App Cards | `86e088k27` | `tasks/L2_tasks.md` |
| 3 | L3 — GitHub Release Checker | `86e088k2v` | `tasks/L3_tasks.md` |
| 4 | L4 — Install + Update Flow | `86e088k3g` | `tasks/L4_tasks.md` |
| 5 | L5 — Launch + App Management | `86e088k42` | `tasks/L5_tasks.md` |
| 6 | L6 — Settings + Polish + Packaging | `86e088k4g` | `tasks/L6_tasks.md` |

---

## Pipeline Workflow (Per Session)

```
1. PM Agent reads tasks/{LN}_tasks.md
2. PM Agent feeds the BUILDER PROMPT section to Claude Code
3. Claude Code implements in C:\Claude Access Point\Launcher
4. PM Agent verifies ACCEPTANCE CRITERIA from the task file
5. If pass → mark ClickUp parent task + subtasks complete → next session
   If fail → PM sends targeted fix prompt → re-verify
```

### PM Verification Checklist (per session)
1. All acceptance criteria pass
2. `npm run build` succeeds (after L1)
3. App launches and functions as described
4. No TypeScript errors
5. No console errors in renderer or main process
6. UI matches design spec (colors, spacing, animations)

---

## Reference Implementation

The Finance App at `C:\Claude Access Point\StockValuation\Finance App` uses the same stack. Key reference files for the builder:

- `electron/main.ts` — Window management, lifecycle, IPC patterns
- `electron/preload.ts` — Context bridge pattern
- `package.json` — Workspace structure, build scripts
- `electron/electron-builder.yml` — NSIS + GitHub Releases config
- `frontend/src/stores/uiStore.ts` — Zustand store pattern

The Launcher is SIMPLER than Finance App — no Python backend, no database, no API server.

---

## Key Technical Decisions

- **No backend** — pure Electron + React
- **Hardcoded app registry** — adding apps requires a Launcher update
- **GitHub Releases** — free distribution, API for version checking
- **NSIS silent install** — `/S /D=path` flags
- **net.fetch()** for downloads — respects system proxy
- **Zustand** single store — all state in `appStore.ts`
- **Tailwind utilities** — no CSS modules
- **Standard Windows frame** — no custom titlebar
- **Manual self-update** — banner links to GitHub, user downloads new installer

---

## Placeholders to Replace Before Release

| Placeholder | Locations | Replace With |
|-------------|-----------|-------------|
| `OWNER_TBD` | `registry.ts`, `electron-builder.yml`, `types.ts` (LAUNCHER_GITHUB) | GitHub username |
| `resources/icon.ico` | Build resources | Real multi-size launcher icon |
| `assets/icons/finance-app.png` | App icons | Real Finance App icon |

---

## Important Notes for the Builder

1. **This is a NEW project.** L1 starts from `npm init`. There is no existing code.
2. **Read the Builder Prompt** at the bottom of each task file. It's self-contained.
3. **Read the reference files** from the Finance App when specified — the builder should study the patterns before implementing.
4. **The task files are the source of truth** for implementation detail, not the ClickUp descriptions (which are summaries).
5. **Cross-cutting rules** from MASTER_INDEX.md apply to every session: IPC naming (`{domain}:{action}`), atomic config writes, errors as `{success, error}` not thrown, all state in Zustand, types mirrored between electron/types.ts and frontend/types/index.ts.
