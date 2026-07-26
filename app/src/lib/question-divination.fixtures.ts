import type { QuestionEvent } from './question-divination'

export const QUESTION_GOLDEN_EVENT = {
  version: 'question-event.v1',
  question: 'Should the anonymous project proceed to its next review stage?',
  capturedAt: '2026-07-26T12:00:00.000Z',
  timezone: 'Asia/Shanghai',
  location: {
    label: 'Anonymous test location',
    timezone: 'Asia/Shanghai',
    source: 'user-entered',
    capturedAt: '2026-07-26T12:00:00.000Z',
  },
} as const satisfies QuestionEvent
