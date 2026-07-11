/**
 * [INPUT]: Chinese terms produced by the iztro chart engine (kept in zh-CN internally
 *   so palace/branch/star string comparisons elsewhere in the app never change).
 * [OUTPUT]: English display strings for the UI and the AI "chart facts" block, following
 *   the Cinnabar English Glossary & Voice Bible (14 major stars, 12 palaces, Four
 *   Transformations, brightness, stems/branches). Long-tail minor/adjective stars and the
 *   Boshi/Changsheng cycles are translated from iztro's own locale data, softened to avoid
 *   "doom/disaster" language per the brand voice guide.
 * [POS]: Presentation-layer translation used by ChartDisplay, ShareCard, and chart-facts.
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md.
 */

export interface StarGloss {
  pinyin: string
  archetype: string
}

/* ------------------------------------------------------------
   14 Major Stars — glossary section 7
   ------------------------------------------------------------ */

export const MAJOR_STAR_EN: Record<string, StarGloss> = {
  '紫微': { pinyin: 'Zi Wei', archetype: 'the Emperor' },
  '天机': { pinyin: 'Tian Ji', archetype: 'the Strategist' },
  '太阳': { pinyin: 'Tai Yang', archetype: 'the Sun' },
  '武曲': { pinyin: 'Wu Qu', archetype: 'the General of Wealth' },
  '天同': { pinyin: 'Tian Tong', archetype: 'the Child of Fortune' },
  '廉贞': { pinyin: 'Lian Zhen', archetype: 'the Firebrand' },
  '天府': { pinyin: 'Tian Fu', archetype: 'the Treasurer' },
  '太阴': { pinyin: 'Tai Yin', archetype: 'the Moon' },
  '贪狼': { pinyin: 'Tan Lang', archetype: 'the Desirer' },
  '巨门': { pinyin: 'Ju Men', archetype: 'the Great Gate' },
  '天相': { pinyin: 'Tian Xiang', archetype: 'the Minister' },
  '天梁': { pinyin: 'Tian Liang', archetype: 'the Elder' },
  '七杀': { pinyin: 'Qi Sha', archetype: 'the Warrior' },
  '破军': { pinyin: 'Po Jun', archetype: 'the Pioneer' },
}

/* ------------------------------------------------------------
   Six Lucky + Six Unlucky + Lu Cun/Tian Ma + notable symbolic stars
   ------------------------------------------------------------ */

export const MINOR_STAR_EN: Record<string, StarGloss> = {
  '左辅': { pinyin: 'Zuo Fu', archetype: 'the Left Assistant' },
  '右弼': { pinyin: 'You Bi', archetype: 'the Right Assistant' },
  '文昌': { pinyin: 'Wen Chang', archetype: 'the Scholar (Academic Star)' },
  '文曲': { pinyin: 'Wen Qu', archetype: 'the Artist' },
  '天魁': { pinyin: 'Tian Kui', archetype: 'Noble Benefactor (Day)' },
  '天钺': { pinyin: 'Tian Yue', archetype: 'Noble Benefactor (Night)' },
  '禄存': { pinyin: 'Lu Cun', archetype: 'Wealth Reserve' },
  '天马': { pinyin: 'Tian Ma', archetype: 'Traveling Horse' },
  '擎羊': { pinyin: 'Qing Yang', archetype: 'the Blade' },
  '陀罗': { pinyin: 'Tuo Luo', archetype: 'the Twist' },
  '火星': { pinyin: 'Huo Xing', archetype: 'the Fire Star' },
  '铃星': { pinyin: 'Ling Xing', archetype: 'the Bell Star' },
  '地空': { pinyin: 'Di Kong', archetype: 'Earth Void' },
  '地劫': { pinyin: 'Di Jie', archetype: 'Earth Interference' },
  '红鸾': { pinyin: 'Hong Luan', archetype: 'the Red Phoenix' },
  '天喜': { pinyin: 'Tian Xi', archetype: 'the Joyful Star' },
  '华盖': { pinyin: 'Hua Gai', archetype: 'the Canopy Star' },
}

/* ------------------------------------------------------------
   Long tail: adjective stars + Boshi12 gods + Changsheng12 cycle.
   Generated from iztro's zh-CN/en-US star dictionaries, softened per brand voice
   (tension/challenge instead of doom/disaster) and hand-touched for readability.
   ------------------------------------------------------------ */

