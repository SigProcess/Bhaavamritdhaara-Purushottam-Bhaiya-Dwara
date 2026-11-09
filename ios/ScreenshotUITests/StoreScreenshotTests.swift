import CoreGraphics
import ImageIO
import UIKit
import XCTest

/// Drives the shipped Bhaavamrit app in an iOS Simulator and captures App Store screenshots.
///
/// This target is **not** part of the committed Xcode project. `scripts/ios-screenshot-project.rb`
/// injects it into a throwaway copy of the project settings on the CI runner only, so the
/// release-validated `project.pbxproj` is never changed in the repository.
///
/// Capture order matches the App Store product-page order we want, which leads with native,
/// offline PDF reading because App Store Review Guideline 4.2 is this app's main rejection risk:
///   01 native PDF reader   02 Bhajan Finder   03 collections grid   04 playlist   05 video player
///
/// Every PNG is flattened onto an opaque background before it leaves the simulator, because Apple
/// rejects screenshots that carry an alpha channel.
final class StoreScreenshotTests: XCTestCase {

    private var app: XCUIApplication!
    private var log: [String] = []
    private var captured: [String] = []

    /// Anchor navigation uses `html { scroll-behavior: smooth }`, so every tap needs settle time.
    private let settle: TimeInterval = 1.8
    private let shortTimeout: TimeInterval = 12
    private let longTimeout: TimeInterval = 60

    override func setUpWithError() throws {
        // Never abandon the run on the first missing element: a partial capture plus a full
        // accessibility dump is far more useful than an early exit.
        continueAfterFailure = true
        app = XCUIApplication()
    }

    override func tearDownWithError() throws {
        note("CAPTURED=\(captured.joined(separator: ","))")
        let text = log.joined(separator: "\n") + "\n"
        attach(name: "navigation-log.txt", uti: "public.plain-text", payload: Data(text.utf8))
        write(name: "navigation-log.txt", data: Data(text.utf8))
    }

    // MARK: - The run

