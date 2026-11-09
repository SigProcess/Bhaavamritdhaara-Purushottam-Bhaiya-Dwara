# Privacy Policy

**Bhaavamrit** — Bhaavamritdhaara, पुरुषोत्तम भाईया द्वारा

*Last updated: 9 November 2026*

> This is the repository copy of the policy published at
> <https://purushottambhaiya.netlify.app/privacy.html>. The two are kept in agreement; the page is
> generated from `public/privacy.html`. Update both together.
>
> **This version covers the iOS app as well as the Android app and the website.** Earlier revisions
> described only the Android Trusted Web Activity.

Bhaavamrit has no sign-up, no advertising, no payments, and no analytics, telemetry, or
crash-reporting software of any kind. We do not operate a server that receives information about
you, and we do not build a profile of you. What this policy will not do is pretend that nothing ever
leaves your device: when you play a discourse or a bhajan video, playback happens inside **YouTube's
own embedded player**, so Google receives that request. Section 5 says exactly who receives what,
and when.

## 1. What this policy covers

This single policy covers all three ways the project is published:

- **The Bhaavamrit iOS app** (bundle identifier `com.bhaavamrit.app`), published on the App Store.
  It is built with Capacitor: the interface is the same devotional library, rendered in a web view
  inside the app, with native iOS code for reading and sharing PDF documents.
- **The Bhaavamrit Android app**, published on Google Play. It is a Trusted Web Activity, which
  means Android opens the website in a full-screen Chrome-provided window belonging to the app.
- **The website** at <https://purushottambhaiya.netlify.app/>, which can also be installed as a
  progressive web app.

The project is non-commercial and devotional. It does not sell anything, does not monetise
attention, and has nothing to gain from collecting data about you.

## 2. What the app does not do

Each of the following is a statement about the published source code, not an aspiration:

- **No analytics, telemetry, crash reporting, or attribution software.** There is no Google
  Analytics, Google Tag Manager, Firebase, Crashlytics, Sentry, Mixpanel, Amplitude, PostHog,
  Plausible, Hotjar, Segment, Datadog, Bugsnag, or advertising-measurement library anywhere in the
  app. The entire runtime dependency list of the web app is React and Capacitor; the only native
  iOS dependency is Capacitor itself.
- **No tracking.** The iOS privacy manifest (`ios/App/App/PrivacyInfo.xcprivacy`) declares no
  tracking, no tracking domains, and no collected data types. The app does not ask for the
  advertising identifier and does not use the App Tracking Transparency prompt, because it has
  nothing to track you with.
- **No accounts, logins, or profiles.** There is no sign-in screen, no password, no social login,
  and no user record anywhere.
- **No payments, purchases, or subscriptions.** There is no in-app purchase, no payment form, and
  no billing of any kind. Everything in the app is free.
- **No advertising.** No ad network, no sponsored placement, no interstitial.
- **No developer-operated back end.** The native iOS code makes no network requests at all; it
  reads documents that are already inside the app. There is no server of ours that logs your use
  of the app.
- **No contact, photo, microphone, camera, location, or health access.** The iOS app declares no
  such permission, so iOS will never prompt you for one.

## 3. What is stored on your device, and stays there

The app is built to work offline. That requires storing things locally. None of it is transmitted
to us, because there is nowhere for it to be transmitted to.

**Devotional content bundled inside the app.** The iOS app ships with 135 bhajan PDFs, 3 books, and
the full content catalogue compiled into the installed app, roughly 37 MB. They are present from the
moment you install it and readable with no network connection whatsoever. Removing the app removes
them.

**Offline cache (website and installed web app).** On the website and the installable web app, a
service worker stores a copy of the pages, styles, scripts, and images so the site opens without a
connection. It also keeps a short-lived cache of video thumbnail images and of the web fonts the
page uses. This cache lives in your browser's storage for this site and is cleared when you clear
site data or uninstall the app.

