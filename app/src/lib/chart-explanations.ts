/**
 * [INPUT]: Internal zh-CN palace and major-star names emitted by iztro.
 * [OUTPUT]: Short, local English explanations for the interactive natal chart.
 * [POS]: Presentation-only reflective guidance; never a prediction, diagnosis,
 *   or substitute for professional advice.
 * [PROTOCOL]: Keep all display copy English and update coverage tests when the
 *   supported palace or major-star set changes.
 */

export interface ReflectiveExplanation {
  summary: string
  watchFor: string
}

export const PALACE_EXPLANATIONS: Record<string, ReflectiveExplanation> = {
  '命宫': {
    summary: 'A lens on self-expression, identity, habits, and the way you approach life.',
    watchFor: 'Treat it as one perspective on your character, not a complete definition of who you are.',
  },
  '兄弟': {
    summary: 'A lens on peer relationships, including siblings, colleagues, collaborators, and competitors.',
    watchFor: 'Notice how you balance cooperation, comparison, and independence rather than reading it as a literal sibling count.',
  },
  '夫妻': {
    summary: 'A lens on close relationship patterns, shared expectations, needs, and boundaries.',
    watchFor: 'Use it to reflect on how you relate; it does not determine a partner or relationship outcome.',
  },
  '子女': {
    summary: 'A lens on creativity, projects, mentorship, and relationships with younger people.',
    watchFor: 'Read it broadly as generative energy and responsibility, not as a fertility statement.',
  },
  '财帛': {
    summary: 'A lens on earning, handling resources, material priorities, and personal values.',
    watchFor: 'Explore habits and tradeoffs here; this palace is not a financial forecast.',
  },
  '疾厄': {
    summary: 'A lens on routines, stress patterns, recovery, and awareness of the body.',
    watchFor: 'Use it for general self-reflection only, never as a medical diagnosis or treatment guide.',
  },
  '迁移': {
    summary: 'A lens on mobility, unfamiliar environments, public behavior, and life beyond familiar settings.',
    watchFor: 'Compare how you adapt outside your comfort zone with how you experience yourself privately.',
  },
  '仆役': {
    summary: 'A lens on friendship, teams, networks, mutual support, and social boundaries.',
    watchFor: 'Notice reciprocity: where you contribute, where you receive support, and where clearer limits help.',
  },
  '交友': {
    summary: 'A lens on friendship, teams, networks, mutual support, and social boundaries.',
    watchFor: 'Notice reciprocity: where you contribute, where you receive support, and where clearer limits help.',
  },
  '官禄': {
    summary: 'A lens on work style, responsibility, contribution, and the social roles you choose to hold.',
    watchFor: 'Consider what meaningful work looks like to you; this palace does not guarantee a career path.',
  },
  '田宅': {
    summary: 'A lens on home, belonging, family resources, and the foundations you build over time.',
    watchFor: 'Reflect on stability and stewardship rather than treating it as property or investment advice.',
  },
  '福德': {
    summary: 'A lens on inner life, rest, recovery, meaning, and the conditions that support well-being.',
    watchFor: 'Notice whether achievement and restoration have enough room to coexist.',
  },
  '父母': {
    summary: 'A lens on parents, mentors, authority, institutions, and the guidance you accept or question.',
    watchFor: 'Explore learned patterns without reducing any real person or relationship to a chart symbol.',
  },
}

export const MAJOR_STAR_EXPLANATIONS: Record<string, ReflectiveExplanation> = {
  '紫微': {
    summary: 'Coordination, responsibility, dignity, and the capacity to hold a wider view.',
    watchFor: 'Leadership can become control or isolation when responsibility is not shared.',
  },
  '天机': {
    summary: 'Analysis, adaptation, planning, and curiosity about how systems work.',
    watchFor: 'A quick mind benefits from pauses that interrupt overthinking and restlessness.',
  },
  '太阳': {
    summary: 'Visibility, generosity, confidence, and contribution in public or shared spaces.',
    watchFor: 'Giving and showing up work best when they do not become overextension.',
  },
  '武曲': {
    summary: 'Execution, discipline, resource management, and practical follow-through.',
    watchFor: 'Efficiency works best when firmness leaves room for context and emotion.',
  },
  '天同': {
    summary: 'Ease, empathy, harmony, and an instinct for making life more humane.',
    watchFor: 'Comfort restores energy, but too much can turn into avoidance or inertia.',
  },
  '廉贞': {
    summary: 'Boundaries, standards, intensity, and the ability to engage complex situations.',
    watchFor: 'Strong convictions benefit from transparency and proportion.',
  },
  '天府': {
    summary: 'Stewardship, stability, reserves, and the patient care of people or resources.',
    watchFor: 'Protecting what works should still leave room for thoughtful change.',
  },
  '太阴': {
    summary: 'Inward observation, care, imagination, and sensitivity to subtle needs.',
    watchFor: 'Reflection is most useful when it does not become withdrawal or prolonged worry.',
  },
  '贪狼': {
    summary: 'Curiosity, appetite, social creativity, and engagement with varied experiences.',
    watchFor: 'Many interests become more satisfying when desire is focused rather than scattered.',
  },
  '巨门': {
    summary: 'Questioning, language, investigation, and the willingness to examine what others overlook.',
    watchFor: 'Careful phrasing can turn debate and doubt into shared understanding.',
  },
  '天相': {
    summary: 'Support, diplomacy, standards, and awareness of fairness in a group.',
    watchFor: 'Helping others works best when it is not driven mainly by approval.',
  },
  '天梁': {
    summary: 'Protection, mentoring, principles, and a long view of responsibility.',
    watchFor: 'Guidance stays useful when it avoids moral distance or rescuing without consent.',
  },
  '七杀': {
    summary: 'Decisive action, independence, courage, and direct engagement with challenge.',
    watchFor: 'Speed and conviction benefit from a deliberate check on impatience.',
  },
  '破军': {
    summary: 'Reform, reinvention, disruption, and the willingness to rebuild what no longer works.',
    watchFor: 'Change becomes sustainable when experimentation includes continuity and recovery.',
  },
}

export function getPalaceExplanation(
  name: string,
): ReflectiveExplanation | undefined {
  return PALACE_EXPLANATIONS[name]
}

export function getMajorStarExplanation(
  name: string,
): ReflectiveExplanation | undefined {
  return MAJOR_STAR_EXPLANATIONS[name]
}
