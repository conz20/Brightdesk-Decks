# Brightdesk Decks — DeckCraft reference audit and implementation plan

**Status:** Evidence-backed gap audit and implementation specification. This document does not claim that planned features are implemented.

**Target repository:** `conz20/Brightdesk-Decks`  
**Reference product:** DeckCraft, using the seven owner-supplied Craft Wiki pages listed below.  
**Implementation rule:** Clean-room implementation from observable workflows and visual references. Do not copy DeckCraft source code, assets, branding, product names, or proprietary implementation details.

## Reference material

- [Overview](https://craft.wiki/apps/deckcraft/overview/)
- [Getting started](https://craft.wiki/apps/deckcraft/getting-started/)
- [Install and update](https://craft.wiki/apps/deckcraft/install-update/)
- [Workflows](https://craft.wiki/apps/deckcraft/workflows/)
- [Slide shows](https://craft.wiki/apps/deckcraft/slide-shows/)
- [AI agents](https://craft.wiki/apps/deckcraft/ai-agents/)
- [Troubleshooting](https://craft.wiki/apps/deckcraft/troubleshooting/)

Visual references are also available from the ArtCraft DeckCraft product page and press kit. The useful reference compositions include the ribbon-based slide editor with a left thumbnail rail, a central 16:9 slide canvas and notes area; Slide Sorter with transition labels; a selected shape with contextual Shape Format controls; a Format Shape pane with gradient stops; and a dark-mode chart slide. These are visual targets for hierarchy and workflow, not assets to copy.

## Existing Brightdesk baseline inspected on `main`

The current product is a desktop Electron application using Node.js 24.22.2 and Electron 45.2.1. It already has local JSON document storage, a Brightdesk Decks workspace, a five-tab ribbon (Home, Insert, Design, Slide Show, View), basic add/duplicate/delete slide actions, editable title/body fields, three basic slide themes, a simple current-slide presentation overlay, and basic PPTX import/export through the existing file service.

The current slide document is effectively `{ title, slides: [{ title, body }], current }`. The renderer has no persistent slide-thumbnail navigator, speaker-notes editor, slide-layout system, sections, slide master, transition/animation model, shape object model, chart/media editing model, or dedicated presenter view. PPTX round-trip is intentionally limited: the current data model cannot preserve most rich PowerPoint objects.

Existing product identity and constraints remain binding:
- Product name: Brightdesk Decks; product ID: `slides`.
- Approved accent: `#C47A2D`, strong `#9A5E20`, soft `#FCF3E9`.
- Keep the canonical Brightdesk shared shell, original Brightdesk marks/icons and local assets.
- Keep the product desktop-only and preserve Windows, macOS and Linux targets already configured in this repository.
- Keep Node.js 24.22.2, Electron 45.2.1 and existing dependency pins unless separately approved.
- Preserve local-first documents, existing storage keys and compatibility with current documents.
- Do not introduce accounts, profiles, subscriptions, paid tiers, telemetry, advertising, cloud sync, collaboration, remote AI, or document uploads.
- No Adobe applications, services, SDKs, integrations, dependencies or assets.
- Brightdesk-AI is engineering tooling, not an eleventh customer product or a required Decks runtime dependency.

## Capability gap matrix

| Area | DeckCraft reference behaviour | Brightdesk baseline | Required Brightdesk direction |
| --- | --- | --- | --- |
| Start and recent files | Home/start surface for blank decks, themes/templates and recent files; sample deck | Existing product workspace and local documents, but no complete presentation start centre evidenced | Add a focused Decks Home/Backstage surface with New, Open, Recent, Templates, Info, Save, Save As, Export, Print and Options; retain local-only recent-file metadata |
| Editing workspace | Ribbon tabs, quick actions, slide thumbnails, canvas and notes | Five tabs and one editable slide canvas; no thumbnail rail or notes area | Rebuild the editor around a professional ribbon, left thumbnail rail, central slide canvas and collapsible notes pane; preserve Brightdesk shell and amber Decks accent |
| Ribbon | Home, Insert, Draw, Design, Transitions, Animations, Slide Show, Record, Review and View; contextual tabs | Home, Insert, Design, Slide Show and View | Add tabs only as their commands become functional; expose contextual Shape/Picture/Table/Chart formatting when relevant; do not ship dead buttons |
| Slide structure | Layouts, placeholders, sections, reorder by dragging, hide slides, reset layout | Add, duplicate, delete and current index only | Add slide thumbnails, drag reorder, layouts, placeholders, sections, hidden-slide state and reset-to-layout |
| Themes and masters | Theme, colour/font/effect schemes, background fill, slide size, masters and inherited layouts | Three simple whole-slide themes; Widescreen (16:9) and Standard (4:3) slide sizes | Build theme tokens and reusable layouts first; then masters, custom colours/fonts, background solid/gradient/image/pattern and custom slide sizes |
| Text and shapes | Rich text, bullets, numbering, columns, WordArt, links, 150+ vector shapes, connectors, freeform and merge operations | Title/body textareas only | Add a structured slide object model, text boxes and basic vector shapes first; then grouping, alignment, connectors, fills, outlines and shape formatting. Keep keyboard and accessibility support |
| Pictures and media | Picture insertion/cropping/corrections, audio and video | No slide media object model evidenced | Add local-file picture placement, crop/fit and alt text first; audio/video only with explicit local-file handling, clear playback permissions and export compatibility |
| Tables and charts | Editable tables, charts, SmartArt and icons | No slide table/chart editing model evidenced | Add native editable tables and charts using locally stored data; define supported chart types and honest import/export limits |
| Transitions and animations | Slide transitions including Morph; entrance/emphasis/exit/motion paths and by-paragraph builds | No transition or animation model | Add a small, deterministic transition set first, with per-slide duration and preview; later add object animation timelines and reduced-motion handling |
| Presentation | Full-screen show, presenter view, current/next slide, notes, timer, black/white, zoom, slide picker, pen/laser, rehearsal timings, custom shows and hidden slides | Basic overlay; arrow/click navigation; no notes, timer or presenter display | Build reliable full-screen playback and keyboard map; then presenter view with notes/current/next/timer and dual-display support; add rehearsal timings, custom shows and annotation tools in stages |
| Export and print | PPTX, PDF, notes pages, handouts, PNG/JPEG, animated GIF, outline text/RTF; print layouts | Basic PPTX import/export and existing general print/export infrastructure | Expand export by verified format: PDF slides, notes and handouts; PNG/JPEG; PPTX; outline; GIF only after deterministic frame rendering; print full-page, notes and 1/2/3/4/6/9-slide handouts |
| Review and accessibility | Comments, spelling, thesaurus, accessibility checker, compare versions | Shared local spelling foundation; no slide comments/accessibility checker/version compare evidenced | Add slide comments and a local accessibility review for reading order, alt text, contrast and missing titles; compare two local versions later |
| Search and command discovery | Ctrl+Shift+P command search | No Decks command palette evidenced | Add command search that lists only implemented commands and respects keyboard navigation |
| AI and automation | CLI, MCP command surface and over 200 scriptable commands; folder-scoped read/write roots | No Decks-specific automation server/CLI evidenced | Design a local-only, opt-in automation interface. Start with safe inspect/create/update/reorder/export commands, explicit read/write roots, bounded file access and auditable actions. No remote model, API key, cloud service or automatic upload |
| Install and update | Many package formats, portable builds, launcher and checksum verification | Brightdesk's existing Windows NSIS, macOS universal DMG/PKG/ZIP and Linux x64 AppImage/DEB targets | Keep Brightdesk's approved package matrix and official update path. Add checksum verification and clear update status where not already covered. Do not copy ArtCraft Launcher or add unapproved package formats |
| Recovery and troubleshooting | Background recovery, logs, graphics/runtime guidance, format/font/dictionary troubleshooting | Local storage and basic error/status handling; complete Decks recovery/logging parity not evidenced | Add versioned local autosave/recovery snapshots, recover/discard choices, bounded diagnostic logs and plain-language recovery guidance. Do not copy DeckCraft-specific WGPU/Vulkan/Flatpak paths into Electron instructions |

## Visual direction

Match the reference product's information architecture and visual density rather than its branding:
1. A clear ribbon across the top with labelled tabs and grouped commands.
2. A left slide-thumbnail rail with slide numbers, selection outline, add-slide control and optional section folding.
3. A large central 16:9 canvas on a neutral work surface, with a restrained border and shadow.
4. A speaker-notes area directly below the canvas, resizable or collapsible.
5. A compact status bar with slide count, view controls and zoom.
6. Contextual format panes on the right only when a compatible object is selected.
7. A coherent light theme first, then a dark theme using the same layout and accessible contrast.
8. Keep Brightdesk's deep-navy shared navigation and Decks amber accent; do not replace the Brightdesk shell with a copy of DeckCraft's theme.
9. Use original Brightdesk icons and illustrations. Never use reference screenshots as shipped product assets.
10. The README must use genuine screenshots from a running Brightdesk build. SVG mock-ups and concept artwork must be labelled as design artwork, never as screenshots.

## Implementation sequence

### P0 — Editing foundation
- [x] Add named section membership, Widescreen/Standard slide size and section metadata to local presentation documents.
- Add stable slide IDs, layout IDs and theme references. Hidden-slide state is implemented on the presentation review branch, including PowerPoint import/export.
- Migrate existing `{ title, body }` slides without data loss; retain compatibility with existing local JSON documents and PPTX import/export.
- [x] Add thumbnail navigation, add/duplicate/delete/reorder, keyboard navigation and a real notes editor.
- [x] Add named slide sections with New/Rename/Remove, slide reassignment and collapsible groups in Normal View and Slide Sorter.
- [x] Add hide/unhide slide controls; hidden slides remain editable but are skipped in slide shows and preserved in PowerPoint files.
- [x] Add Title, Title and content, Two content and Section header layouts with editable content.
- Add blank and comparison-specific layouts as later extensions; the current Two content layout covers side-by-side comparisons.
- [x] Full-screen playback preserves the selected layout, both comparison columns and the active slide theme.
- [x] Add bounded undo/redo for slide text, speaker notes, layouts, slide creation/duplication/deletion and reordering, with typing grouped by field and device-local history restored across restarts. Object-edit history remains future work when editable objects are introduced.
- Add tests for migration, selection bounds, reorder, duplicate, delete, one-slide minimum, notes persistence and recovery.

### P1 — Visual authoring
- Add structured text boxes and a first useful set of vector shapes.
- Add local picture insertion, crop, alt text, alignment, grouping and formatting.
- [x] Add Widescreen (16:9) and Standard (4:3) slide-size controls, saved in the presentation and preserved by PowerPoint import/export. Custom dimensions, theme presets and background controls remain future work.
- Add a sample presentation built from original Brightdesk content and artwork.
- [x] Add Slide Sorter with accessible slide selection and reorder controls.
- [x] Add editable Outline View for slide titles and content, including the second comparison column, hidden-slide marking and a route back to Normal View.

### P2 — Present and share
- [x] Add F5/Shift+F5 start behaviour, arrow/Space/Page Up/Page Down/Enter/Backspace/N/P navigation, Home/End, and Escape.
- [x] Add slide-number navigation, a G-key visible-slide picker, and B/period black-screen plus W/comma white-screen toggles; hidden slides are omitted from the picker and rejected as numeric destinations.
- Add presenter view, notes, next-slide preview, timer and rehearsal timings. Black/white blanking is currently available in the audience show window through keyboard controls.
- Add PDF slides, notes pages and handouts; then PNG/JPEG and supported PPTX round-trip improvements.
- Add print preview and range/layout validation.

### P3 — Rich content and automation
- Add native tables/charts, transitions and a bounded animation model.
- Add comments and accessibility review.
- Add a local Decks automation command surface and optional local MCP server with scoped roots.
- Add custom shows, media controls and animated GIF export only after their underlying playback/render paths are verified.

## Install, update, recovery and support rules

- Preserve the existing Brightdesk Windows NSIS EXE, macOS universal DMG/PKG/ZIP and Linux x64 AppImage/DEB build targets.
- Do not add Windows ARM/x86, Linux Flatpak/RPM/Arch, FreeBSD or browser editions as part of this reference exercise.
- Updates must preserve presentations, preferences and recovery data. Uninstall must not silently delete user-created presentations.
- Verify downloaded update integrity with SHA-256 before installation when the official Brightdesk update pipeline supports it.
- Keep normal editing fully offline. Internet access remains limited to official Brightdesk update and Brightdesk-controlled language-resource functions.
- Recovery must never silently overwrite a newer saved presentation. Present clear recover, compare and discard choices.
- Diagnostic logs must avoid document contents, personal data and secrets by default.
- Explain PPTX compatibility limits honestly. Never claim perfect round-trip fidelity without representative fixtures and tests.
- Troubleshooting guidance must be Electron/Brightdesk-specific. Do not copy DeckCraft's WGPU, Vulkan, Flatpak or FreeBSD commands into Brightdesk help.
- Use the shared Brightdesk spelling engine and bundled dictionaries; do not download third-party dictionary files at runtime.

## Acceptance gates

A feature is not complete because a button or mock-up exists. Each milestone needs:
- Model/service tests for persistence, validation, migration and edge cases.
- Renderer integration tests for keyboard, focus, selection, navigation and state updates.
- File-format fixtures covering import/export and unsupported-content warnings.
- Genuine screenshots from the running desktop build at desktop sizes, in light and dark themes where supported.
- Accessibility checks for keyboard-only use, focus visibility, names/roles, contrast and reduced motion.
- Exact Node.js 24.22.2 test execution and all required repository CI checks.
- Native Windows, macOS and Linux installer checks before claiming platform acceptance.
- README updates in the same change, with planned, implemented and verified features clearly separated.

## Evidence and limits

This audit is based on the seven supplied public documentation pages, the publicly described DeckCraft screenshots/product material, and the Brightdesk-Decks `main` source files inspected for the current workspace, slide renderer, package configuration and file service. It is a source-level comparison, not a runtime REA trace of DeckCraft. No DeckCraft binary, process, network capture or proprietary source was inspected. Features described as absent are absent from the inspected Brightdesk baseline, not a claim that no experimental branch or unmerged PR contains related work.

The existing open Brightdesk-Decks pull requests include separate design, slide-service, printing, help and test-discovery work. This plan must be reconciled with those branches before implementation is merged; do not duplicate or overwrite their work.


## Implementation progress — 14 November 2026

The first practical presentation-editor milestone is now represented by [Brightdesk-Decks PR #34](https://github.com/conz20/Brightdesk-Decks/pull/34), built from current `main`:

- A left thumbnail navigator with slide selection and drag reordering.
- Keyboard-accessible Move earlier / Move later controls in Normal View and Slide Sorter.
- The current slide layout selector is on the Home ribbon, with Ctrl/Cmd+Shift+N to add a slide.
- A Slide Sorter grid in the View ribbon.
- Four initial slide layouts: Title slide, Title and content, Two content and Section header.
- Editable secondary content for Two content slides.
- Per-slide speaker notes stored in the existing local presentation model.
- Widescreen (16:9) and Standard (4:3) slide sizes, shown in the canvas, thumbnails, Slide Sorter and presentation mode.
- Slide size is saved in local projects, restored in undo/redo, and preserved through supported PowerPoint import/export.
- Named sections are saved in local Brightdesk project files, included in undo/redo, and shown as collapsible groups in both editing views. PowerPoint section import/export remains unsupported.
- Hidden slides stay editable, are marked in the navigator and Slide Sorter, are skipped during presentation playback, and are preserved in supported PowerPoint import/export.
- Full-screen navigation supports arrow keys, Space, Page Up/Down, N/P, Home and End while skipping hidden slides.
- Speaker notes and supported layout positioning included in PowerPoint export.
- F5 / Shift+F5 presentation shortcuts while preserving the current motion-aware presentation overlay.
- Bounded undo/redo for slide content, speaker notes, layouts and slide structure, including grouped typing and keyboard/toolbar controls. History is also saved on this device and restored when Decks is reopened; importing another presentation clears the previous history.
- File validation for notes, layouts, secondary content, supported slide sizes and section membership, and boolean hidden-slide state.

Legacy slides migrate in memory to the Title and content layout while preserving their title/body text. PowerPoint speaker-note import remains open.

**Status: implemented on a review branch, not merged or verified.** The product-test and README-freshness workflows are queued on the private CI runner. They have not reported a pass. No genuine running-build screenshot comparison, exact Node.js 24.22.2 test result, or native Windows/macOS/Linux acceptance is claimed.

The remaining P0 work includes layout placeholders/reset, stable slide identity and document metadata, and broader file-format fixtures. Named section grouping and slide-size presets are now implemented on PR #34. Undo/redo for slide-level edits is implemented on PR #34; undo/redo for rich objects will follow when object editing exists. Later milestones still include masters, sections, rich objects, transitions, animations and Presenter View. PR #34 is the clean current-main implementation branch; the older divergent PR #15 has been closed to avoid duplicate work. Do not create duplicate slide services or competing branches for the same functionality.