**Content catalogue storage.** So that a content update can be validated before it is used, the app
can keep catalogue versions in a local database on the device (an IndexedDB database named
`bhaavamrit-catalog-store` in the browser; a folder inside the app's own storage on iOS). It holds
devotional catalogue metadata only — titles, identifiers, and file references. It holds nothing
about you. On iOS the app starts from the catalogue packaged inside it and is not configured to
request a remote one.

**Things that exist only while the app is open.** What you type into the Bhajan Finder, which screen
you are on, which video is selected, and whether the device is online are held in the app's memory
while you use it and are gone when the app closes. Search words are matched against the packaged
catalogue on your device; they are never sent anywhere.

**What the app does not store.** The app writes no cookies of its own, and uses neither
`localStorage` nor `sessionStorage`. On iOS it writes nothing to `UserDefaults` and nothing to the
keychain.

## 4. Device permissions

- **iOS:** none. The app declares no permission-usage descriptions at all, so iOS has nothing to
  ask you for.
- **Android:** notifications only (`POST_NOTIFICATIONS`), used to let you know about new bhajan or
  discourse playlists. You can refuse it, or turn it off later in Android settings, and the app
  keeps working.

## 5. Third parties that do receive something

This is the part that matters. We collect nothing, but the app is not sealed off from the internet,
and we are not going to imply otherwise. Each provider below is governed by its own privacy policy,
not by ours, and we have no access to and no control over what it keeps.

### YouTube and Google — video playback and thumbnails

Discourses and bhajan videos are **not hosted by us**. They play through YouTube's embedded player.
When you open a playlist or start a video, your device loads YouTube's player code and video stream
directly from Google, and video thumbnail images load from `img.youtube.com`. As a result Google
receives your IP address, information about your device and software, and the identifier of the
video or playlist concerned, and **may set cookies or similar identifiers** on your device,
depending on your device and Google account settings. If you are signed in to a Google account,
Google may associate that activity with your account. If you choose to open a video in the YouTube
app or website, you leave Bhaavamrit entirely and YouTube's own terms apply.

- Google Privacy Policy: <https://policies.google.com/privacy>
- YouTube Terms of Service: <https://www.youtube.com/t/terms>

### Google Fonts — typography

The website and the app's interface request their typefaces from `fonts.googleapis.com` and
`fonts.gstatic.com`, so Google receives a request from your device when those fonts are fetched.
Once cached, they are served locally. The published privacy policy page itself requests no fonts
from anywhere.

- Google Privacy Policy: <https://policies.google.com/privacy>

### Netlify — hosting

The website, the published policy page, and the content the Android app displays are hosted by
Netlify, which keeps ordinary web-server records such as IP address, requested URL, referrer, device
and browser details, and the date and time. We do not add any tracking on top of that, and we do not
use those records to identify or profile visitors. The iOS app's own content is read from inside the
installed app, so simply opening and reading in the iOS app does not involve Netlify.

- Netlify Privacy Statement: <https://www.netlify.com/privacy/>

### Apple and Google Play — distribution

Installing and updating the app happens through the App Store or Google Play, and those stores
record that activity under their own policies. We receive only the aggregate, anonymous statistics
those stores choose to show developers; we cannot identify an individual user from them.

- Apple Privacy Policy: <https://www.apple.com/legal/privacy/>
- Google Privacy Policy: <https://policies.google.com/privacy>

## 6. Reading and sharing documents

On iOS, opening a bhajan or a book opens Apple's own PDF reader inside the app, reading a file that
is already installed on your device. Nothing is downloaded and nothing is uploaded. The app can only
open documents that are listed in its own catalogue and stored in its own folders; it cannot reach
your files.

If you tap **Export**, iOS presents the standard share sheet and you choose where the PDF goes —
Messages, Mail, Files, another app, a printer. That only happens when you ask for it, the file is
the local devotional PDF, and whatever you pick is governed by that destination's own privacy
practices. No copy is sent to us.

## 7. Children

The app is devotional content suitable for all ages and is not directed at children in particular.
We knowingly collect no personal information from anyone, children included, because we collect none
at all. Note that videos play through YouTube's embedded player, so a parent who wants to limit what
Google receives should apply the relevant Google account and device controls.

## 8. Your data, and your choices

Because we hold no personal data about you, there is nothing for us to export, correct, or delete at
your request — and no record we could use to recognise you if you asked. Your practical controls are
these:

- **Remove everything the app stored:** uninstall the app, or clear this site's data in your
  browser.
- **Avoid YouTube and Google entirely:** read the bhajans and books, which work fully offline, and
  do not open a video.
- **Control what Google retains:** use your Google account controls
  (<https://myaccount.google.com/>) and your browser's or device's cookie settings.
- **Turn off Android notifications:** in Android settings, at any time.

## 9. Changes to this policy

If the app changes in a way that affects this policy, the policy is updated and the "Last updated"
date at the top changes with it. The published page at
<https://purushottambhaiya.netlify.app/privacy.html> and this file are kept in agreement.

## 10. Contact

Questions about privacy, or about this policy:

- **Email:** tanushreesharma1@gmail.com

This is a volunteer-run devotional project, so please allow some time for a reply.

---

*A non-commercial devotional project. It does not monetise, sell, or share user data.*
