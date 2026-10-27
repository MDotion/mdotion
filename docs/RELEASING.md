# Releasing

Releases are published by the [Release workflow](../.github/workflows/release.yml) when a version tag is pushed.

## One-time setup

1. **VS Code Marketplace** (used by VS Code)
   - Create the publisher `SebastianIrimia` (the `publisher` field of `package.json`) at <https://marketplace.visualstudio.com/manage>.
   - Create an Azure DevOps personal access token with the **Marketplace → Manage** scope ([guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token)).
   - Add it to the repository secrets as `VSCE_PAT`.
2. **Open VSX** (used by Cursor, VSCodium and others)
   - Sign in at <https://open-vsx.org> with GitHub, sign the publisher agreement and create an access token.
   - Create the namespace once: `npx ovsx create-namespace SebastianIrimia -p <token>` (it must match the `publisher` field).
   - Add the token to the repository secrets as `OVSX_PAT`.

A marketplace whose secret is missing is skipped, so releases also work before both accounts exist.

## Publishing a version

1. Update `version` in `package.json` and move the **Unreleased** entries of `CHANGELOG.md` under that version.
2. Commit, then tag and push:

   ```bash
   git tag v0.6.0
   git push origin main v0.6.0
   ```

3. The workflow checks that the tag matches `package.json`, runs lint, type checks, unit and e2e tests, packages the `.vsix`, creates a GitHub release with it, and publishes to both marketplaces.

## Before the first public release

- The extension icon is `images/icon.png` (256×256 PNG rendered from `assets/mdotion-icon-dark.svg`); the README logos `images/logo-*.png` come from `assets/mdotion-lockup-*.svg`. The Marketplace rejects SVG icons and SVG images in the README, so regenerate the PNGs when the brand files change.
- Go through the [manual testing checklist](TESTING.md) in VS Code and Cursor.
