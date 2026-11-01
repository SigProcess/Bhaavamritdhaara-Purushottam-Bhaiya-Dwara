# Implementation Plan: iPhone App Version

## Overview

Implement the approved Capacitor iOS application incrementally while preserving the existing React/Vite PWA and Android TWA. The plan first establishes typed shared boundaries and a canonical catalog, then adds deterministic domain behavior, React integration, native Swift document services, offline and accessibility behavior, and automated release gates. TypeScript is used for new shared web/domain modules and Swift for iOS-native code, as specified by the design.

## Tasks

- [x] 1. Establish the shared TypeScript, test, and Capacitor foundation
  - [x] 1.1 Add TypeScript, Vitest, fast-check, React Testing Library, and Capacitor dependencies and non-watch scripts
    - Configure TypeScript for incremental adoption alongside the existing JSX modules.
    - Add deterministic unit, property, component, and release-validation commands without changing the existing PWA build entry point.
    - Add Capacitor configuration that packages the Vite output locally and reserves the approved iOS app identifier and display name.
    - _Requirements: 9.1, 10.1, 12.2, 12.4_

  - [x] 1.2 Define canonical catalog, runtime state, route, request, and platform-service types
    - Create the TypeScript contracts from the design for catalog records, validation snapshots and diffs, navigation entries, player state, request state, and platform adapters.
    - Keep stable IDs and ordered arrays explicit, and prohibit arbitrary native file paths or URLs at bridge boundaries.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.2, 4.1, 8.2_

  - [x] 1.3 Add shared test fixtures and fakes for catalogs, platform adapters, timers, and failed requests
    - Provide reusable deterministic fixtures containing Hindi, English, duplicate, empty, offline, and unavailable-content cases.
    - Provide fake document, network, metadata, and external-media services for later domain and component tests.
    - _Requirements: 2.6, 3.3, 4.12, 5.7, 6.7, 8.7_

- [ ] 2. Create the canonical catalog and release parity gate
  - [x] 2.1 Extract all repository-authored content into generator-readable source modules
    - Preserve the exact order and values in playlists, playlist videos, bhajan PDFs, and book metadata while moving embedded book records out of the React component.
    - Assign stable IDs and represent collections, standalone playlists, memberships, videos, bhajans, books, and asset references without adding display-only data.
    - _Requirements: 2.2, 2.3, 2.4, 3.1, 3.5, 5.9, 7.1, 7.2_

  - [x] 2.2 Implement the deterministic catalog generator and asset manifest
    - Read each source once per validation run and emit a schema-versioned catalog, source digests, content hash, asset hashes, media types, byte lengths, and generation metadata.
    - Reject unreadable inputs, duplicate IDs, missing assets, invalid references, and unsupported document types with scoped diagnostics.
    - Exclude runtime playback, connectivity, cache, and interface state from generated output.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.9_

  - [x] 2.3 Implement exact snapshot comparison and release-blocking validation
    - Compare all included records, values, memberships, orders, identifiers, and asset references against one immutable start-of-validation snapshot.
    - Report missing, additional, reordered, reassigned, changed, unreadable, and hash-mismatched scopes and exit unsuccessfully for every mismatch or incomplete comparison.
    - _Requirements: 2.6, 2.7, 2.8, 2.9_

  - [x] 2.4 Implement schema validation and immutable ordered catalog selectors
    - Validate envelope versions, unique IDs, cross-record references, valid asset records, and optional fields before exposing content.
    - Add selectors for collections, collection playlists, standalone playlists, videos, distinct bhajans, and books that preserve canonical order and exact metadata.
    - _Requirements: 2.6, 3.1, 3.2, 3.5, 4.3, 4.4, 5.1, 5.2, 7.1, 7.2_

  - [ ]* 2.5 Write the property test for snapshot projection completeness and stability
    - **Property 1: Snapshot projection is complete and stable**
    - Generate valid content sources and excluded runtime-state variations and verify exact, stable projection.
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

  - [ ]* 2.6 Write the property test for exact catalog parity
    - **Property 2: Exact catalog comparison accepts only parity**
    - Mutate items, order, membership, metadata, identifiers, and asset references and verify a scoped release-blocking diff for every mutation.
    - **Validates: Requirements 2.6, 2.7, 2.8**

  - [ ]* 2.7 Write the property test for canonical catalog view projection
    - **Property 3: Catalog views preserve canonical content**
    - Generate mixed catalogs and verify selectors preserve exact values, counts, and source order without rewriting or dropping records.
    - **Validates: Requirements 3.1, 3.2, 3.5, 4.2, 4.3, 4.4, 5.9, 5.10, 7.1, 7.2**

