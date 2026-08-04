# Publishing to npm from GitHub Actions

`@opengsd/gsd-graph` publishes from GitHub Releases through
`.github/workflows/publish.yml`. The workflow uses npm Trusted Publishing over
OpenID Connect (OIDC), so the repository does not store a long-lived npm token.

## One-time npm configuration

The package owner must configure the trusted publisher on npmjs.com before the
first automated release:

1. Open `@opengsd/gsd-graph` → **Settings** → **Trusted Publisher**.
2. Select **GitHub Actions**.
3. Enter these values:

   | Field | Value |
   | --- | --- |
   | Organization or user | `open-gsd` |
   | Repository | `gsd-graph` |
   | Workflow filename | `publish.yml` |
   | Environment | Leave blank |
   | Allowed action | `npm publish` |

4. Save the trusted publisher.
5. After one successful OIDC publish, consider setting npm publishing access to
   **Require two-factor authentication and disallow tokens**, then revoke any old
   automation token.

Do not add `NPM_TOKEN` or `NODE_AUTH_TOKEN` to this repository. The publish job
requests `id-token: write`; npm exchanges that short-lived GitHub identity for
publish authorization. Public packages published from this public repository
receive npm provenance automatically.

Official reference: [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/).

## Pipeline behavior

The workflow has two entry points:

- `workflow_dispatch`: installs, tests, and runs `npm pack --dry-run`; it never
  publishes. Use this before every release.
- GitHub Release `published`: repeats validation and publishes to npm.

Release safety gates:

- GitHub-hosted Ubuntu runner, Node.js 24, and npm 11.5.1 or newer.
- Release tag must be exactly `v<version>` from `package.json`.
- `npm ci` must accept the committed lockfile.
- The complete test suite must pass.
- `npm pack --dry-run` must succeed before publication.
- Stable releases publish under npm dist-tag `latest`.
- GitHub prereleases publish under npm dist-tag `next`.
- Concurrent runs for the same Git ref do not cancel or overlap publication.

The npm registry is immutable by package name and version. Rerunning a workflow
after a successful publish will fail rather than overwrite the release.

## Release procedure

1. Update `package.json` and `package-lock.json` to the same version.
2. Add the matching entry to `CHANGELOG.md`.
3. Merge the release commit to `main` and wait for CI to pass on Node 22 and 24.
4. Run the safe validation path from the Actions UI, or with:

   ```bash
   gh workflow run publish.yml --ref main
   ```

5. Confirm the manual run passed and inspect its `npm pack --dry-run` output.
6. Create a GitHub Release targeting the verified commit. The tag must match the
   package version:

   ```bash
   VERSION="$(node -p "require('./package.json').version")"
   gh release create "v${VERSION}" --target main --generate-notes
   ```

7. Watch the `publish npm` workflow. On success, verify the version and
   provenance on the npm package page.

For prereleases, use a prerelease semantic version such as `0.3.0-beta.1` and
mark the GitHub Release as a prerelease. The workflow will publish it under
`next`, not `latest`.

## Failure handling

- **Tag/version mismatch:** correct the version or release tag before publishing.
- **OIDC authentication failure:** verify the npm trusted-publisher owner,
  repository, and exact workflow filename. The environment must remain blank
  unless both npm and the workflow are changed to the same environment name.
- **npm CLI too old:** keep the release job on Node 24 or newer; trusted
  publishing requires npm 11.5.1 or newer.
- **Version already exists:** bump to a new semantic version. npm versions cannot
  be overwritten.
- **Validation failure before publish:** fix `main`, rerun the manual dry-run,
  and create a release from the corrected commit. Do not move a published tag.

The `repository.url` in `package.json` must continue to identify
`https://github.com/open-gsd/gsd-graph`; npm checks it during trusted publishing.
