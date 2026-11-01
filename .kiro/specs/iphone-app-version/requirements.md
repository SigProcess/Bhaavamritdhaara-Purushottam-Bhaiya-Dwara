# Requirements Document

## Introduction

The iPhone app version will make Bhaavamritdhaara — Purushottam Bhaiya Dwara available as an iPhone application while preserving the devotional content and core behavior of the existing React/Vite web app. The current product provides a bilingual Hindi-English introduction, bhajan PDF search and download, curated YouTube collections and playlists, embedded video playback, and published PDF books. The iPhone version is intended to remain a non-commercial, account-free experience.

The requirements below describe user-visible behavior rather than a specific implementation. Product choices that cannot be determined from the current repository are recorded in **Open Decisions for User Review**.

## Glossary

- **iPhone_App**: The Bhaavamritdhaara application made available for supported Apple iPhone devices.
- **Existing_Web_App**: The current React/Vite Bhaavamritdhaara website hosted as a Progressive Web App.
- **Content_Catalog**: The ordered set of collections, playlists, videos, bhajan documents, books, titles, thumbnails, and descriptive metadata presented by the Existing_Web_App.
- **Home_Screen**: The first content screen shown after the iPhone_App starts.
- **Collection**: A named group of one or more devotional YouTube playlists.
- **Playlist**: An ordered group of devotional YouTube videos.
- **Video_Player**: The interface used to play a selected YouTube video or Playlist.
- **Bhajan_Finder**: The interface used to browse and search bhajan documents.
- **Bhajan_Document**: A PDF document containing a bhajan and associated bhaav or meaning.
- **Book**: A published devotional PDF document displayed with title, cover, and page-count metadata.
- **Document_Viewer**: The interface used to read a Bhajan_Document or Book.
- **Hindi_Title**: A content title written in Devanagari script.
- **English_Title**: An English transliteration or English-language content title.
- **External_Media_Service**: A third-party service, including YouTube, that supplies video, audio, or thumbnail content.
- **Network_Connection**: An internet connection available to the iPhone_App.
- **VoiceOver**: The screen reader included with iOS.
- **Dynamic_Type**: The iOS setting that controls preferred text size.
- **Safe_Area**: The visible iPhone screen region that excludes the status area, camera cutout, and Home indicator.
- **App_Store**: Apple’s application distribution service.
- **Privacy_Notice**: A user-readable description of data handling and third-party services.
- **Notification_Feature**: An optional capability for sending notices about new devotional content.
- **Current_Content_Source**: The repository-managed catalog and documents used by the Existing_Web_App at the time an iPhone_App release is prepared.

## Requirements

### Requirement 1: Preserve Product Identity and Introduction

**User Story:** As a devotee, I want the iPhone app to retain the identity and welcome content of Bhaavamritdhaara, so that I recognize the trusted devotional collection.

#### Acceptance Criteria

1. WHEN a user launches the iPhone_App from a terminated state, THE iPhone_App SHALL present the Home_Screen as the first interactive screen.
2. THE Home_Screen SHALL display the English name “Bhaavamritdhaara — Purushottam Bhaiya Dwara.”
3. THE Home_Screen SHALL display the Hindi name “भावामृत धारा.”
4. THE Home_Screen SHALL identify the available categories as “Bhajans,” “Pravachans,” “Lekh,” “Vani Vishleshan,” and “Published Books.”
5. THE Home_Screen SHALL display the existing `/bhaiya-banner.jpg` hero image.
6. THE Home_Screen SHALL identify the informative hero image with the accessible name “Shri Purushottam Bhaiya.”
7. THE iPhone_App SHALL use ivory `#F0E6D6`, saffron `#E07A1F`, crimson `#B03040`, earth `#1A0A02`, and gold `#C9933A` as the product-identity palette.

### Requirement 2: Present the Current Devotional Catalog

