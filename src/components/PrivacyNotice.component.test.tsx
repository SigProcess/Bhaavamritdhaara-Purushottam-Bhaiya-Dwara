import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { privacyInventory } from '../domain/privacy/privacyInventory'
import PrivacyNotice from './PrivacyNotice'

describe('PrivacyNotice', () => {
  it('renders every maintained processing entry and distinguishes control', () => {
    render(<PrivacyNotice ref={createRef<HTMLHeadingElement>()} onClose={() => {}} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Notice' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Processing by Bhaavamrit' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Third-party processing' })).toBeInTheDocument()

    for (const activity of privacyInventory.activities) {
      const section = screen.getByRole('heading', { name: activity.dataCategory }).closest('section')!
      expect(within(section).getByText(activity.purpose)).toBeInTheDocument()
      expect(within(section).getByText(activity.recipients)).toBeInTheDocument()
      expect(within(section).getByText(activity.retentionRule)).toBeInTheDocument()
      expect(within(section).getByText(activity.condition)).toBeInTheDocument()
    }

    expect(screen.getAllByText('Service: YouTube / Google').length).toBeGreaterThan(0)
    expect(screen.getByText('Service: Netlify')).toBeInTheDocument()
  })

  it('links official provider sources and exposes one named close action', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<PrivacyNotice ref={createRef<HTMLHeadingElement>()} onClose={onClose} />)

    for (const citation of privacyInventory.citations) {
      expect(screen.getAllByRole('link', { name: `${citation.title} (${citation.publisher})` })[0])
        .toHaveAttribute('href', citation.url)
    }

    await user.click(screen.getByRole('button', { name: 'Close Privacy Notice and return to Home' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