export const ADJECTIVE_STAR_EN: Record<string, string> = {
  '劫杀': 'Ambush Star',
  '天空': 'Void Star',
  '天刑': 'Serious',
  '天姚': 'Social',
  '解神': 'Relief Star',
  '阴煞': 'Gloomy',
  '天官': 'Solemn',
  '天福': 'Lucky',
  '天哭': 'Melancholy',
  '天虚': 'Fatigue',
  '龙池': 'Talented',
  '凤阁': 'Refined',
  '孤辰': 'Solitude Star',
  '寡宿': 'Withdrawal Star',
  '蜚廉': 'Instigated',
  '破碎': 'Wear & Tear',
  '台辅': 'Honorable',
  '封诰': 'Awarded',
  '天巫': 'Psychic',
  '天月': 'Sickly',
  '三台': 'Senior',
  '八座': 'Dignified',
  '恩光': 'Grateful',
  '天贵': 'Noble',
  '天才': 'Gifted',
  '天寿': 'Ageless',
  '截空': 'Interrupted',
  '旬中': 'Meditative',
  '旬空': 'Fancied',
  '空亡': 'Bottomless',
  '截路': 'Intercepted',
  '月德': 'Peaceful',
  '天伤': 'Wounded',
  '天使': 'Emissary',
  '天厨': 'Gourmet',
  // Twelve Growth Stages (Changsheng12) — standard cycle-of-life terms
  '长生': 'Growth',
  '沐浴': 'Bath',
  '冠带': 'Cap',
  '临官': 'Office',
  '帝旺': 'Prime',
  '衰': 'Decline',
  '病': 'Illness',
  '死': 'Death',
  '墓': 'Grave',
  '绝': 'Extinction',
  '胎': 'Embryo',
  '养': 'Nurture',
  // Twelve Boshi Gods (Boshi12)
  '博士': 'Doctor',
  '力士': 'Strongman',
  '青龙': 'Green Dragon',
  '小耗': 'Minor Loss',
  '将军': 'General',
  '奏书': 'Scribe',
  '飞廉': 'Wind Star',
  '喜神': 'Joy Star',
  '病符': 'Low Vitality',
  '大耗': 'Major Loss',
  '岁破': 'Upheaval',
  '伏兵': 'Ambush',
  '官府': 'Magistrate',
  '岁建': 'Year Marker',
  '晦气': 'Friction',
  '丧门': 'Heavy Heart',
  '贯索': 'Entanglement',
  '官符': 'Officialdom',
  '龙德': 'Virtuous',
  '白虎': 'Sharp Edge',
  '天德': 'Blessed',
  '吊客': 'Wistfulness',
  '将星': 'Capable',
  '攀鞍': 'Advancement',
  '岁驿': 'Movement',
  '息神': 'Withdrawal',
  '劫煞': 'Setback',
  '灾煞': 'Turbulence',
  '天煞': 'Pressure',
  '指背': 'Undercurrent',
  '咸池': 'Passionate',
  '月煞': 'Setback (Monthly)',
  '亡神': 'Quiet Fade',
  // Transient decadal/annual/monthly/daily/hourly overlays of the six lucky stars +
  // Lu Cun/Tian Ma (only ever produced by chart.horoscope(), not the natal chart)
  '运魁': 'Assistant (Decadal)', '运钺': 'Aide (Decadal)', '运昌': 'Scholar (Decadal)',
  '运曲': 'Artist (Decadal)', '运鸾': 'Phoenix (Decadal)', '运喜': 'Joy (Decadal)',
  '运禄': 'Reserve (Decadal)', '运羊': 'Blade (Decadal)', '运陀': 'Twist (Decadal)',
  '运马': 'Horse (Decadal)',
  '流魁': 'Assistant (Yearly)', '流钺': 'Aide (Yearly)', '流昌': 'Scholar (Yearly)',
  '流曲': 'Artist (Yearly)', '流鸾': 'Phoenix (Yearly)', '流喜': 'Joy (Yearly)',
  '流禄': 'Reserve (Yearly)', '流羊': 'Blade (Yearly)', '流陀': 'Twist (Yearly)',
  '流马': 'Horse (Yearly)', '年解': 'Resolution (Yearly)',
  '月魁': 'Assistant (Monthly)', '月钺': 'Aide (Monthly)', '月昌': 'Scholar (Monthly)',
  '月曲': 'Artist (Monthly)', '月鸾': 'Phoenix (Monthly)', '月喜': 'Joy (Monthly)',
  '月禄': 'Reserve (Monthly)', '月羊': 'Blade (Monthly)', '月陀': 'Twist (Monthly)',
  '月马': 'Horse (Monthly)',
  '日魁': 'Assistant (Daily)', '日钺': 'Aide (Daily)', '日昌': 'Scholar (Daily)',
  '日曲': 'Artist (Daily)', '日鸾': 'Phoenix (Daily)', '日喜': 'Joy (Daily)',
  '日禄': 'Reserve (Daily)', '日羊': 'Blade (Daily)', '日陀': 'Twist (Daily)',
  '日马': 'Horse (Daily)',
  '时魁': 'Assistant (Hourly)', '时钺': 'Aide (Hourly)', '时昌': 'Scholar (Hourly)',
  '时曲': 'Artist (Hourly)', '时鸾': 'Phoenix (Hourly)', '时喜': 'Joy (Hourly)',
  '时禄': 'Reserve (Hourly)', '时羊': 'Blade (Hourly)', '时陀': 'Twist (Hourly)',
  '时马': 'Horse (Hourly)',
}