- [x] 3. Implement navigation, player state, and isolated request behavior
  - [x] 3.1 Implement the reducer-driven navigation coordinator
    - Support Home, collection, playlist, and privacy routes with push/pop operations, scroll snapshots, and focus restoration targets.
    - Keep native documents as child presentations and discard transient navigation state on terminated-state launch.
    - _Requirements: 1.1, 3.2, 3.6, 3.7, 3.9, 3.10, 6.6, 12.4_

  - [x] 3.2 Implement playlist availability resolution and player initialization reducers
    - Resolve recorded-video, playlist-embed, and named-unavailable modes from canonical data.
    - Select the first recorded video without playback, enforce one selected video, and retain the originating route when resolution fails.
    - _Requirements: 3.8, 4.1, 4.5, 4.6, 4.9, 4.13_

  - [x] 3.3 Implement the request registry, retry commands, and network-state reducer
    - Bind every catalog, collection, playback, document, and export failure to one immutable request and target ID.
    - Retry only the selected request, retain local state after repeated failure, and re-enable its retry after reconnection.
    - _Requirements: 3.4, 4.12, 6.7, 6.8, 7.7, 7.8, 8.1, 8.2, 8.5, 8.6, 8.7_

  - [ ]* 3.4 Write the property test for navigation restoration
    - **Property 4: Navigation push and pop restore the predecessor**
    - Generate nested routes, collection-origin playlists, scroll positions, and focus targets and verify exact restoration.
    - **Validates: Requirements 3.6, 3.7, 3.9, 3.10**

  - [ ]* 3.5 Write the property test for unavailable playlist navigation
    - **Property 5: Unavailable playlists do not replace their origin**
    - Generate origin routes and failed playlist resolutions and verify the origin and scroll snapshot remain unchanged while the correct playlist is identified.
    - **Validates: Requirements 3.8**

  - [ ]* 3.6 Write the property test for deterministic player initialization
    - **Property 6: Player initialization chooses one deterministic mode**
    - Generate playlist records with videos, identifiers, both, or neither and verify mode precedence and non-autoplay selection.
    - **Validates: Requirements 4.1, 4.9, 4.13**

  - [ ]* 3.7 Write the property test for singular video selection
    - **Property 7: Video selection remains singular**
    - Generate nonempty video lists and valid selections and verify exactly the chosen video remains selected.
    - **Validates: Requirements 4.5, 4.6**

  - [ ]* 3.8 Write the property test for isolated request retries
    - **Property 11: Request retries are isolated and stable**
    - Generate mixed request registries and verify one retry issues one matching command without mutating unrelated requests or local navigation/catalog state.
    - **Validates: Requirements 7.8, 8.2, 8.6, 8.7**