**User Story:** As a devotee, I want the iPhone app to contain the same devotional catalog as the website, so that changing devices does not remove available content.

#### Acceptance Criteria

1. WHEN release validation starts, THE iPhone_App SHALL create a start-of-validation snapshot of the Current_Content_Source.
2. THE start-of-validation snapshot SHALL record every Collection, standalone Playlist, Playlist membership, video, Bhajan_Document, and Book present in the Current_Content_Source.
3. THE start-of-validation snapshot SHALL record the source order of every Collection, standalone Playlist, Playlist within a Collection, video within a Playlist, Bhajan_Document, and Book.
4. THE start-of-validation snapshot SHALL record each source-provided identifier, Hindi_Title, English_Title, display title, subtitle, author, thumbnail reference, cover reference, page count, document reference, Playlist identifier, and Collection assignment.
5. THE start-of-validation snapshot SHALL exclude runtime playback position, transient Network_Connection status, cached files, generated interface state, and metadata supplied only after a live External_Media_Service request.
6. WHEN release validation compares the iPhone_App with the start-of-validation snapshot, THE iPhone_App SHALL contain every recorded catalog item with the recorded membership and order.
7. WHEN release validation compares catalog metadata, THE iPhone_App SHALL match every recorded metadata value exactly, including capitalization, punctuation, Devanagari characters, identifiers, and asset references.
8. IF release validation finds an omitted item, additional item, membership difference, order difference, or metadata difference, THEN THE iPhone_App SHALL block the release.
9. IF release validation cannot read the Current_Content_Source or cannot complete the catalog comparison, THEN THE iPhone_App SHALL block the release and identify the unverified catalog scope.

### Requirement 3: Browse Collections and Playlists

**User Story:** As a listener, I want to browse devotional collections and playlists, so that I can find a recording by subject or series.

#### Acceptance Criteria

1. THE iPhone_App SHALL display each Collection with the exact title, representative thumbnail, and Playlist count recorded in the start-of-validation snapshot.
2. WHEN a user selects a Collection, THE iPhone_App SHALL display exactly the Playlists assigned to the selected Collection in the recorded order.
3. WHEN a Collection contains zero Playlists, THE iPhone_App SHALL display an empty-state message naming the Collection.
4. IF the iPhone_App cannot load a Collection, THEN THE iPhone_App SHALL display an error state naming the Collection and a retry action.
5. THE iPhone_App SHALL display each available Playlist with the exact recorded title and thumbnail.
6. WHEN a user selects an available standalone Playlist, THE iPhone_App SHALL open the selected Playlist in the Video_Player.
7. WHEN a user selects an available Playlist within a Collection, THE iPhone_App SHALL open the selected Playlist in the Video_Player.
8. IF a selected Playlist is unavailable, THEN THE iPhone_App SHALL keep the originating content screen visible and identify the unavailable Playlist.
9. WHEN a user returns from a Playlist opened within a Collection, THE iPhone_App SHALL restore the originating Collection at the prior scroll position.
10. WHEN a user closes a Collection or Video_Player opened from another content screen, THE iPhone_App SHALL restore the preceding content screen at the prior scroll position.

### Requirement 4: Play Devotional Videos

**User Story:** As a listener, I want to play videos from devotional playlists, so that I can listen to bhajans and pravachans in the app.

#### Acceptance Criteria

