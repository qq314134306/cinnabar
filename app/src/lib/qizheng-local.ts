import type { BirthInfo } from './astro'
import { qizhengPreflight } from './qizheng-adapter'
import type { QizhengResult } from './qizheng-contract'

/**
 * Production boundary for a future bundled ephemeris implementation.
 * It deliberately returns unavailable until local astronomy and Zi Qi parity
 * are independently proven against anonymous fixtures.
 */
export function calculateLocalQizheng(birth: BirthInfo): QizhengResult {
  const preflight = qizhengPreflight(birth)
  if ('ok' in preflight) {
    return {
      ...preflight,
      metadata: { provider: 'cinnabar-local', providerVersion: 'foundation.v1', adapterVersion: 'qizheng-local.v1', source: 'local' },
    }
  }
  return {
    ok: false,
    failure: { code: 'provider_unavailable', message: 'Local Qizheng calculation is not yet available. No external service or substitute chart was used.' },
    metadata: { provider: 'cinnabar-local', providerVersion: 'foundation.v1', adapterVersion: 'qizheng-local.v1', source: 'local' },
  }
}
