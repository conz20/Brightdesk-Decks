# Brightdesk Decks

<p align="center"><img src="src/branding/mark.svg" alt="Brightdesk brand mark" width="82" height="82"><br><strong>brightdesk</strong></p>
<p align="center"><img src="src/branding/icons/decks.svg" alt="Brightdesk Decks application icon" width="112" height="112"></p>

<p align="center"><strong>Build, design and present slide decks.</strong></p>

<p align="center"><a href="https://raw.githubusercontent.com/connormolloy12/Brightdesk-Decks/main/src/branding/previews/slides.svg"><img src="src/branding/previews/slides.svg" alt="Brightdesk Decks workspace design preview" width="100%"></a></p>

<p align="center"><sub>Select the preview to open the full-size artwork.</sub></p>

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

## Rust foundation

This repository now includes an additive Rust core foundation in `rust/`, pinned to Rust 1.99.1. The first Rust layer defines a small, versioned host contract and is checked separately from the existing Node.js application tests. Brightdesk remains an Electron desktop application: no existing JavaScript feature, installer, npm dependency, lockfile or customer-facing version has been changed, and no Rust binary is shipped in this stage. The same integration standard will be used for the four future app repositories. The shared Rust library also implements and tests Unicode-aware character, word and line counting. This is real Rust source code, but it remains a separately tested core library until the native Electron/Node bridge is built and verified. See [the Rust integration standard](docs/RUST-INTEGRATION.md) and the [official Rust getting-started guide](https://rust-lang.org/learn/get-started/).