1. WHEN the Video_Player opens a Playlist with recorded video metadata, THE Video_Player SHALL select the first video in the recorded Playlist order without starting playback.
2. WHEN the Video_Player opens a Playlist, THE Video_Player SHALL display the exact recorded Playlist title.
3. WHEN recorded video metadata is available, THE Video_Player SHALL display the exact number of recorded videos.
4. WHEN recorded video metadata is available, THE Video_Player SHALL display every recorded video title and thumbnail in the recorded Playlist order.
5. WHILE the Video_Player displays a Playlist with recorded video metadata, THE Video_Player SHALL identify exactly one video as selected.
6. WHEN a user selects a different video, THE Video_Player SHALL identify only the chosen video as selected.
7. WHEN a user activates playback for a selected available video, THE Video_Player SHALL begin playback within 5 seconds.
8. WHEN a user selects an available video that is not playing, THE Video_Player SHALL begin playback of the selected video within 5 seconds.
9. WHEN recorded individual-video metadata is unavailable and a valid Playlist identifier is available, THE Video_Player SHALL present the External_Media_Service Playlist player for the recorded Playlist identifier.
10. WHEN the External_Media_Service supports full-screen playback, THE Video_Player SHALL provide a control that enters full-screen playback.
11. WHEN a user exits full-screen playback, THE Video_Player SHALL restore the same selected video and playback position.
12. IF a selected video cannot begin playback within 5 seconds, THEN THE Video_Player SHALL identify the selected video and display a retry action.
13. IF neither recorded individual-video metadata nor a valid Playlist identifier is available, THEN THE Video_Player SHALL display an unavailable-state message naming the Playlist.

### Requirement 5: Find Bhajan Documents

**User Story:** As a reader, I want to search bhajans by Hindi or English name, so that I can locate a bhajan and associated meaning.

#### Acceptance Criteria

1. WHEN the Bhajan_Finder opens without a search query, THE Bhajan_Finder SHALL display the first five distinct Bhajan_Documents in Content_Catalog order.
2. WHEN the Bhajan_Finder opens, THE Bhajan_Finder SHALL display the total count of distinct Bhajan_Documents.
3. WHEN a user submits a search query containing 1 through 200 Unicode characters after removal of leading and trailing whitespace, THE Bhajan_Finder SHALL compare the trimmed query with Hindi_Title and English_Title values.
4. WHEN the Bhajan_Finder compares a valid search query, THE Bhajan_Finder SHALL use Unicode case-insensitive contiguous-substring matching.
5. WHEN a valid search query matches Bhajan_Documents, THE Bhajan_Finder SHALL display every distinct matching Bhajan_Document in Content_Catalog order.
6. WHEN search results are displayed, THE Bhajan_Finder SHALL display the count of distinct matching Bhajan_Documents.
7. IF a valid search query matches zero Bhajan_Documents, THEN THE Bhajan_Finder SHALL display “कोई भजन नहीं मिला” and “No bhajan found.”
8. WHEN a user requests the complete bhajan list without an active search query, THE Bhajan_Finder SHALL display every distinct Bhajan_Document in Content_Catalog order.
9. THE Bhajan_Finder SHALL display the exact Hindi_Title and English_Title for each Bhajan_Document.
10. WHEN a Bhajan_Document includes associated bhaav or meaning metadata, THE Bhajan_Finder SHALL display the associated bhaav or meaning with the Bhajan_Document.
11. IF a submitted search query contains more than 200 Unicode characters after removal of leading and trailing whitespace, THEN THE Bhajan_Finder SHALL display a validation message stating the 200-character limit without executing the search.
12. WHEN a submitted search query contains zero Unicode characters after removal of leading and trailing whitespace, THE Bhajan_Finder SHALL restore the first five distinct Bhajan_Documents.
13. WHEN a user clears an active search query, THE Bhajan_Finder SHALL restore the first five distinct Bhajan_Documents and the total distinct Bhajan_Document count.

### Requirement 6: Read and Export Bhajan Documents

**User Story:** As a reader, I want to open and save bhajan documents, so that I can read or retain devotional text on my iPhone.

#### Acceptance Criteria