- [ ] 4. Implement Unicode-safe bhajan discovery
  - [x] 4.1 Implement pure Unicode query normalization, validation, matching, and stable deduplication
    - Trim Unicode whitespace, count Unicode code points, apply Unicode case-insensitive contiguous-substring matching, and preserve canonical order.
    - Return explicit initial, all-results, matched, zero-result, and over-200-character states without executing invalid searches.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.11, 5.12, 5.13_

  - [~] 4.2 Refactor `BhajansPage` into the catalog-backed Bhajan Finder
    - Render exact bilingual titles, meaning metadata, result counts, first-five and full-list states, bilingual no-result copy, and the 200-character validation message.
    - Route open and export actions through `DocumentService` using document IDs, with named errors and request-specific retries.
    - _Requirements: 5.1, 5.2, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 6.1, 6.5, 6.8_

  - [ ]* 4.3 Write the property test for the Unicode search reference model
    - **Property 8: Search matches the reference Unicode model**
    - Generate Devanagari, Latin case variants, combining characters, duplicates, and valid query lengths and compare output with an independent reference implementation.
    - **Validates: Requirements 5.3, 5.4, 5.5, 5.6**

  - [ ]* 4.4 Write the property test for empty-query behavior
    - **Property 9: Empty search state is a stable distinct prefix**
    - Generate catalogs and Unicode-whitespace queries and verify first-five, total-count, clear, and show-all behavior.
    - **Validates: Requirements 5.1, 5.2, 5.8, 5.12, 5.13**

  - [ ]* 4.5 Write the property test for oversized-query rejection
    - **Property 10: Oversized search never executes**
    - Generate trimmed queries longer than 200 code points and verify validation output with no search command.
    - **Validates: Requirements 5.11**

  - [ ]* 4.6 Write component tests for Bhajan Finder states and document actions
    - Test exact bilingual labels, counts, meaning display, no-result and validation feedback, accessible controls, and scoped open/export retry behavior.
    - _Requirements: 5.1, 5.2, 5.7, 5.9, 5.10, 5.11, 6.5, 6.8, 10.1, 10.3_

- [ ] 5. Implement collection browsing and explicit video playback
  - [~] 5.1 Build catalog-backed collection and standalone-playlist screens
    - Render exact titles, thumbnails, counts, canonical playlist order, named empty states, and named retryable errors.
    - Open available playlists through the navigation coordinator and keep unavailable selections on their originating screen.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

  - [~] 5.2 Refactor the YouTube lightbox into the typed Video Player
    - Render exact playlist title, video count, ordered titles and thumbnails, and exactly one accessible selected state.
    - Avoid autoplay on initial open; begin selected-video playback only after explicit selection or activation and enforce the five-second playing-state deadline.
    - Fall back to playlist embed mode when individual metadata is absent, provide full-screen entry, and preserve selection and position on exit.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11_

  - [~] 5.3 Implement playback failure, retry, offline, and external-open adapter behavior
    - Map timeout, offline, and service errors to named selected content and one request-specific retry action.
    - Dispose stale player commands before retry and expose an explicitly labeled external-open fallback only when embedded playback is unavailable.
    - Keep local playlist metadata and navigation usable through failures.
    - _Requirements: 4.12, 4.13, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ]* 5.4 Write component tests for collections, playlists, and selected video semantics
    - Test canonical rendering, named empty/error states, route restoration, non-autoplay initialization, one selected option, and isolated retries with fake media services and timers.
    - _Requirements: 3.1, 3.3, 3.4, 3.8, 3.9, 4.1, 4.5, 4.6, 4.12, 10.2_

  - [ ]* 5.5 Write automated external-media integration tests
    - Use controlled test fixtures to verify iframe initialization, explicit playback, five-second timeout mapping, playlist fallback, full-screen state restoration, and offline recovery without asserting third-party internals.
    - _Requirements: 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 8.1, 8.5, 8.6_

