import { forwardRef, type Ref } from 'react'
import {
  privacyInventory,
  type PrivacyControl,
  type PrivacyProcessingActivity,
} from '../domain/privacy/privacyInventory'

interface PrivacyNoticeProps {
  readonly onClose: () => void
}

const activitiesFor = (control: PrivacyControl): readonly PrivacyProcessingActivity[] => {
  const serviceIds = new Set(
    privacyInventory.services
      .filter((service) => service.control === control)
      .map((service) => service.id),
  )
  return privacyInventory.activities.filter((activity) => serviceIds.has(activity.serviceId))
}

const serviceName = (serviceId: string): string =>
  privacyInventory.services.find((service) => service.id === serviceId)?.name ?? serviceId

const citationsFor = (activity: PrivacyProcessingActivity) =>
  activity.citationIds.map((citationId) => {
    const citation = privacyInventory.citations.find(({ id }) => id === citationId)
    if (!citation) throw new Error(`Unknown privacy citation: ${citationId}`)
    return citation
  })

function Activity({ activity }: { readonly activity: PrivacyProcessingActivity }) {
  const citations = citationsFor(activity)
  return (
    <section className="privacy-activity" aria-labelledby={`privacy-${activity.id}`}>
      <h3 id={`privacy-${activity.id}`}>{activity.dataCategory}</h3>
      <p className="privacy-service-name">Service: {serviceName(activity.serviceId)}</p>
      <dl>
        <div><dt>Purpose</dt><dd>{activity.purpose}</dd></div>
        <div><dt>Recipients</dt><dd>{activity.recipients}</dd></div>
        <div><dt>Retention</dt><dd>{activity.retentionRule}</dd></div>
        <div><dt>When this applies</dt><dd>{activity.condition}</dd></div>
      </dl>
      {citations.length > 0 && (
        <div className="privacy-sources">
          <h4>Official sources</h4>
          <ul>
            {citations.map((citation) => (
              <li key={citation.id}>
                <a href={citation.url} target="_blank" rel="noreferrer">
                  {citation.title} ({citation.publisher})
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

const PrivacyNotice = forwardRef(function PrivacyNotice(
  { onClose }: PrivacyNoticeProps,
  headingRef: Ref<HTMLHeadingElement>,
) {
  const appActivities = activitiesFor('app-controlled')
  const thirdPartyActivities = activitiesFor('third-party')

  return (
    <article className="privacy-notice" aria-labelledby="privacy-notice-title">
      <button
        className="privacy-close-button"
        type="button"
        onClick={onClose}
        aria-label="Close Privacy Notice and return to Home"
      >
        Back to Home
      </button>
      <header className="privacy-header">
        <p className="privacy-eyebrow">Account-free · Ad-free · No developer analytics</p>
        <h1 id="privacy-notice-title" ref={headingRef} tabIndex={-1}>Privacy Notice</h1>
        <p>
          Bhaavamrit does not require an account and does not include paid advertising or
          analytics controlled by the developer. The app still processes limited information
          on your device, and online media or hosted content can involve the providers below.
        </p>
        <p>Inventory last reviewed: {privacyInventory.lastReviewed}</p>
      </header>

      <section className="privacy-section" aria-labelledby="app-processing-title">
        <h2 id="app-processing-title">Processing by Bhaavamrit</h2>
        <p>These activities are controlled by the app and stay on the device.</p>
        {appActivities.map((activity) => <Activity key={activity.id} activity={activity} />)}
      </section>

      <section className="privacy-section" aria-labelledby="third-party-processing-title">
        <h2 id="third-party-processing-title">Third-party processing</h2>
        <p>
          Provider practices and retention are controlled by the named provider. The summaries
          below paraphrase the linked official policies; those policies govern their services.
        </p>
        {thirdPartyActivities.map((activity) => <Activity key={activity.id} activity={activity} />)}
      </section>
    </article>
  )
})

export default PrivacyNotice
