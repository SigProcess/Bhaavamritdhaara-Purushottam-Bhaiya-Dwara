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

A signed distribution workflow requires Apple Developer Program membership and these protected GitHub Environment secrets or variables:

- Apple Distribution certificate (`.p12`) and its password
- App Store provisioning profile
- Apple Developer Team ID and provisioning profile name
- App Store Connect API issuer ID, key ID, and private key for upload
- A temporary CI keychain password

Add signed distribution as a separate manually triggered job protected by required reviewers. Never expose signing credentials to pull-request jobs or commit them to the repository.

## References

- [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [macOS 26 GitHub-hosted runner announcement](https://github.blog/changelog/2026-02-26-macos-26-is-now-generally-available-for-github-hosted-runners/)
- [Apple App Store Connect build uploads](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)

Provider documentation was paraphrased for compliance with licensing restrictions.