- [ ] 6. Integrate the app shell, catalog lifecycle, books, and web adapters
  - [~] 6.1 Implement packaged and last-known-good catalog repositories with atomic remote updates
    - Render synchronously from a validated local catalog, then check an HTTPS version descriptor after Home is interactive.
    - Stage and validate complete updates, allowlist hosts, verify hashes and monotonic versions, activate atomically, and retain packaged and active fallbacks during failures and pruning.
    - _Requirements: 2.6, 2.9, 8.2, 8.3, 8.4, 8.5, 8.6, 12.5_

  - [~] 6.2 Refactor `App` into the routed App Shell and wire shared providers
    - Make Home the cold-launch route and compose identity, category navigation, Bhajan Finder, collections, playlists, books, privacy, request status, and platform adapters.
    - Preserve the exact bilingual identity, category names, hero image, hero alternative text, palette, account-free access, and ad-free presentation.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 8.3, 8.4, 11.1, 11.2, 12.4, 12.5_

  - [~] 6.3 Refactor `BooksSection` into the catalog-backed Books Browser
    - Render exact canonical book metadata and route open/retry actions through `DocumentService` using the selected book ID.
    - Preserve selection across failures and retries.
    - _Requirements: 7.1, 7.2, 7.3, 7.7, 7.8_

  - [~] 6.4 Implement browser and Android-compatible platform adapters
    - Keep same-origin browser PDF open/download behavior, browser network events plus request outcomes, generated build metadata, and existing Android TWA URLs.
    - Fall back safely outside Capacitor without exposing native-only calls.
    - _Requirements: 6.1, 6.5, 8.1, 8.5, 11.3, 12.6_

  - [~] 6.5 Implement responsive, Safe Area, Dynamic Type, touch, contrast, and reduced-motion styles
    - Apply the approved palette with measured contrast, Safe Area insets, scalable system typography, scrollable overflow, persistent affordances, visible focus, and minimum 44-by-44-point controls.
    - Remove nonessential spatial movement when reduced motion is requested and avoid clipping through all supported viewport and text-size boundaries.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 10.7, 10.8, 10.9, 10.10_

  - [ ]* 6.6 Write App Shell, catalog update, books, and adapter integration tests
    - Test cold Home rendering, atomic update success and rollback, offline local metadata, book retry identity, bridge fallback, account-free access, and no advertising placements.
    - _Requirements: 1.1, 2.6, 2.9, 7.7, 7.8, 8.3, 8.4, 11.1, 11.2, 12.5_

- [ ] 7. Add the Capacitor iOS host and native document services
  - [x] 7.1 Create and configure the Capacitor iOS project
    - Add the iOS platform, local Vite asset sync, iOS 15 deployment target, iPhone device family, portrait support, bundle metadata, and plugin registration.
    - Keep web and Android builds operational and exclude notification entitlements from release one.
    - _Requirements: 9.1, 12.1, 12.2, 12.4_

  - [x] 7.2 Implement the Swift Document Plugin and PDFKit view controller
    - Resolve catalog document IDs only through allowlisted packaged or catalog-store roots and reject traversal, unknown IDs, invalid PDFs, and non-PDF media types.
    - Present first-page, ascending, vertically continuous PDF reading with forward/backward scrolling, accessible controls, and 100-500% bhajan or 100-300% book zoom bounds.
    - Return typed named errors while preserving the originating React route.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.8, 7.3, 7.4, 7.5, 7.6, 7.7, 9.4, 10.1, 10.4_

  - [x] 7.3 Implement the Swift share/export service
    - Present `UIActivityViewController` for the exact active local PDF and retain the document session during presentation.
    - Map completion, cancellation, presentation failure, and activity failure distinctly; keep the PDF visible and retryable after failure.
    - _Requirements: 6.5, 6.6, 6.7_

  - [x] 7.4 Implement native lifecycle, network, and app-metadata services
    - Expose foreground/background events, advisory network-path status, platform identity, and release version through typed Capacitor methods and listeners.
    - Refresh network state when the app becomes active and request no permission during startup.
    - _Requirements: 8.1, 8.5, 11.3, 11.4, 12.6_

  - [~] 7.5 Implement the TypeScript Capacitor adapters and wire native presentations
    - Map bridge results and errors to shared service contracts, request IDs, and canonical content names.
    - Connect bhajan and book open/export actions while restoring the prior route, scroll, focus, page, and zoom state after native dismissal or cancelled sharing.
    - _Requirements: 3.10, 6.1, 6.5, 6.6, 6.7, 6.8, 7.3, 7.7, 7.8_

  - [ ]* 7.6 Write XCTest coverage for document security and PDF behavior
    - Test ID resolution, allowlisted roots, traversal rejection, MIME and PDF validation, first-page setup, continuous ascending display, and type-specific zoom clamps.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.8, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 7.7 Write XCTest coverage for share, lifecycle, network, and metadata mappings
    - Test share completion/cancellation/failure, retained sessions, foreground refresh, network status transitions, platform identity, and nonempty version exposure.
    - _Requirements: 6.5, 6.6, 6.7, 8.5, 11.3, 12.6_

  - [ ]* 7.8 Write XCUITest flows for native and web-to-native integration
    - Automate cold launch, offline Home, PDF first page and scrolling, zoom limits, share cancellation, return-state restoration, reconnection retry, Safe Area geometry, touch-target size, and one-action-per-tap behavior.
    - _Requirements: 3.9, 3.10, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.3, 7.4, 7.5, 7.6, 8.5, 9.2, 9.4, 9.7, 9.8, 12.4, 12.5_

