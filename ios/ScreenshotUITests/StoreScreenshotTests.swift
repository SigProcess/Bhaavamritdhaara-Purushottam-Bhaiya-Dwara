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
        forceDismissKeyboard()
        scrollToTop()
        note("home-ready=\(app.links["Bhajan Finder"].exists) keyboards=\(app.keyboards.count)")
    }

    /// The software keyboard is the single most destructive piece of state in this run: left up,
    /// it covers the lower half of every capture AND its floating accessory bar overlaps page
    /// content, and anchor taps underneath it stop scrolling the page. Run 42670951760 shipped
    /// a "collections grid" that was really the hero with a keyboard over it for exactly this
    /// reason. So dismiss aggressively and verify, rather than trusting one keystroke.
    @discardableResult
    private func forceDismissKeyboard() -> Bool {
        for attempt in 1...4 {
            guard app.keyboards.count > 0 else {
                if attempt > 1 { note("keyboard-gone-after-attempt=\(attempt - 1)") }
                return true
            }
            for key in ["return", "Return", "search", "Search", "go", "Go", "done", "Done"] {
                let button = app.keyboards.buttons[key]
                if button.exists, button.isHittable { button.tap(); break }
            }
            sleep(0.9)
            if app.keyboards.count == 0 { note("keyboard-dismissed-via=key attempt=\(attempt)"); return true }

            // Blur by tapping inert chrome well above the keyboard frame.
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.08)).tap()
            sleep(0.9)
        }
        let gone = app.keyboards.count == 0
        note("keyboard-dismissed=\(gone) (after 4 attempts)")
        return gone
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
            if !forceDismissKeyboard() {
                // Rather than ship a capture with half the screen under a keyboard, drop the
                // query and show the idle finder, which is still a perfectly good store shot.
                note("WARNING 02: keyboard would not dismiss; clearing query for a clean capture")
                if tapFirstButton(labelContains: "Clear", excluding: []) { sleep(1.0) }
                forceDismissKeyboard()
            }
        } else {
            note("query-typed=false (search field unavailable); capturing idle finder")
        }
        sleep(settle)
        note("pre-capture-keyboards=\(app.keyboards.count)")
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
        // Prove we actually left the hero before spending a capture on it. Run 42670951760
        // captured the hero and labelled it "collections grid"; a size-correct PNG of the
        // wrong screen is worse than a recorded skip, because it looks like a success.
        let cards = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "playlists"))
        let onGrid = cards.firstMatch.waitForExistence(timeout: shortTimeout)
        note("collections-grid-reached=\(onGrid) cards=\(cards.count) keyboards=\(app.keyboards.count)")
        guard onGrid else {
            note("SKIPPED 03: never reached the collections grid")
            attach(name: "03-failure-hierarchy.txt", uti: "public.plain-text", payload: Data(app.debugDescription.utf8))
            return
        }
        capture("03-collections-grid")
    }

    // MARK: - 04 playlist with video list, 05 video playing

    private func captureVideoScreens() {
        note("step=04-playlist")
        // Deliberately NO prepareHome() here. Step 03 leaves the collections grid on screen,
        // which is exactly where the collection cards are reachable — the log from run
        // 42666271988 showed every "Open … N playlists" button stuck [offscreen] precisely
        // because resetting to the top scrolled away from the grid we had just captured.
        // Continue from that state, and only fall back to re-navigating if it has been lost.
        if !app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "playlists")).firstMatch.isHittable {
            note("collections grid not in view; re-navigating via anchor")
            prepareHome()
            _ = tapLink(["Pravachans", "Lekh", "Vani Vishleshan"])
            sleep(settle + 0.8)
        }

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

        // Status text goes "Starting {title}…" and then either "Playing {title}." once the
        // embed starts, or "Tap play in the player to start {title}." where the embed cannot
        // report its own state — which is the case in this app, because the web view is served
        // from `capacitor://localhost` and the embed has to declare an origin instead, leaving
        // YouTube no channel back to the page. Both are usable captures: the player stays on
        // screen with YouTube's own play button either way. Record whichever we land on; do not
        // pretend it played.
        let ready = app.staticTexts.containing(
            NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@", "Playing ", "Tap play ")
        ).firstMatch
        let started = ready.waitForExistence(timeout: longTimeout)
        note("playback-status-reached=\(started) status=\(statusLabel())")
        if !started {
            note("WARNING 05: embedded player reported neither playback nor a play prompt; capturing actual state")
        }
        sleep(4.0) // let the YouTube iframe paint its poster frame

        provePlayback(belowPlayButton: play)
        capture("05-video-player")
    }

    // MARK: - Proving playback, not just a mounted player

    /// Taps YouTube's own play button and then measures whether the player surface is actually
    /// moving.
    ///
    /// The status text cannot answer this question. On this origin the embed declares an origin
    /// that is not the page's, so YouTube's postMessage replies never reach the page and the app
    /// stays on "Tap play in the player to start …" even when the video is playing perfectly.
    /// The iframe's internals are not in the accessibility tree either, so there is no element
    /// to query. What is left is the pixels: a poster frame with a play button is static, and a
    /// playing video is not. Sample the surface twice, several seconds apart and after YouTube's
    /// controls have auto-hidden, and report how much of it changed.
    private func provePlayback(belowPlayButton play: XCUIElement) {
        guard let surface = playerSurfaceRect(below: play) else {
            note("player-surface=unknown; skipping the in-player tap and the motion check")
            return
        }
        note("player-surface=\(describe(surface)) window=\(describe(app.windows.firstMatch.frame))")

        let before = sampleSurface(surface)
        attachSurface(surface, name: "video-pre-tap.png")

        // A coordinate tap is the only way in: the play button lives inside a cross-origin
        // iframe, which WebKit does not expose to the accessibility layer at all. The centre of
        // the surface is where YouTube paints its large play button.
        let target = app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
            .withOffset(CGVector(dx: surface.midX, dy: surface.midY))
        target.tap()
        note("player-tap=(\(Int(surface.midX)),\(Int(surface.midY))) status=\(statusLabel())")

        // Long enough for the tap to register, the stream to start, and YouTube's control
        // overlay to fade out again, so the overlay itself cannot be mistaken for motion.
        sleep(8.0)
        let settled = sampleSurface(surface)
        sleep(3.5)
        let later = sampleSurface(surface)
        attachSurface(surface, name: "video-post-tap.png")

        let tapEffect = changeFraction(before, settled)
        let motion = changeFraction(settled, later)
        note("surface-change-after-tap=\(format(tapEffect)) surface-motion=\(format(motion))")
        // A playing video repaints most of the frame in 3.5s. A poster, an error card, or a
        // stalled player repaints almost none of it.
        let showing = motion >= 0.05
        note("video-frame-showing=\(showing) (threshold=0.05) status=\(statusLabel())")
        if !showing {
            note("WARNING 05: the player surface is not moving, so the capture is a poster or an error, not playback")
        }
    }

    /// The player surface fills the gap between the playlist heading and the controls row, so
    /// its rectangle can be derived from two things that *are* in the accessibility tree rather
    /// than guessed from a fixed aspect ratio against an unknown page padding. The heading is
    /// found by geometry, not by label, because the label is a catalogue title in Devanagari
    /// that this test has no business hard-coding.
    private func playerSurfaceRect(below play: XCUIElement) -> CGRect? {
        let window = app.windows.firstMatch.frame
        guard play.exists, window.width > 0 else { return nil }
        let bottom = play.frame.minY
        let headingBottoms = app.staticTexts.allElementsBoundByIndex
            .prefix(40)
            .map { $0.frame }
            .filter { $0.maxY < bottom - 40 && $0.height > 0 }
            .map { $0.maxY }
        let top = headingBottoms.max() ?? (window.minY + window.height * 0.12)
        guard bottom - top > 60 else { return nil }
        let rect = CGRect(x: window.minX, y: top, width: window.width, height: bottom - top)
            .insetBy(dx: window.width * 0.1, dy: 8)
        // WebKit reports page coordinates, so a scrolled page would hand back a rectangle that
        // is not on screen at all. Refuse it rather than tap into nothing and call the silence
        // a result.
        guard window.contains(rect) else {
            note("player-surface rejected: \(describe(rect)) is outside the window \(describe(window))")
            return nil
        }
        return rect
    }

    /// Downsamples the surface to a small grid. Averaging away the detail is what makes the
    /// comparison robust: encoder noise and one-pixel jitter disappear, while a genuinely
    /// different video frame still changes most cells.
    private func sampleSurface(_ rect: CGRect) -> [UInt8] {
        guard let image = XCUIScreen.main.screenshot().image.cgImage else { return [] }
        let scale = CGFloat(image.width) / max(app.windows.firstMatch.frame.width, 1)
        let pixels = CGRect(
            x: rect.minX * scale, y: rect.minY * scale,
            width: rect.width * scale, height: rect.height * scale
        ).integral
        guard pixels.width >= 8, pixels.height >= 8,
              let cropped = image.cropping(to: pixels),
              let space = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(
                  data: nil, width: 64, height: 36,
                  bitsPerComponent: 8, bytesPerRow: 64 * 4, space: space,
                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
              )
        else { return [] }
        context.interpolationQuality = .medium
        context.draw(cropped, in: CGRect(x: 0, y: 0, width: 64, height: 36))
        guard let data = context.data else { return [] }
        let buffer = data.bindMemory(to: UInt8.self, capacity: 64 * 36 * 4)
        return Array(UnsafeBufferPointer(start: buffer, count: 64 * 36 * 4))
    }

    /// Fraction of sampled cells whose colour moved perceptibly.
    private func changeFraction(_ first: [UInt8], _ second: [UInt8]) -> Double {
        let count = min(first.count, second.count)
        guard count >= 4 else { return 0 }
        var changed = 0
        var total = 0
        for index in stride(from: 0, to: count - 3, by: 4) {
            total += 1
            let delta = abs(Int(first[index]) - Int(second[index]))
                + abs(Int(first[index + 1]) - Int(second[index + 1]))
                + abs(Int(first[index + 2]) - Int(second[index + 2]))
            if delta > 24 { changed += 1 }
        }
        return total == 0 ? 0 : Double(changed) / Double(total)
    }

    /// A crop of just the player, so the artifact shows what the motion check was looking at.
    private func attachSurface(_ rect: CGRect, name: String) {
        let shot = XCUIScreen.main.screenshot()
        guard let image = shot.image.cgImage else { return }
        let scale = CGFloat(image.width) / max(app.windows.firstMatch.frame.width, 1)
        let pixels = CGRect(
            x: rect.minX * scale, y: rect.minY * scale,
            width: rect.width * scale, height: rect.height * scale
        ).integral
        guard let cropped = image.cropping(to: pixels) else { return }
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, "public.png" as CFString, 1, nil)
        else { return }
        CGImageDestinationAddImage(destination, cropped, nil)
        guard CGImageDestinationFinalize(destination) else { return }
        attach(name: name, uti: "public.png", payload: data as Data)
        write(name: name, data: data as Data)
        note("attached \(name) pixels=\(cropped.width)x\(cropped.height)")
    }

    private func describe(_ rect: CGRect) -> String {
        "\(Int(rect.minX)),\(Int(rect.minY)) \(Int(rect.width))x\(Int(rect.height))"
    }

    private func format(_ value: Double) -> String {
        String(format: "%.3f", value)
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
        let predicate = NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@ OR label BEGINSWITH %@ OR label CONTAINS %@",
                                    "Playing ", "Starting ", "Tap play ", "did not begin")
        let match = app.staticTexts.matching(predicate).firstMatch
        return match.exists ? match.label : "none"
    }
}