/**
 * Translate any star name (major, minor, or adjective) to a short English label,
 * suitable for a compact chart tag. Falls back to the pinyin-ish original if unknown.
 */
export function translateStarLabel(name: string): string {
  const stripped = name.replace(/星$/u, '')
  const gloss = MAJOR_STAR_EN[name] || MAJOR_STAR_EN[stripped] || MINOR_STAR_EN[name] || MINOR_STAR_EN[stripped]
  if (gloss) return gloss.pinyin
  return ADJECTIVE_STAR_EN[name] || ADJECTIVE_STAR_EN[stripped] || name
}

/** Full "pinyin — archetype" description for a major or minor star, for tooltips/chart facts. */
export function describeStarLabel(name: string): string {
  const stripped = name.replace(/星$/u, '')
  const gloss = MAJOR_STAR_EN[name] || MAJOR_STAR_EN[stripped] || MINOR_STAR_EN[name] || MINOR_STAR_EN[stripped]
  if (gloss) return `${gloss.pinyin} — ${gloss.archetype}`
  return translateStarLabel(name)
}

/* ------------------------------------------------------------
   Twelve Palaces — glossary section 8
   ------------------------------------------------------------ */

export const PALACE_EN: Record<string, string> = {
  '命宫': 'Life Palace',
  '身宫': 'Body Palace',
  '兄弟': 'Siblings Palace',
  '夫妻': 'Spouse Palace',
  '子女': 'Children Palace',
  '财帛': 'Wealth Palace',
  '疾厄': 'Health Palace',
  '迁移': 'Travel Palace',
  '仆役': 'Friends Palace',
  '交友': 'Friends Palace',
  '官禄': 'Career Palace',
  '田宅': 'Property Palace',
  '福德': 'Fortune Palace',
  '父母': 'Parents Palace',
  '来因': 'Origin Palace',
}

export function translatePalaceName(name: string): string {
  return PALACE_EN[name] || name
}

/** Pinyin short codes for palace names, used in the AI "chart facts" block (e.g. "(Ming)"). */
export const PALACE_PINYIN: Record<string, string> = {
  '命宫': 'Ming',
  '身宫': 'Shen',
  '兄弟': 'Xiong Di',
  '夫妻': 'Fu Qi',
  '子女': 'Zi Nu',
  '财帛': 'Cai Bo',
  '疾厄': 'Ji E',
  '迁移': 'Qian Yi',
  '仆役': 'Pu Yi',
  '交友': 'Pu Yi',
  '官禄': 'Guan Lu',
  '田宅': 'Tian Zhai',
  '福德': 'Fu De',
  '父母': 'Fu Mu',
}

/* ------------------------------------------------------------
   Four Transformations (Si Hua) — glossary section 9
   ------------------------------------------------------------ */

