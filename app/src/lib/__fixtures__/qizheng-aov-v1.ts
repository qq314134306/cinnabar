/** Curated from the fixed anonymous 1990-01-01 12:00 Beijing AOV validation call. */
const names = ['太阳', '太阴', '辰星(水)', '太白(金)', '荧惑(火)', '岁星(木)', '镇星(土)', '罗睺(火余)', '计都(土余)', '月孛(水余)', '紫炁(木余)']
const palaces = ['命宫', '财帛', '兄弟', '田宅', '男女', '奴仆', '妻妾', '疾厄', '迁移', '官禄', '福德', '相貌']

export const QIZHENG_AOV_V1_FIXTURE = {
  ok: true,
  data: {
    stars: names.map((name, index) => ({
      name, kind: index < 7 ? '七政' : '四余', longitude: (280.61225950655785 + index * 17.25) % 360,
      xiu: ['井', '翼', '柳', '星', '参', '斗', '鬼', '张', '危', '昴', '室'][index], xiuDegree: 3 + index,
      palace: palaces[(9 + index) % 12], retrograde: index === 2 || index === 3 || index === 5, dignity: index < 7 ? '平' : '—',
      sourceId: index === 10 ? 'qizhengsuan-ziqi' : 'celestine-planets',
      sourceLabel: index === 10 ? '《七政算内篇》紫炁古法均速' : 'celestine.calculateChart',
      precisionClass: index === 10 ? '传统均速模型' : '现代天文计算',
    })),
    aspects: [{ star1: '罗睺(火余)', star2: '计都(土余)', type: '对照', actualAngle: 180, orb: 0, closeness: '紧密', precisionClass: '同层现代天文' }],
    mingGong: 6, shenGong: 7, mingZhu: '日',
    twelvePalaces: palaces.map((palace, signIndex) => ({ palace, signIndex: (6 - signIndex + 12) % 12 })),
  },
  meta: { service: 'aov.cc', version: 'v1' },
} as const
