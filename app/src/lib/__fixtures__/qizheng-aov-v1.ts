/** Exact presentation fields captured from the fixed anonymous 1990-01-01 12:00 Beijing AOV call. */
export const QIZHENG_AOV_V1_FIXTURE = {
  ok: true,
  data: {
    stars: [
      { name: '太阳', kind: '七政', longitude: 280.61225950655785, xiu: '井', xiuDegree: 31.178869747648434, palace: '官禄', retrograde: false, dignity: '平', sourceId: 'celestine-planets', sourceLabel: 'celestine.calculateChart', precisionClass: '现代天文计算' },
      { name: '太阴', kind: '七政', longitude: 328.9155418837938, xiu: '翼', xiuDegree: 3.3542947233622726, palace: '迁移', retrograde: false, dignity: '平', sourceId: 'celestine-planets', sourceLabel: 'celestine.calculateChart', precisionClass: '现代天文计算' },
      { name: '辰星(水)', kind: '七政', longitude: 295.870643039784, xiu: '柳', xiuDegree: 9.712751872446745, palace: '官禄', retrograde: true, dignity: '平', sourceId: 'celestine-planets', sourceLabel: 'celestine.calculateChart', precisionClass: '现代天文计算' },
      { name: '太白(金)', kind: '七政', longitude: 306.3953839873627, xiu: '星', xiuDegree: 5.427522864912305, palace: '迁移', retrograde: true, dignity: '平', sourceId: 'celestine-planets', sourceLabel: 'celestine.calculateChart', precisionClass: '现代天文计算' },
      { name: '荧惑(火)', kind: '七政', longitude: 249.905262763167, xiu: '参', xiuDegree: 8.917441118613056, palace: '福德', retrograde: false, dignity: '平', sourceId: 'celestine-planets', sourceLabel: 'celestine.calculateChart', precisionClass: '现代天文计算' },
      { name: '岁星(木)', kind: '七政', longitude: 95.31740763240413, xiu: '斗', xiuDegree: 21.538416381322534, palace: '田宅', retrograde: true, dignity: '乐', sourceId: 'celestine-planets', sourceLabel: 'celestine.calculateChart', precisionClass: '现代天文计算' },
      { name: '镇星(土)', kind: '七政', longitude: 285.7559573312294, xiu: '鬼', xiuDegree: 3.4154398941543604, palace: '官禄', retrograde: false, dignity: '平', sourceId: 'celestine-planets', sourceLabel: 'celestine.calculateChart', precisionClass: '现代天文计算' },
      { name: '罗睺(火余)', kind: '四余', longitude: 317.227977221429, xiu: '张', xiuDegree: 9.455704587927016, palace: '迁移', retrograde: false, dignity: '—', sourceId: 'celestine-true-node', sourceLabel: 'celestine.calculateChart includeNodes=true', precisionClass: '现代天文计算' },
      { name: '计都(土余)', kind: '四余', longitude: 137.227977221429, xiu: '危', xiuDegree: 8.205704587927016, palace: '兄弟', retrograde: false, dignity: '—', sourceId: 'celestine-true-node', sourceLabel: 'celestine.calculateChart includeNodes=true', precisionClass: '现代天文计算' },
      { name: '月孛(水余)', kind: '四余', longitude: 216.82922494128616, xiu: '昴', xiuDegree: 4.2441970582816, palace: '相貌', retrograde: false, dignity: '—', sourceId: 'celestine-true-lilith', sourceLabel: 'celestine.calculateChart includeLilith=true', precisionClass: '现代天文计算' },
      { name: '紫炁(木余)', kind: '四余', longitude: 160.09583408703793, xiu: '室', xiuDegree: 14.486453313609445, palace: '财帛', retrograde: false, dignity: '—', sourceId: 'qizhengsuan-ziqi', sourceLabel: '《七政算内篇》紫炁古法均速', precisionClass: '传统均速模型' },
    ],
    aspects: [
      { star1: '罗睺(火余)', star2: '计都(土余)', type: '对照', actualAngle: 180, orb: 0, closeness: '紧密', precisionClass: '同层现代天文' },
      { star1: '荧惑(火)', star2: '紫炁(木余)', type: '四正', actualAngle: 89.8094, orb: 0.1906, closeness: '紧密', precisionClass: '混合模型' },
    ],
    mingGong: 6,
    shenGong: 7,
    mingZhu: '日',
    twelvePalaces: ['命宫', '财帛', '兄弟', '田宅', '男女', '奴仆', '妻妾', '疾厄', '迁移', '官禄', '福德', '相貌'].map((palace, index) => ({ palace, signIndex: (6 - index + 12) % 12 })),
  },
  meta: {
    service: 'aov.cc',
    version: 'v1',
    validationLayers: {
      modernEphemeris: 'external cross-check',
      traditionalRules: 'same-source Mingyu regression parity',
    },
  },
} as const