- [ ] 8. Complete privacy, accessibility semantics, and release metadata
  - [~] 8.1 Create the maintained privacy inventory and in-app Privacy Notice
    - Model every app and third-party service data category with purpose, recipient, and retention rule, including current YouTube/Google and Netlify behavior.
    - Render the notice from the inventory behind an accessibility-labeled in-app control and distinguish app-controlled from third-party processing.
    - _Requirements: 11.5, 11.6, 11.7, 11.8, 11.9, 11.10_

  - [~] 8.2 Apply complete React and native accessibility semantics
    - Add nonempty control names, heading structure, logical reading order, selected-video state, informative image alternatives, decorative-image hiding, status announcements, and focus handling.
    - Keep all non-permission features available when future optional permissions are denied and expose no unused permission prompts.
    - _Requirements: 1.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 11.3, 11.4, 11.11, 11.12_

  - [~] 8.3 Configure app icons, branded launch assets, version metadata, entitlements, and privacy manifest
    - Set the Home Screen name to `Bhaavamrit`, use the approved icon, produce a branded launch experience, and retain a local-content fallback for slow network startup.
    - Include only shipped capabilities, record required-reason API and SDK privacy declarations, and omit notification capability for release one.
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 11.3_

  - [~] 8.4 Implement release-version and privacy-inventory validators
    - Reject empty, over-64-character, or previously distributed release identifiers.
    - Fail validation when any service or data category lacks a complete notice mapping or when native manifests and declared SDK inventory diverge.
    - _Requirements: 11.6, 11.7, 11.8, 11.9, 11.10, 12.6, 12.7_

  - [ ]* 8.5 Write the property test for privacy inventory coverage
    - **Property 12: Privacy notice covers the processing inventory**
    - Generate service and data-category inventories and verify each entry has exactly one complete notice mapping with no omission.
    - **Validates: Requirements 11.6, 11.7, 11.8, 11.9, 11.10**

  - [ ]* 8.6 Write the property test for bounded unique release versions
    - **Property 13: Release version validation is bounded and unique**
    - Generate proposed and prior identifiers and verify acceptance exactly matches nonempty, at-most-64-character, previously unused values.
    - **Validates: Requirements 12.6, 12.7**

  - [ ]* 8.7 Write automated accessibility and privacy component tests
    - Verify names, roles, headings, selected state, image alternatives, reading order, error announcements, privacy navigation, and complete rendered inventory entries.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10_

