export type PrivacyControl = 'app-controlled' | 'third-party'

export interface PrivacyService {
  readonly id: string
  readonly name: string
  readonly control: PrivacyControl
  readonly description: string
}

export interface PrivacyCitation {
  readonly id: string
  readonly title: string
  readonly publisher: string
  readonly url: string
  /** Maintainer-facing paraphrase of the source material used by this inventory. */
  readonly summary: string
}

export interface PrivacyProcessingActivity {
  readonly id: string
  readonly serviceId: string
  readonly dataCategory: string
  readonly purpose: string
  readonly recipients: string
  readonly retentionRule: string
  readonly condition: string
  readonly citationIds: readonly string[]
  /** Repository paths maintainers should review when implementation behavior changes. */
  readonly implementationEvidence: readonly string[]
}

export interface PrivacyInventory {
  readonly schemaVersion: 1
  readonly lastReviewed: string
  readonly services: readonly PrivacyService[]
  readonly citations: readonly PrivacyCitation[]
  readonly activities: readonly PrivacyProcessingActivity[]
}

/**
 * Maintained source of truth for the in-app Privacy Notice.
 *
 * Third-party descriptions are deliberately paraphrased. Provider policies control
 * their processing and must be reviewed again before a release when integrations change.
 */
export const privacyInventory = {
  schemaVersion: 1,
  lastReviewed: '2026-10-31',
  services: [
    {
      id: 'bhaavamrit-app',
      name: 'Bhaavamrit app',
      control: 'app-controlled',
      description: 'Processing performed locally by Bhaavamrit on the user’s device.',
    },
    {
      id: 'youtube-google',
      name: 'YouTube / Google',
      control: 'third-party',
      description: 'Google-provided thumbnails, embedded video playback, and YouTube links.',
    },
    {
      id: 'netlify',
      name: 'Netlify',
      control: 'third-party',
      description: 'Hosting for the web and Android versions and for any configured remote catalog request.',
    },
  ],
  citations: [
    {
      id: 'google-privacy',
      title: 'Google Privacy Policy',
      publisher: 'Google',
      url: 'https://policies.google.com/privacy',
      summary: 'Google describes information collected from devices, browsers, service activity, and embedded services, along with purpose-based retention and user controls.',
    },
    {
      id: 'youtube-terms',
      title: 'YouTube Terms of Service',
      publisher: 'YouTube / Google',
      url: 'https://www.youtube.com/t/terms',
      summary: 'YouTube identifies Google LLC as the service provider and sets the terms that apply when people use YouTube playback services.',
    },
    {
      id: 'netlify-privacy',
      title: 'Netlify Privacy Statement',
      publisher: 'Netlify',
      url: 'https://www.netlify.com/privacy/',
      summary: 'Netlify describes automatically collected device and request information, its service providers and affiliates, and purpose- and law-based retention criteria.',
    },
  ],
  activities: [
    {
      id: 'local-search-input',
      serviceId: 'bhaavamrit-app',
      dataCategory: 'Bhajan search words',
      purpose: 'Filter the packaged bhajan catalog by Hindi or English title on the device.',
      recipients: 'Bhaavamrit on this device only; the app does not send search words to the developer.',
      retentionRule: 'Kept in memory while the Bhajan Finder is in use; removed when it is cleared, reset, or the app process ends.',
      condition: 'Processed only when a user enters a Bhajan Finder query.',
      citationIds: [],
      implementationEvidence: [
        'src/components/BhajansPage.jsx',
        'src/domain/bhajans/bhajanSearch.ts',
      ],
    },
    {
      id: 'local-interface-state',
      serviceId: 'bhaavamrit-app',
      dataCategory: 'Navigation, selected content, playback position, and network state',
      purpose: 'Operate the interface and restore the current screen after an in-app or native presentation.',
      recipients: 'Bhaavamrit on this device only.',
      retentionRule: 'Kept in app memory for the active process and discarded after a terminated-state launch.',
      condition: 'Processed as the user navigates, selects content, or plays media.',
      citationIds: [],
      implementationEvidence: [
        'src/domain/contracts/runtime.ts',
        'src/domain/navigation/navigationCoordinator.ts',
        'src/domain/player/playerReducer.ts',
      ],
    },
    {
      id: 'local-operation-state',
      serviceId: 'bhaavamrit-app',
      dataCategory: 'Catalog item IDs, document session IDs, request status, and coarse error codes',
      purpose: 'Open or export the selected PDF and retry only the operation that failed.',
      recipients: 'Bhaavamrit and its native document service on this device only.',
      retentionRule: 'Kept for the active request or document presentation and discarded when cleared or when the app process ends.',
      condition: 'Processed when a document, catalog update, or network-dependent operation runs.',
      citationIds: [],
      implementationEvidence: [
        'src/domain/contracts/runtime.ts',
        'src/platform/documentPresentationCoordinator.ts',
      ],
    },
    {
      id: 'local-catalog-storage',
      serviceId: 'bhaavamrit-app',
      dataCategory: 'Devotional catalog metadata and locally available content assets',
      purpose: 'Show catalog information and documents offline and activate validated catalog updates atomically.',
      recipients: 'Bhaavamrit storage on this device only.',
      retentionRule: 'Packaged content remains for the installed release. Stored catalog versions remain until replaced or pruned, or until the user removes the app or clears site/app data.',
      condition: 'Packaged content is available at install; remote versions are stored only if catalog updates are configured and validated.',
      citationIds: [],
      implementationEvidence: [
        'src/platform/catalog/browserCatalogStore.ts',
        'src/platform/catalog/catalogRepository.ts',
      ],
    },
    {
      id: 'youtube-request-data',
      serviceId: 'youtube-google',
      dataCategory: 'IP address, device/browser details, request details, and identifiers',
      purpose: 'Deliver YouTube thumbnails and player resources, operate and secure the service, and measure service performance.',
      recipients: 'Google LLC, its affiliates, and service providers described in Google’s policy.',
      retentionRule: 'Google determines retention according to the type and purpose of the data, account settings and user controls, and legal or security needs.',
      condition: 'Google may receive a request when a YouTube thumbnail or player resource loads, or when a YouTube link is opened.',
      citationIds: ['google-privacy', 'youtube-terms'],
      implementationEvidence: [
        'src/data/catalogSources.ts',
        'src/platform/youtubeIframeExternalMediaService.ts',
      ],
    },
    {
      id: 'youtube-media-activity',
      serviceId: 'youtube-google',
      dataCategory: 'Video or playlist identifiers and YouTube viewing interactions',
      purpose: 'Provide embedded playback, remember provider-side preferences where applicable, and operate, secure, and improve YouTube.',
      recipients: 'Google LLC, its affiliates, and service providers described in Google’s policy.',
      retentionRule: 'Google controls retention under its policy and the user’s Google account, history, and deletion settings; some records may be retained for legal, security, or service-continuity reasons.',
      condition: 'Processed when the YouTube player is prepared or used, or YouTube is opened externally. Google may use cookies, local storage, or similar identifiers depending on user and device settings.',
      citationIds: ['google-privacy', 'youtube-terms'],
      implementationEvidence: ['src/platform/youtubeIframeExternalMediaService.ts'],
    },
    {
      id: 'netlify-request-data',
      serviceId: 'netlify',
      dataCategory: 'IP address, device/browser details, requested URL, referrer, and request date/time',
      purpose: 'Host and deliver the web/Android experience or a configured remote catalog, and maintain reliability, security, and abuse prevention.',
      recipients: 'Netlify, its affiliates, contracted service providers, professional advisers, and public authorities when legally required, as described in Netlify’s policy.',
      retentionRule: 'Netlify sets retention from the original purpose, data amount and sensitivity, risk, available alternatives, and legal obligations, then deletes or restricts further use when deletion is not technically possible.',
      condition: 'Applies to web and Android visits hosted by Netlify and to iOS only if a remote catalog URL hosted by Netlify is configured; packaged iOS startup uses local assets.',
      citationIds: ['netlify-privacy'],
      implementationEvidence: [
        'netlify.toml',
        'capacitor.config.ts',
        'src/platform/catalog/catalogRepository.ts',
      ],
    },
  ],
} as const satisfies PrivacyInventory