1. WHEN a user selects the open action for an available Bhajan_Document, THE Document_Viewer SHALL open the selected Bhajan_Document at the first page.
2. WHILE a Bhajan_Document is open, THE Document_Viewer SHALL display every PDF page in ascending PDF page order.
3. WHILE a Bhajan_Document is open, THE Document_Viewer SHALL support forward and backward scrolling across all PDF pages.
4. WHILE a Bhajan_Document is open, THE Document_Viewer SHALL support zoom levels from 100 percent through 500 percent inclusive.
5. WHEN a user selects the export action for a Bhajan_Document, THE iPhone_App SHALL present the iOS share and save destination chooser for the selected PDF.
6. WHEN a user cancels the iOS share and save destination chooser, THE iPhone_App SHALL return to the selected Bhajan_Document without reporting an error.
7. IF the iOS share or save operation fails, THEN THE iPhone_App SHALL keep the selected Bhajan_Document open and display an error message with a retry action.
8. IF a Bhajan_Document cannot be opened, THEN THE iPhone_App SHALL display the affected Hindi_Title and a retry action.

### Requirement 7: Browse and Read Published Books

**User Story:** As a reader, I want to browse and read the published books, so that I can access devotional texts from my iPhone.

#### Acceptance Criteria

1. THE iPhone_App SHALL display every Book in Content_Catalog order.
2. THE iPhone_App SHALL display the exact recorded cover, title, subtitle, author, and page count for each Book.
3. WHEN a user selects an available Book, THE Document_Viewer SHALL open the selected Book at the first page.
4. WHILE a Book is open, THE Document_Viewer SHALL display every PDF page in ascending PDF page order.
5. WHILE a Book is open, THE Document_Viewer SHALL support forward and backward scrolling across all PDF pages.
6. WHILE a Book is open, THE Document_Viewer SHALL support zoom levels from 100 percent through 300 percent inclusive.
7. IF a Book cannot be opened, THEN THE iPhone_App SHALL display the affected Book title and a retry action.
8. WHEN a user activates the Book retry action, THE iPhone_App SHALL retry opening the same Book without changing the selected catalog item.

### Requirement 8: Handle Network-Dependent Content

**User Story:** As a user with an unreliable connection, I want clear feedback when online content is unavailable, so that I understand how to recover.

#### Acceptance Criteria

1. IF the Network_Connection is unavailable when a user requests content from an External_Media_Service, THEN THE iPhone_App SHALL identify the requested content as requiring a Network_Connection.
2. IF an External_Media_Service request fails, THEN THE iPhone_App SHALL display a retry action associated only with the failed request.
3. WHILE the Network_Connection is unavailable, THE iPhone_App SHALL keep locally available navigation usable.
4. WHILE the Network_Connection is unavailable, THE iPhone_App SHALL display locally available Content_Catalog metadata.
5. WHEN the Network_Connection becomes available after a failed request, THE iPhone_App SHALL enable the retry action for the same failed request without requiring an iPhone_App restart.
6. WHEN a user activates a request-specific retry action after reconnection, THE iPhone_App SHALL retry only the associated failed request.
7. IF a retried request fails, THEN THE iPhone_App SHALL preserve locally available navigation and metadata and display the request-specific retry action again.

### Requirement 9: Support iPhone Displays and Interaction

**User Story:** As an iPhone user, I want the interface to fit my device and respond to touch, so that I can use every feature without hidden or obstructed controls.

#### Acceptance Criteria

1. THE iPhone_App SHALL support portrait viewports from 320 through 440 points wide and from 568 through 956 points high inclusive.
2. WHILE the iPhone_App is displayed at a supported portrait viewport, THE iPhone_App SHALL contain every interactive control within the Safe_Area.
3. WHILE Dynamic_Type is set to any standard iOS text size from Extra Small through Accessibility Extra Extra Extra Large, THE iPhone_App SHALL present all text without clipping text or hiding required actions.
4. THE iPhone_App SHALL provide a touch target measuring at least 44 by 44 points for every interactive control.
5. WHEN content exceeds the available viewport height, THE iPhone_App SHALL provide vertical scrolling that exposes all content and required actions.
6. THE iPhone_App SHALL display a persistent visible affordance for every interactive control without requiring hover interaction.
7. WHEN a user performs one valid tap on an enabled control, THE iPhone_App SHALL activate the control exactly once.
8. WHEN a user performs one valid tap on a disabled control, THE iPhone_App SHALL perform zero control actions.