export const SIHUA_EN: Record<string, { code: string; label: string }> = {
  '禄': { code: 'Lu', label: 'Transformation of Prosperity' },
  '权': { code: 'Quan', label: 'Transformation of Power' },
  '科': { code: 'Ke', label: 'Transformation of Fame' },
  '忌': { code: 'Ji', label: 'Transformation of Obstacle' },
}

/* ------------------------------------------------------------
   Brightness (Miao/Wang/De/Li/Ping/Bu/Xian)
   ------------------------------------------------------------ */

export const BRIGHTNESS_EN: Record<string, { code: string; label: string }> = {
  '庙': { code: '+3', label: 'Exalted' },
  '旺': { code: '+2', label: 'Prosperous' },
  '得': { code: '+1', label: 'Favorable' },
  '利': { code: '+0', label: 'Advantageous' },
  '平': { code: '−1', label: 'Neutral' },
  '不': { code: '−2', label: 'Weak' },
  '陷': { code: '−3', label: 'Trapped' },
}

/* ------------------------------------------------------------
   Ten Heavenly Stems — glossary section 2
   ------------------------------------------------------------ */

export const STEM_EN: Record<string, StarGloss> = {
  '甲': { pinyin: 'Jia', archetype: 'Yang Wood — a tall, straight tree' },
  '乙': { pinyin: 'Yi', archetype: 'Yin Wood — grass, vine, flower' },
  '丙': { pinyin: 'Bing', archetype: 'Yang Fire — the sun' },
  '丁': { pinyin: 'Ding', archetype: 'Yin Fire — a candle, a lamp' },
  '戊': { pinyin: 'Wu', archetype: 'Yang Earth — a mountain' },
  '己': { pinyin: 'Ji', archetype: 'Yin Earth — fertile field' },
  '庚': { pinyin: 'Geng', archetype: 'Yang Metal — raw metal, an axe' },
  '辛': { pinyin: 'Xin', archetype: 'Yin Metal — jewelry, refined metal' },
  '壬': { pinyin: 'Ren', archetype: 'Yang Water — the ocean' },
  '癸': { pinyin: 'Gui', archetype: 'Yin Water — rain, dew, mist' },
}

/* ------------------------------------------------------------
   Twelve Earthly Branches + zodiac — glossary section 3
   ------------------------------------------------------------ */

export const BRANCH_EN: Record<string, { pinyin: string; zodiac: string }> = {
  '子': { pinyin: 'Zi', zodiac: 'Rat' },
  '丑': { pinyin: 'Chou', zodiac: 'Ox' },
  '寅': { pinyin: 'Yin', zodiac: 'Tiger' },
  '卯': { pinyin: 'Mao', zodiac: 'Rabbit' },
  '辰': { pinyin: 'Chen', zodiac: 'Dragon' },
  '巳': { pinyin: 'Si', zodiac: 'Snake' },
  '午': { pinyin: 'Wu', zodiac: 'Horse' },
  '未': { pinyin: 'Wei', zodiac: 'Goat' },
  '申': { pinyin: 'Shen', zodiac: 'Monkey' },
  '酉': { pinyin: 'You', zodiac: 'Rooster' },
  '戌': { pinyin: 'Xu', zodiac: 'Dog' },
  '亥': { pinyin: 'Hai', zodiac: 'Pig' },
}

/** Chinese zodiac animal names as returned by `chart.zodiac` (e.g. "蛇"). */
export const SHENGXIAO_EN: Record<string, string> = {
  '鼠': 'Rat', '牛': 'Ox', '虎': 'Tiger', '兔': 'Rabbit', '龙': 'Dragon', '蛇': 'Snake',
  '马': 'Horse', '羊': 'Goat', '猴': 'Monkey', '鸡': 'Rooster', '狗': 'Dog', '猪': 'Pig',
}

/** Western zodiac sign names as returned by `chart.sign` (e.g. "天蝎座"). */
export const WESTERN_SIGN_EN: Record<string, string> = {
  '白羊座': 'Aries', '金牛座': 'Taurus', '双子座': 'Gemini', '巨蟹座': 'Cancer',
  '狮子座': 'Leo', '处女座': 'Virgo', '天秤座': 'Libra', '天蝎座': 'Scorpio',
  '射手座': 'Sagittarius', '摩羯座': 'Capricorn', '水瓶座': 'Aquarius', '双鱼座': 'Pisces',
}

