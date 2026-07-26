/** Versioned, presentation-safe Qizheng facts. No interpretive or LLM text belongs here. */
export const QIZHENG_FACT_VERSION = 'qizheng.fact.v1' as const

export interface QizhengEvidence {
  resolvedLocalTime: string
  latitude: number
  longitude: number
  timezoneOffsetHours: number
  locationLabel: string
}

export interface QizhengStarFact {
  name: string
  kind: '七政' | '四余'
  longitude: number
  mansion: string
  mansionDegree: number
  palace: string
  retrograde: boolean
  dignity: string
  sourceId: string
  sourceLabel: string
  precisionClass: string
}

export interface QizhengAspectFact {
  star1: string
  star2: string
  type: string
  actualAngle: number
  orb: number
  closeness: string
  precisionClass: string
}

export interface QizhengPalaceFact { palace: string; signIndex: number }

export interface QizhengFactsV1 {
  version: typeof QIZHENG_FACT_VERSION
  evidence: QizhengEvidence
  stars: QizhengStarFact[]
  aspects: QizhengAspectFact[]
  lifePalace: number
  bodyPalace: number
  lifeMaster: string
  palaces: QizhengPalaceFact[]
}

export type QizhengFailureCode =
  | 'missing_resolved_evidence'
  | 'unreliable_birth_time'
  | 'provider_unavailable'
  | 'provider_rejected'
  | 'invalid_provider_contract'

export interface QizhengProviderMetadata {
  provider: 'aov.cc' | 'cinnabar-local'
  providerVersion: string | null
  adapterVersion: 'qizheng-aov.v1' | 'qizheng-local.v1'
  source: 'local' | 'fixture'
}

export type QizhengResult =
  | { ok: true; facts: QizhengFactsV1; metadata: QizhengProviderMetadata }
  | { ok: false; failure: { code: QizhengFailureCode; message: string }; metadata: QizhengProviderMetadata }