    func testCaptureStoreScreenshots() throws {
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: longTimeout), "app did not reach foreground")

        let ready = app.links["Bhajan Finder"].waitForExistence(timeout: longTimeout)
        note("web-content-ready=\(ready)")
        if !ready {
            // The web view never exposed its DOM to the accessibility layer. Dump everything so
            // the next iteration has real selectors instead of guesses.
            note("FATAL: home screen never exposed 'Bhajan Finder' link")
        }
        sleep(settle)

        // The element tree is the single most valuable diagnostic for selector drift.
        attach(name: "home-hierarchy.txt", uti: "public.plain-text", payload: Data(app.debugDescription.utf8))
        note("--- inventory ---")
        note("links=\(labels(of: app.links))")
        note("buttons=\(labels(of: app.buttons))")
        note("searchFields=\(labels(of: app.searchFields))")
        note("--- end inventory ---")

        captureNativeDocumentReader()
        captureBhajanFinder()
        captureCollectionsGrid()
        captureVideoScreens()
    }

    // MARK: - 01 native PDF reader (strongest Guideline 4.2 evidence, so it leads)

    private func captureNativeDocumentReader() {
        note("step=01-native-pdf-reader")

        // Preferred: a published book. Fallback: the first bhajan in the Bhajan Finder.
        var opened = false
        if tapLink(["Published Books"]) {
            opened = tapFirstButton(labelBeginsWith: "Read Book", excluding: [])
            note("book-card-tapped=\(opened)")
        }
        if !opened, tapLink(["Bhajan Finder", "Bhajans"]) {
            // Bhajan open buttons are `aria-label="Open {hindiTitle}"`. Collection cards are
            // `aria-label="Open {title}, N playlists"`, so exclude anything mentioning playlists.
            opened = tapFirstButton(labelBeginsWith: "Open ", excluding: ["playlist"])
            note("bhajan-open-tapped=\(opened)")
        }
        guard opened else {
            note("SKIPPED 01: no document control could be tapped")
            return
        }

        let appeared = readerIsVisible(timeout: longTimeout)
        note("native-reader-visible=\(appeared) close-label=\(readerCloseButton.exists ? readerCloseButton.label : "none")")
        guard appeared else {
            note("SKIPPED 01: native PDF reader did not present (tried buttons[\"Zoom In\"] and label BEGINSWITH \"Close \")")
            attach(name: "01-failure-hierarchy.txt", uti: "public.plain-text", payload: Data(app.debugDescription.utf8))
            return
        }
        sleep(3.0) // let PDFKit finish laying out and rendering page 1
        capture("01-offline-pdf-reader")

        note("native-reader-dismissed=\(dismissReaderIfPresent())")
    }

    // MARK: - Reader detection

    /// `DocumentViewController.configureNavigationControls()` builds the bar button with
    /// `title: "Done"` and then assigns `accessibilityLabel = "Close {title}"`. On a
    /// `UIBarButtonItem` that assignment *replaces* the title for accessibility queries, so
    /// `app.buttons["Done"]` can never match and a literal lookup just burns its full timeout.
    /// Match the `Close ` prefix instead, and prefer the toolbar's fixed `Zoom In`/`Zoom Out`
    /// labels from `makeToolbarButton(title:)` as the presence signal: those are
    /// language-independent and identical for every document.
    private var readerCloseButton: XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Close ")).firstMatch
    }

    private func readerIsVisible(timeout: TimeInterval) -> Bool {
        if app.buttons["Zoom In"].waitForExistence(timeout: timeout) { return true }
        return readerCloseButton.exists
    }

    @discardableResult
    private func dismissReaderIfPresent() -> Bool {
        let close = readerCloseButton
        guard close.exists else { return false }
        close.tap()
        sleep(settle)
        let restored = app.links["Bhajan Finder"].waitForExistence(timeout: shortTimeout)
        note("reader-dismissed home-restored=\(restored)")
        return true
    }

    /// Presenting the reader removes the web view from the accessibility tree entirely, so a
    /// leftover modal makes every later selector fail against a hierarchy that no longer
    /// contains the page. Each step therefore re-establishes the home screen itself rather
    /// than trusting the previous step to have left things tidy.
    private func prepareHome() {
        dismissReaderIfPresent()
        scrollToTop()
        note("home-ready=\(app.links["Bhajan Finder"].exists)")
    }

    // MARK: - 02 Bhajan Finder / search

    private func captureBhajanFinder() {
        note("step=02-bhajan-finder")
        prepareHome()
        guard tapLink(["Bhajan Finder", "Bhajans"]) else {
            note("SKIPPED 02: no Bhajan Finder anchor link")
            return
        }
        sleep(settle)

        // Typing a query makes a far better store screenshot than the idle list, but it is the
        // most fragile step here (software keyboard, autocapitalisation, blur). Degrade quietly.
        let field = app.searchFields.firstMatch
        if field.waitForExistence(timeout: shortTimeout), field.isHittable {
            field.tap()
            sleep(0.8)
            field.typeText("aanand")
            sleep(1.2)
            note("query-typed=true value=\(String(describing: field.value))")
            dismissKeyboard()
        } else {
            note("query-typed=false (search field unavailable); capturing idle finder")
        }
        sleep(settle)
        capture("02-bhajan-finder-search")
    }

    // MARK: - 03 collections grid

    private func captureCollectionsGrid() {
        note("step=03-collections-grid")
        prepareHome()
        guard tapLink(["Pravachans", "Lekh", "Vani Vishleshan"]) else {
            note("SKIPPED 03: no collections anchor link")
            return
        }
        sleep(settle + 0.8)
        capture("03-collections-grid")
    }

    // MARK: - 04 playlist with video list, 05 video playing

    private func captureVideoScreens() {
        note("step=04-playlist")
        prepareHome()

        // Collection cards carry "N playlists" in their label; that disambiguates them from the
        // bhajan "Open {title}" buttons. The collection detail screen scrolls itself to the top
        // and renders a grid of "Play {title}" playlist cards, which is the deterministic route
        // to a playlist without blind swiping.
        var onPlaylist = false
        if tapFirstButton(labelContains: "playlists", excluding: []) {
            sleep(settle)
            note("collection-opened=true heading=\(firstHeadingLabel())")
            onPlaylist = tapFirstButton(labelBeginsWith: "Play ", excluding: ["selected video"])
            note("playlist-card-tapped=\(onPlaylist)")
        }
        if !onPlaylist {
            note("SKIPPED 04/05: could not reach a playlist screen")
            attach(name: "04-failure-hierarchy.txt", uti: "public.plain-text", payload: Data(app.debugDescription.utf8))
            return
        }

        // The playlist screen never autoplays, so this is a clean "video list" shot.
        sleep(settle + 1.5)
        capture("04-playlist-video-list")

        note("step=05-video-player")
        let play = app.buttons["Play selected video"]
        guard play.waitForExistence(timeout: shortTimeout), play.isHittable else {
            note("SKIPPED 05: 'Play selected video' unavailable")
            return
        }
        play.tap()

        // Status text goes "Starting {title}…" then "Playing {title}." on success, or one of the
        // documented failure strings. Record whichever we land on; do not pretend it played.
        let playing = app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "Playing ")).firstMatch
        let started = playing.waitForExistence(timeout: longTimeout)
        note("playback-status-reached=\(started) status=\(statusLabel())")
        if !started {
            note("WARNING 05: embedded player never reported playback; capturing actual state")
        }
        sleep(4.0) // let the YouTube iframe paint its first frames
        capture("05-video-player")
    }

    // MARK: - Capture

    private func capture(_ name: String) {
        let shot = XCUIScreen.main.screenshot()
        guard let png = opaquePNG(from: shot) else {
            note("FAILED capture \(name): could not flatten screenshot")
            return
        }
        attach(name: "\(name).png", uti: "public.png", payload: png)
        write(name: "\(name).png", data: png)
        let size = shot.image.cgImage.map { "\($0.width)x\($0.height)" } ?? "unknown"
        captured.append(name)
        note("captured \(name) pixels=\(size) bytes=\(png.count)")
    }

    /// Redraws the screenshot over opaque white with no alpha channel, then PNG-encodes it.
    /// Doing this in-process guarantees the bytes that leave the simulator are already
    /// App Store compliant, rather than relying on a post-processing tool being installed.
    private func opaquePNG(from screenshot: XCUIScreenshot) -> Data? {
        guard let source = screenshot.image.cgImage else { return nil }
        let width = source.width
        let height = source.height
        guard width > 0, height > 0,
              let space = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(
                  data: nil,
                  width: width,
                  height: height,
                  bitsPerComponent: 8,
                  bytesPerRow: 0,
                  space: space,
                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
              )
        else { return nil }

        let rect = CGRect(x: 0, y: 0, width: width, height: height)
        context.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
        context.fill(rect)
        context.draw(source, in: rect)

        guard let flattened = context.makeImage() else { return nil }
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, "public.png" as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, flattened, nil)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return data as Data
    }

    // MARK: - Output plumbing

    private func attach(name: String, uti: String, payload: Data) {
        let attachment = XCTAttachment(uniformTypeIdentifier: uti, name: name, payload: payload, userInfo: nil)
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// Second, independent delivery path. The runner app's Documents directory is reachable from
    /// the host with `xcrun simctl get_app_container`, which keeps file names intact even if
    /// `xcresulttool` attachment export behaves differently across Xcode versions.
    private func write(name: String, data: Data) {
        guard let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let directory = base.appendingPathComponent("StoreScreenshots", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: directory.appendingPathComponent(name), options: .atomic)
    }

    private func note(_ message: String) {
        log.append(message)
        print("[screenshots] \(message)")
    }

    // MARK: - Element helpers

    private func sleep(_ seconds: TimeInterval) {
        Thread.sleep(forTimeInterval: seconds)
    }

    /// WebKit reports element frames in page coordinates, not window coordinates, so at scroll
    /// offset 0 most targets report `isHittable == false` purely because they sit below the
    /// viewport — the collection cards start around y≈2694 and the books section near y≈9000
    /// against an 874pt window. Swipe until the element is actually hittable, bounded in both
    /// directions so a genuinely absent element cannot spin forever.
    private func scrollIntoView(_ element: XCUIElement, attempts: Int = 12) -> Bool {
        guard element.exists else { return false }
        if element.isHittable { return true }
        for _ in 0..<attempts {
            app.swipeUp()
            sleep(0.4)
            if element.isHittable { return true }
        }
        for _ in 0..<(attempts * 2) {
            app.swipeDown()
            sleep(0.4)
            if element.isHittable { return true }
        }
        return element.isHittable
    }

    private func scrollToTop(attempts: Int = 16) {
        for _ in 0..<attempts { app.swipeDown() }
        sleep(settle)
    }

    private func labels(of query: XCUIElementQuery) -> String {
        let all = query.allElementsBoundByIndex.prefix(40).map { element -> String in
            let label = element.label.replacingOccurrences(of: "\n", with: " ")
            return "\u{201C}\(label)\u{201D}\(element.isHittable ? "" : "[offscreen]")"
        }
        return all.joined(separator: " | ")
    }

    private func tapLink(_ names: [String]) -> Bool {
        for name in names {
            let link = app.links[name]
            if link.waitForExistence(timeout: shortTimeout), scrollIntoView(link) {
                link.tap()
                note("tapped link \u{201C}\(name)\u{201D}")
                return true
            }
        }
        note("no link tapped from \(names) (exists but not hittable after scrolling, or absent)")
        return false
    }

    private func tapFirstButton(labelBeginsWith prefix: String, excluding exclusions: [String]) -> Bool {
        tapFirstButton(predicate: NSPredicate(format: "label BEGINSWITH %@", prefix), description: "BEGINSWITH \(prefix)", excluding: exclusions)
    }

    private func tapFirstButton(labelContains fragment: String, excluding exclusions: [String]) -> Bool {
        tapFirstButton(predicate: NSPredicate(format: "label CONTAINS %@", fragment), description: "CONTAINS \(fragment)", excluding: exclusions)
    }

    private func tapFirstButton(predicate: NSPredicate, description: String, excluding exclusions: [String]) -> Bool {
        let matches = app.buttons.matching(predicate)
        guard matches.firstMatch.waitForExistence(timeout: shortTimeout) else {
            note("no button matched \(description)")
            return false
        }
        for element in matches.allElementsBoundByIndex.prefix(25) {
            let label = element.label
            if exclusions.contains(where: { label.localizedCaseInsensitiveContains($0) }) { continue }
            guard element.exists, scrollIntoView(element) else { continue }
            element.tap()
            note("tapped button \u{201C}\(label)\u{201D} (\(description))")
            return true
        }
        note("matched \(description) but nothing became hittable after scrolling: \(labels(of: matches))")
        return false
    }

    private func dismissKeyboard() {
        guard app.keyboards.count > 0 else {
            note("keyboard-dismiss=not-needed")
            return
        }
        for key in ["search", "Search", "go", "Go", "return", "Return", "done", "Done"] {
            let button = app.keyboards.buttons[key]
            if button.exists, button.isHittable {
                button.tap()
                sleep(1.0)
                note("keyboard-dismissed-via=\(key)")
                return
            }
        }
        // Last resort: tap the section heading to blur the field.
        let heading = app.staticTexts["Bhajan Finder"]
        if heading.exists, heading.isHittable {
            heading.tap()
            sleep(1.0)
            note("keyboard-dismissed-via=heading-tap")
            return
        }
        note("keyboard-dismissed=false")
    }

    private func firstHeadingLabel() -> String {
        app.staticTexts.allElementsBoundByIndex.first.map { $0.label } ?? "none"
    }

    private func statusLabel() -> String {
        let predicate = NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@ OR label CONTAINS %@",
                                    "Playing ", "Starting ", "did not begin")
        let match = app.staticTexts.matching(predicate).firstMatch
        return match.exists ? match.label : "none"
    }
}