### Requirement 10: Provide Accessible Content

**User Story:** As a user who relies on iPhone accessibility features, I want the devotional content and controls to be accessible, so that I can use the app independently.

#### Acceptance Criteria

1. WHILE VoiceOver is active, THE iPhone_App SHALL announce a non-empty accessible name that identifies the purpose of every interactive control.
2. WHILE VoiceOver is active, THE Video_Player SHALL announce the selected state for the one selected video.
3. WHILE VoiceOver is active, THE iPhone_App SHALL expose each visible section title as a heading.
4. WHILE VoiceOver is active, THE iPhone_App SHALL expose controls and content in the same logical order as the visible reading and interaction order.
5. THE iPhone_App SHALL provide a non-empty text alternative describing the subject or purpose of each informative image.
6. THE iPhone_App SHALL hide each decorative image from accessibility services.
7. THE iPhone_App SHALL present text smaller than 18 points, or smaller than 14 points when bold, with a contrast ratio of at least 4.5 to 1 against the text background.
8. THE iPhone_App SHALL present text at least 18 points, or at least 14 points when bold, with a contrast ratio of at least 3 to 1 against the text background.
9. THE iPhone_App SHALL present essential graphical objects and control boundaries with a contrast ratio of at least 3 to 1 against adjacent colors.
10. WHILE the iPhone Reduce Motion setting is enabled, THE iPhone_App SHALL replace nonessential movement animations with transitions that do not create spatial movement.

### Requirement 11: Preserve Account-Free and Non-Commercial Use

**User Story:** As a privacy-conscious devotee, I want access without an account or advertising, so that I can use the devotional app without providing personal information.

#### Acceptance Criteria

1. THE iPhone_App SHALL provide access to the Content_Catalog without account registration or sign-in.
2. THE iPhone_App SHALL provide access to the Content_Catalog without paid advertising or sponsored placements.
3. THE iPhone_App SHALL request only an iOS permission required by a user-invoked feature.
4. WHEN a user invokes a feature that requires an iOS permission, THE iPhone_App SHALL request the required permission at that time.
5. THE iPhone_App SHALL provide a Privacy_Notice reachable through an accessibility-labeled control from the iPhone_App.
6. THE Privacy_Notice SHALL identify every External_Media_Service used by the iPhone_App by service name.
7. THE Privacy_Notice SHALL state the purpose for each category of data processed by the iPhone_App or an External_Media_Service.
8. THE Privacy_Notice SHALL identify each category of data processed by the iPhone_App or an External_Media_Service.
9. THE Privacy_Notice SHALL identify the recipients of each processed data category.
10. THE Privacy_Notice SHALL state the retention period or retention-determination rule for each processed data category.
11. IF a user declines or revokes an optional iOS permission, THEN THE iPhone_App SHALL keep every feature that does not require the permission usable.
12. IF a user declines or revokes a required iOS permission, THEN THE iPhone_App SHALL explain which invoked feature is unavailable and provide access to all features that do not require the permission.

### Requirement 12: Install and Launch as an iPhone App

**User Story:** As an iPhone user, I want to install and launch Bhaavamritdhaara like an iPhone app, so that the devotional collection is easy to access.

#### Acceptance Criteria

1. WHERE App_Store distribution is selected, WHEN a user completes installation from an approved App_Store listing, THE iPhone_App SHALL appear as an installed application on the iPhone Home Screen.
2. THE iPhone_App SHALL display the Home Screen application name `Bhaavamrit`.
3. THE iPhone_App SHALL display the designated approved app icon on the iPhone Home Screen.
4. WHEN a user launches the iPhone_App from a terminated state, THE iPhone_App SHALL display a branded launch experience within 5 seconds of the launch request.
5. IF startup cannot retrieve Network_Connection-dependent content within 5 seconds, THEN THE iPhone_App SHALL present the locally available Home_Screen and identify the unavailable online content.
6. THE iPhone_App SHALL use a non-empty release version identifier containing no more than 64 characters.
7. WHEN two distributed releases are compared, THE iPhone_App SHALL use different release version identifiers for the two releases.

