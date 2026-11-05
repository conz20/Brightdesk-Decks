# Brightdesk Decks

<p align="center"><img src="src/branding/mark.svg" alt="Brightdesk brand mark" width="82" height="82"><br><strong>brightdesk</strong></p>
<p align="center"><img src="src/branding/icons/decks.svg" alt="Brightdesk Decks application icon" width="112" height="112"></p>

<p align="center"><strong>Build, design and present slide decks.</strong></p>

<p align="center"><a href="https://raw.githubusercontent.com/connormolloy12/Brightdesk-Decks/main/src/branding/previews/slides.svg"><img src="src/branding/previews/slides.svg" alt="Brightdesk Decks workspace design preview" width="100%"></a></p>

<p align="center"><sub>Select the preview to open the full-size artwork.</sub></p>

> **Concept artwork — not a screenshot.** The preview above is original Brightdesk design artwork, not a capture from the running desktop build. A genuine screenshot will be added only after the current product window has been launched and its primary workflow checked.

Brightdesk Decks is a dedicated desktop application within the independent Brightdesk Office Suite. It uses the shared Brightdesk design language and opens directly into Decks.

## Shared Brightdesk design standard

This product follows the [Brightdesk visual and interaction standard](https://github.com/connormolloy12/Brightdesk-suite/blob/main/docs/BRIGHTDESK_VISUAL_STANDARD.md) for branding, icon usage, layout, responsive behaviour and accessibility.

## Current first-use workflows

- Create a presentation and edit slide titles and body text.
- Add, duplicate and delete slides.
- Choose from the included basic slide themes.
- Start presentation mode from the current deck.
- Import and export supported PowerPoint files; unsupported advanced objects and formatting may not be preserved.

**Known boundaries:** Decks is an early slide-editor foundation. Advanced layouts, transitions, embedded media, animation and full PowerPoint round-trip fidelity are not promised.
## Rust Node-API engine

The desktop main process can load Brightdesk's Node-API 8 Rust engine for bounded text chunking, source analysis, embedding normalization, cosine similarity and deterministic vector ranking. Renderer access is restricted to validated `window.brightdesk` methods through the context-isolated preload. Ordinary development uses a compatible JavaScript fallback when the native module is unavailable; installer builds compile the native module before packaging.

The engine does not generate semantic embeddings, call language models or upload presentation content. Online collaboration and remote model services are separate capabilities and are not enabled by this engine.

## Desktop installers

| Platform | Installer |
| --- | --- |
| Windows | Windows x64 installer (.exe) |
| macOS | Universal installer (.dmg), package (.pkg) and archive (.zip) |
| Linux | x64 AppImage and Debian package (.deb) |

Installers are built and verified by this repository's release workflow. Publishing a GitHub Release is a separate manual choice and is disabled by default.

The complete ten-product desktop suite remains available from [Brightdesk-suite](https://github.com/connormolloy12/Brightdesk-suite).

## Quality and security

Pull requests and pushes run the product and shared-engine test suite, verify the dependency lock and third-party licences, check release preflight and block high-severity dependency vulnerabilities. The same checks repeat daily. Dependabot checks npm packages and GitHub Actions weekly.

## Run from source

Use Node.js **24.22.2**.

    npm ci
    npm start

To build and verify an installer on its native operating system:

    npm run dist:product:mac
    npm run verify:product:mac

Use win on Windows or linux on Linux instead of mac.

## Project structure

- src/ — Brightdesk desktop renderer and product modules.
- `src/branding/icons/decks.svg` — original Brightdesk Decks application icon.
- `src/branding/previews/slides.svg` — workspace concept preview.
- scripts/ — build and release verification tools.
- tests/ — automated product and shared-engine tests.

## Related project

[Brightdesk Office Suite](https://github.com/connormolloy12/Brightdesk-suite) brings all ten approved Brightdesk products together in one desktop installer.

## Identity and licence

Brightdesk is independent and is not affiliated with Microsoft. It uses original product names, code, interface design and artwork. See LICENSE, TERMS_AND_CONDITIONS.txt and THIRD_PARTY_NOTICES.md.
