# Third-party notices

## Chromium

`src/chromium/` and `public/assets/` contain unmodified game source, sprites, and audio from The Chromium Authors. These files are governed by the BSD-style [Chromium license](LICENSE.chromium), not the host's MIT license. Original copyright headers are retained.

Pinned source: [Chromium 153.0.8010.53](https://chromium.googlesource.com/chromium/src/+/refs/tags/153.0.8010.53/components/neterror/resources/dino_game/).

The [source manifest](source-manifest.json) lists the exact upstream URLs and SHA-256 hashes. `src/environment.ts` and `src/constants.ts` are separately authored host adapters.

## Build tools

Development dependencies and exact versions are recorded in `package-lock.json`. They are installed through npm and are not vendored in this repository. Their licenses remain with their respective packages.

## Names and marks

Chrome, Chromium, Google, JEV, and TypeSafe AI are names or marks of their respective owners. This project is independent and does not imply endorsement.
