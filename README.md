# Brightdesk Decks

<p align="center"><img src="src/branding/mark.svg" alt="Brightdesk brand mark" width="82" height="82"><br><strong>brightdesk</strong></p>
<p align="center"><img src="src/branding/icons/decks.svg" alt="Brightdesk Decks application icon" width="112" height="112"></p>

<p align="center"><strong>Build, design and present slide decks.</strong></p>

<p align="center"><img src="src/branding/previews/slides.svg" alt="Brightdesk Decks workspace design preview" width="100%"></p>

> **Visual example:** This is an original Brightdesk design preview showing the intended desktop workspace. It is an illustrative concept, not a screenshot of a completed release build.

Brightdesk Decks is a dedicated desktop application within the independent Brightdesk Office Suite. It uses the shared Brightdesk design language and opens directly into Decks.

## Shared Brightdesk design standard

This product follows the [Brightdesk visual and interaction standard](https://github.com/connormolloy12/Brightdesk-suite/blob/main/docs/BRIGHTDESK_VISUAL_STANDARD.md) for branding, icon usage, layout, responsive behaviour and accessibility.

## What this product does

Create slide presentations with familiar presentation and layout tools.

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
- assets/brightdesk-product.svg — original Decks artwork.
- scripts/ — build and release verification tools.
- tests/ — automated product and shared-engine tests.

## Related project

[Brightdesk Office Suite](https://github.com/connormolloy12/Brightdesk-suite) brings all ten approved Brightdesk products together in one desktop installer.

## Identity and licence

Brightdesk is independent and is not affiliated with Microsoft. It uses original product names, code, interface design and artwork. See LICENSE, TERMS_AND_CONDITIONS.txt and THIRD_PARTY_NOTICES.md.

## Professional workspace examples and acceptance

Decks must communicate a presentation-first workflow: a clear slide canvas, a useful slide navigator, concise editing controls and a predictable presentation mode. The example should look like a real presentation in progress, not a blank canvas surrounded by decorative buttons.

### Example workflow

1. Create a short presentation with a title slide and three content slides.
2. Add a heading, supporting text and a visual element to each content slide.
3. Reorder slides and confirm the navigator reflects the new order.
4. Preview the presentation and move between slides.
5. Save and reopen the deck to confirm its structure is retained.

Use strong typographic hierarchy, consistent alignment, deliberate whitespace and a restrained application frame. Make selection, editing, reordering and presentation states obvious. Do not imply export formats or animation features are available until they are implemented and tested.

Follow the shared [Brightdesk visual and interaction standard](https://github.com/connormolloy12/Brightdesk-suite/blob/main/docs/BRIGHTDESK_VISUAL_STANDARD.md).

### Acceptance checks

- Slide selection and reordering stay synchronised between navigator and canvas.
- Editing controls provide visible, accessible feedback.
- Presentation preview is usable with keyboard controls.
- Examples show realistic slide content and accurately identify concept versus running-build imagery.
