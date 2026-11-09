# iOS cloud build

The GitHub Actions workflow at `.github/workflows/ios-cloud-build.yml` builds and validates the iPhone application on GitHub's `macos-26` runner with full Xcode.

## What the workflow validates

For pushes and pull requests targeting `main`, and for manual runs, it:

1. Checks out the repository with read-only permissions.
2. Installs Node.js 22 and dependencies from `package-lock.json` with `npm ci`.
3. Records the macOS, Node.js, npm, and Xcode versions in the build log.
4. Uses the commit timestamp as `SOURCE_DATE_EPOCH` for reproducible generated catalog metadata.
5. Runs `npm run release:readiness`.

The readiness command checks TypeScript, unit and component tests, catalog generation and parity, privacy and release metadata, the Vite production build, Capacitor synchronization, iOS package contents, and an unsigned Xcode archive.

## Before the first run

GitHub Actions can only use committed files. Commit and push the workflow together with the iOS project, Capacitor configuration, package files, release scripts, catalog source modules, and application changes it validates. Generated files ignored under `ios/App/App/public`, `ios/App/App/config.xml`, and `ios/App/App/capacitor.config.json` do not need to be committed because the release pipeline recreates them.

Open the repository on GitHub, select **Actions**, choose **iOS Cloud Build**, and select **Run workflow** for a manual run. Pushes and pull requests targeting `main` run it automatically.

## Current scope

This workflow creates and validates an unsigned archive. It does not produce an installable IPA and does not upload to TestFlight or App Store Connect. It intentionally has no access to Apple credentials, which keeps pull-request builds safe.

## Signed distribution

Signed distribution lives in a separate, manually triggered workflow at `.github/workflows/ios-release.yml`. It never runs on pushes or pull requests, is unreachable from a fork, and reads every Apple credential from the protected `ios-release` GitHub Environment. It runs `npm run release:readiness` before signing anything, so a signed build cannot ship what the unsigned validation rejects.

Its `action` input selects how far the run goes: `archive-only` signs and exports on the runner without contacting Apple, `validate` asks App Store Connect to pre-check the IPA, and `upload` delivers the build. Uploading feeds TestFlight; it never submits the app for App Store review, which stays a deliberate action in App Store Connect.

Before the first run, create the `ios-release` environment with required reviewers and add these environment secrets:

- `APPLE_DISTRIBUTION_CERTIFICATE_P12_BASE64`
- `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD`
- `APPLE_PROVISIONING_PROFILE_BASE64`
- `APPLE_PROVISIONING_PROFILE_NAME`
- `APPLE_TEAM_ID`
- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_PRIVATE_KEY_BASE64`
- `IOS_KEYCHAIN_PASSWORD`

The job creates and deletes its own temporary keychain, installs and removes the provisioning profile and the App Store Connect API key, and wipes all of them in a cleanup step that runs even when the build fails. Never expose these credentials to pull-request jobs or commit them to the repository.

App Store Connect rejects a duplicate build number, so raise `CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj/project.pbxproj` before each upload, or pass the `build_number` input, which rewrites it before the readiness gate runs.

## References

- [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [macOS 26 GitHub-hosted runner announcement](https://github.blog/changelog/2026-02-26-macos-26-is-now-generally-available-for-github-hosted-runners/)
- [Apple App Store Connect build uploads](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)

Provider documentation was paraphrased for compliance with licensing restrictions.
