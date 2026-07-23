// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  GitHubLinkButton,
  OpenSourceFooterLinks,
} from '@/components/OpenSourceLinks'

const CANONICAL_REPOSITORY = 'https://github.com/qq314134306/cinnabar'

describe('OpenSourceLinks', () => {
  afterEach(() => {
    cleanup()
  })

  it('points the header link at the canonical repository', () => {
    render(createElement(GitHubLinkButton))

    expect(
      screen.getByRole('link', { name: 'Open GitHub repository' }),
    ).toHaveProperty('href', CANONICAL_REPOSITORY)
  })

  it('points the footer repository and license links at the canonical source', () => {
    render(createElement(OpenSourceFooterLinks))

    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveProperty(
      'href',
      CANONICAL_REPOSITORY,
    )
    expect(
      screen.getByRole('link', { name: 'GPLv3 License' }),
    ).toHaveProperty(
      'href',
      `${CANONICAL_REPOSITORY}/blob/main/LICENSE`,
    )
  })
})
