# Releasing

Releases are published by the [Release workflow](../.github/workflows/release.yml) when a version tag is pushed.

## One-time setup

### VS Code Marketplace (used by VS Code)

The workflow signs in with a **Microsoft Entra identity** (an app registration) through GitHub OIDC: no token is stored in GitHub. Azure DevOps global personal access tokens, the old way, stop working on December 1, 2026.

1. **Directory.** Sign in to <https://portal.azure.com> with the Microsoft account that owns the `MDotion` publisher. No Azure subscription is needed: an app registration lives in Microsoft Entra ID, not in a subscription.
2. **App registration.** **Microsoft Entra ID → App registrations → New registration**: name `mdotion-vscode-marketplace`, *Single tenant only* (*Accounts in this organizational directory only* in older portals), no redirect URI. Note the **Application (client) ID** and the **Directory (tenant) ID**.
3. **Federated credential.** In the app: **Certificates & secrets → Federated credentials → Add credential**:
   - scenario **GitHub Actions deploying Azure resources**;
   - organization `MDotion`, repository `mdotion`, and their numeric ids when asked (`gh api repos/MDotion/mdotion --jq '.owner.id, .id'`);
   - entity **Environment**, name `vscode-marketplace`.

   The subject identifier must match what GitHub sends. This repository uses immutable subjects (`gh api repos/MDotion/mdotion/actions/oidc/customization/sub`), so it is `repo:MDotion@<org id>/mdotion@<repo id>:environment:vscode-marketplace`.
4. **Repository variables** (not secrets: these are identifiers). Under **Settings → Secrets and variables → Actions → Variables**, add `AZURE_CLIENT_ID` and `AZURE_TENANT_ID`. Or use `gh variable set AZURE_CLIENT_ID --body <id>`.
5. **Marketplace id of the identity.** Under **Actions → Release → Run workflow**, run the workflow on `main`. The run summary shows an id.
6. **Publisher member.** At <https://marketplace.visualstudio.com/manage>, open the `MDotion` publisher → **Members** → add that id as **Contributor**.

A user-assigned **managed identity** with the same federated credential works too. It needs a subscription that can register the `Microsoft.ManagedIdentity` provider (student subscriptions such as Azure Dev Tools for Teaching cannot), a **Reader** role on its resource group, and the `AZURE_SUBSCRIPTION_ID` variable.

The `vscode-marketplace` environment is created by the first run. Required reviewers can be added to it (**Settings → Environments**) to approve each publish.

**Fallback:** if the `AZURE_*` variables are not set, the workflow uses a `VSCE_PAT` secret. That is an Azure DevOps token for **All accessible organizations** with the **Marketplace → Manage** scope, and it only works until December 1, 2026.

### Open VSX (used by Cursor, VSCodium and others)

The workflow publishes with **trusted publishing**: Open VSX exchanges the workflow's GitHub OIDC token for a short-lived one (`ovsx publish --trusted-publishing`). No token is stored in GitHub. The `MDotion` namespace is verified, and its first version was published by hand, as Open VSX requires.

1. At <https://open-vsx.org/user-settings/trusted-publishers>, signed in as a namespace owner, register a trusted publisher:
   - namespace `MDotion`, publisher **GitHub**, extension `mdotion-editor`;
   - repository `MDotion` / `mdotion`, workflow filename `release.yml`;
   - environment `open-vsx` (the GitHub environment the Open VSX jobs run in; the Marketplace job has its own, `vscode-marketplace`).
2. Every version tag then publishes to Open VSX too. To publish a release that already exists (for example one made before this setup, or after a failed upload), run **Actions → Release → Run workflow** with *publish-open-vsx* and the tag, for example `v0.2.2`. An empty tag means the latest release.

Trusted publishing only works from public repositories. **Fallback:** if the secret `OVSX_PAT` (an Open VSX access token) is set, the workflow uses it instead.

## Publishing a version

1. Update `version` in `package.json` and move the **Unreleased** entries of `CHANGELOG.md` under that version.
2. Commit, then tag and push:

   ```bash
   git tag v0.1.0
   git push origin main v0.1.0
   ```

3. The workflow checks that the tag matches `package.json`, runs lint, type checks, unit and e2e tests, packages the `.vsix`, creates a GitHub release with it, and publishes to the marketplaces that have credentials.

## Before the first public release

- The extension icon is `images/icon.png` (256×256 PNG) and the README logos are `images/logo-*.png`. The brand source files are kept outside the repository; the Marketplace rejects SVG icons and SVG images in the README, so commit PNG renders.
- Go through the [manual testing checklist](TESTING.md) in VS Code and Cursor.