- [ ] 9. Add end-to-end release validation and App Store readiness gates
  - [~] 9.1 Implement the reproducible iOS release pipeline scripts
    - Capture one immutable source snapshot, generate and hash the canonical catalog, build Vite, sync that exact output into iOS, and compare the packaged catalog and assets with the snapshot.
    - Add noninteractive archive/build checks for display name, icon set, version/build identifiers, orientations, device family, entitlements, usage descriptions, plugin registration, local assets, and privacy manifest.
    - Stop on unreadable sources, incomplete checks, catalog differences, duplicate IDs, missing assets, hash mismatches, or configuration omissions.
    - _Requirements: 2.1, 2.6, 2.7, 2.8, 2.9, 12.1, 12.2, 12.3, 12.6, 12.7_

  - [~] 9.2 Add automated release-fixture and failure-path tests
    - Exercise clean generation plus omitted, additional, reordered, reassigned, changed, unreadable, duplicate, missing-asset, and hash-mismatch fixtures.
    - Verify each failure blocks the pipeline and identifies the unverified scope without exposing filesystem internals to users.
    - _Requirements: 2.6, 2.7, 2.8, 2.9_

  - [ ]* 9.3 Add Playwright viewport, interaction, and reduced-motion regression tests
    - Cover 320x568, 375x667, 390x844, 430x932, and 440x956 portrait viewports with scroll reachability, visible controls, no clipped required actions, route restoration, one-action-per-tap, disabled controls, and reduced motion.
    - _Requirements: 3.9, 3.10, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 10.10_

  - [ ]* 9.4 Add automated contrast, Dynamic Type, and accessibility-boundary tests
    - Check palette combinations and essential graphical boundaries against required ratios and exercise all standard iOS text-size categories through Accessibility Extra Extra Extra Large.
    - Verify content remains scrollable and actions remain available at viewport and text-size boundaries.
    - _Requirements: 9.2, 9.3, 9.5, 10.7, 10.8, 10.9_

  - [~] 9.5 Add a release-readiness verification command
    - Compose catalog parity, unit, property, component, browser, native, privacy, configuration, and archive checks into a non-watch command suitable for a clean checkout and continuous integration.
    - Emit a scoped report that distinguishes deterministic app failures from separately configured external-service checks.
    - _Requirements: 2.8, 2.9, 4.12, 8.7, 10.1, 11.5, 12.1, 12.4, 12.5, 12.6, 12.7_

- [~] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; core implementation and release-gate tasks are not optional.
- Every correctness property in the design has one separate property-based test task using fast-check with Vitest and at least 100 generated cases.
- Requirement 13 is conditional and notifications are omitted from release one by the approved design, so this plan adds no notification entitlement, permission prompt, preference UI, or delivery backend.
- App Store submission, manual review, content-rights approval, and user acceptance activities are outside this coding plan. The tasks create code, configuration, automated checks, and archive readiness only.
- The existing PWA and Android TWA remain supported; iOS-specific behavior is isolated behind typed platform adapters.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1", "3.3", "7.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.1", "7.2", "7.3", "7.4"] },
    { "id": 3, "tasks": ["2.3", "2.4"] },
    { "id": 4, "tasks": ["4.2", "5.1", "5.2", "6.1", "7.5", "8.1", "8.3"] },
    { "id": 5, "tasks": ["5.3", "6.2", "6.3", "6.4", "8.4"] },
    { "id": 6, "tasks": ["6.5", "8.2"] },
    { "id": 7, "tasks": ["9.1"] },
    { "id": 8, "tasks": ["9.2"] },
    { "id": 9, "tasks": ["9.5"] },
    { "id": 10, "tasks": ["10"] },
    { "id": 11, "tasks": ["2.5", "2.6", "2.7", "3.4", "3.5", "3.6", "3.7", "3.8", "4.3", "4.4", "4.5", "4.6", "5.4", "5.5", "6.6", "7.6", "7.7", "7.8", "8.5", "8.6", "8.7", "9.3", "9.4"] }
  ]
}
```