### Requirement 13: Optional Content Notifications

**User Story:** As a returning user, I want the choice to receive notices about new devotional content, so that I can discover updates without repeatedly checking the app.

#### Acceptance Criteria

1. WHERE the Notification_Feature is included, THE iPhone_App SHALL keep content notifications disabled until iOS notification permission is granted.
2. WHERE the Notification_Feature is included, WHEN a user enables content notifications, THE iPhone_App SHALL request iOS notification permission.
3. WHERE the Notification_Feature is included, WHEN iOS notification permission is granted, THE iPhone_App SHALL mark content notifications as enabled.
4. WHERE the Notification_Feature is included, IF a user declines or revokes iOS notification permission, THEN THE iPhone_App SHALL keep every non-notification feature usable.
5. WHERE the Notification_Feature is included, IF a user revokes iOS notification permission, THEN THE iPhone_App SHALL mark content notifications as disabled after the iPhone_App next becomes active.
6. WHERE the Notification_Feature is included, THE iPhone_App SHALL provide an accessibility-labeled control that opens the iOS notification settings for the iPhone_App.
7. WHERE the Notification_Feature is included, WHEN new devotional content becomes available while content notifications are enabled, THE Notification_Feature SHALL deliver exactly one notification identifying the new content within 15 minutes.
8. WHERE the Notification_Feature is included, WHEN a user selects a delivered content notification, THE iPhone_App SHALL open the identified new content.

## Open Decisions for User Review

The repository establishes current behavior but does not resolve the following product decisions. The proposed defaults are starting points for review, not approved requirements.

1. **Distribution model:** Should the iPhone version be an App_Store app, an installable Home Screen web app, or both? Proposed default: App_Store app, because the request asks for an iPhone app and an Android store-oriented wrapper already exists.
2. **Implementation approach:** Should the team package the existing web experience, build a native iOS interface, or use a cross-platform container? Proposed default: decide during design after checking App_Store acceptance constraints, embedded YouTube behavior, maintenance effort, and feature parity.
3. **Supported iOS versions:** The minimum iOS version is not specified. Proposed default: choose the oldest version that still receives Apple security updates when implementation begins.
4. **Offline scope:** The existing product caches part of the web interface and selected remote assets but does not define complete offline media or document access. Proposed default: keep navigation and catalog metadata available offline; require a connection for YouTube playback; decide separately whether users can retain PDFs for offline reading.
5. **Catalog updates:** The repository does not establish whether a released iPhone app must receive catalog changes immediately from the website or only through app releases. Proposed default: use the Current_Content_Source without requiring a new app release for routine catalog updates, subject to design and App_Store constraints.
6. **Notifications:** The Android configuration enables notification capability, but the current React interface does not expose notification preferences. Proposed default: omit notifications from the first iPhone release unless the user confirms the Notification_Feature.
7. **External links:** The desired behavior for opening YouTube or PDFs outside the iPhone_App is not specified. Proposed default: keep primary viewing inside the iPhone_App and provide an explicit system share or external-open action where permitted.
8. **iPad support:** The request names iPhone only. Proposed default: scope the first release to iPhone compatibility and treat an iPad-optimized interface as a later feature.
9. **App language settings:** The current experience combines Hindi and English on the same screens. Proposed default: preserve the bilingual presentation rather than add a language selector in the first release.
10. **User data features:** Favorites, playback history, accounts, synchronization, analytics, and advertising do not exist in the current user experience. Proposed default: exclude those features from the first iPhone release.
