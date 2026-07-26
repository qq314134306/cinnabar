// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { QuestionDivination } from './QuestionDivination'

afterEach(cleanup)

describe('QuestionDivination', () => {
  it('captures one event but keeps all three unavailable engines failed closed', () => {
    render(createElement(QuestionDivination))
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Should this proceed?' } })
    fireEvent.change(screen.getByLabelText('Capture time'), { target: { value: '2026-07-26T20:00' } })
    fireEvent.change(screen.getByLabelText('IANA timezone'), { target: { value: 'Asia/Shanghai' } })
    fireEvent.change(screen.getByLabelText('Location evidence'), { target: { value: 'Anonymous fixture' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cast three charts' }))
    expect(screen.getByRole('heading', { name: 'Liu Yao' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Qi Men Dun Jia' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Da Liu Ren' })).toBeTruthy()
    expect(screen.getByText(/no substitute chart was generated and no external service was called/i)).toBeTruthy()
    expect(screen.getAllByText(/verified local engine is not available yet/i)).toHaveLength(3)
    expect(screen.getByText(/entertainment & self-discovery only/i)).toBeTruthy()
  })
})