/* ------------------------------------------------------------
   Five Elements Class (fiveElementsClass) — determines Da Xian pacing
   ------------------------------------------------------------ */

export const FIVE_ELEMENTS_CLASS_EN: Record<string, string> = {
  '水二局': 'Water Class (cycle of 2)',
  '木三局': 'Wood Class (cycle of 3)',
  '金四局': 'Metal Class (cycle of 4)',
  '土五局': 'Earth Class (cycle of 5)',
  '火六局': 'Fire Class (cycle of 6)',
}

/* ------------------------------------------------------------
   Small formatting helpers shared by ChartDisplay / ShareCard / chart-facts
   ------------------------------------------------------------ */

export function translateBrightness(brightness?: string): { code: string; label: string } | null {
  if (!brightness) return null
  return BRIGHTNESS_EN[brightness] || null
}

export function translateMutagen(mutagen?: string): { code: string; label: string } | null {
  if (!mutagen) return null
  return SIHUA_EN[mutagen] || null
}

export function translateStem(stem?: string): string {
  if (!stem) return ''
  return STEM_EN[stem]?.pinyin || stem
}

export function translateBranch(branch?: string): string {
  if (!branch) return ''
  return BRANCH_EN[branch]?.pinyin || branch
}

export function translateGanZhi(ganzhi: string): string {
  return ganzhi
    .split('')
    .map((ch) => STEM_EN[ch]?.pinyin || BRANCH_EN[ch]?.pinyin || ch)
    .join('-')
}

export function translateFiveElementsClass(cls?: string): string {
  if (!cls) return ''
  return FIVE_ELEMENTS_CLASS_EN[cls] || cls
}

export function translateZodiac(zodiac?: string): string {
  if (!zodiac) return ''
  return SHENGXIAO_EN[zodiac] || zodiac
}

export function translateWesternSign(sign?: string): string {
  if (!sign) return ''
  return WESTERN_SIGN_EN[sign] || sign
}

/** "午时" → "Horse Hour" — used when showing true-solar-time corrections. */
export function translateShichen(shichen?: string): string {
  if (!shichen) return ''
  const branch = shichen.replace(/时$/u, '')
  const zodiac = BRANCH_EN[branch]?.zodiac
  return zodiac ? `${zodiac} Hour` : shichen
}

/* ------------------------------------------------------------
   Na Yin (sixty jiazi sound elements) — poetic English renderings
   ------------------------------------------------------------ */

export const NAYIN_EN: Record<string, string> = {
  '海中金': 'Gold in the Sea',
  '炉中火': 'Fire in the Furnace',
  '大林木': 'Great Forest Wood',
  '路旁土': 'Roadside Earth',
  '剑锋金': 'Sword-Edge Metal',
  '山头火': 'Mountaintop Fire',
  '涧下水': 'Stream Water',
  '城头土': 'City-Wall Earth',
  '白蜡金': 'White Wax Metal',
  '杨柳木': 'Willow Wood',
  '泉中水': 'Spring Water',
  '屋上土': 'Rooftop Earth',
  '霹雳火': 'Thunderbolt Fire',
  '松柏木': 'Pine & Cypress Wood',
  '长流水': 'Long-Flowing Water',
  '砂中金': 'Gold in the Sand',
  '山下火': 'Fire Below the Mountain',
  '平地木': 'Plainland Wood',
  '壁上土': 'Wall Earth',
  '金箔金': 'Gold-Leaf Metal',
  '覆灯火': 'Lamplight Fire',
  '天河水': 'Heavenly River Water',
  '大驿土': 'Highway Earth',
  '钗钏金': 'Hairpin Metal',
  '桑柘木': 'Mulberry Wood',
  '大溪水': 'Great Stream Water',
  '沙中土': 'Sand Earth',
  '天上火': 'Heavenly Fire',
  '石榴木': 'Pomegranate Wood',
  '大海水': 'Ocean Water',
}

export function translateNayin(nayin?: string): string {
  if (!nayin) return ''
  return NAYIN_EN[nayin] || nayin
}
