export type QuizQuestionType = 'single_choice' | 'multiple_choice' | 'blank' | 'short_answer';

export type QuizOption = {
  value: string;
  label: string;
};

export type QuizQuestion = {
  id: string;
  order: number;
  localOrder: number;
  type: QuizQuestionType;
  group: QuizQuestionGroup;
  sectionTitle: string;
  prompt: string;
  options: QuizOption[];
  expectedAnswer: string | string[];
  points: number;
  analysis: string;
  scoringPoints: string[];
  keywords: string[];
};

export type QuizQuestionGroup = 'choice' | 'blank' | 'short' | 'practice';

export type ParsedQuizAssessment = {
  title: string;
  questions: QuizQuestion[];
  totalPoints: number;
  hasAutoScoringBasis: boolean;
  warnings: string[];
};

type MarkdownSection = {
  title: string;
  level: number;
  parents: string[];
  body: string;
};

type QuestionDraft = {
  localOrder: number;
  group: QuizQuestionGroup;
  sectionTitle: string;
  type: QuizQuestionType;
  prompt: string;
  options: QuizOption[];
  points: number;
  inlineAnswer: string | string[] | null;
};

type IndexedText = {
  global: Map<number, string>;
  byGroup: Record<QuizQuestionGroup, Map<number, string>>;
};

const questionGroups: QuizQuestionGroup[] = ['choice', 'blank', 'short', 'practice'];

const defaultPoints: Record<QuizQuestionGroup, number> = {
  choice: 2,
  blank: 2,
  short: 5,
  practice: 10,
};

const emptyIndexedText = (): IndexedText => ({
  global: new Map<number, string>(),
  byGroup: {
    choice: new Map<number, string>(),
    blank: new Map<number, string>(),
    short: new Map<number, string>(),
    practice: new Map<number, string>(),
  },
});

function cleanText(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAnswerText(value: string): string {
  return cleanText(value)
    .replace(/^(参考答案|标准答案|答案|答)\s*[:：]\s*/, '')
    .replace(/\s*(解析|说明|评分|原因)\s*[:：].*$/, '')
    .replace(/[。；;，,、\s]+$/g, '')
    .trim();
}

function splitAnswerOptions(value: string): string | string[] {
  const answer = normalizeAnswerText(value).toUpperCase();
  if (/^[A-H](?:\s*[,，、/]\s*[A-H])+$/.test(answer)) {
    return answer.split(/[,，、/]/).map((item) => item.trim()).filter(Boolean).sort();
  }
  return answer;
}

function sectionHasIntent(section: MarkdownSection, pattern: RegExp): boolean {
  return pattern.test(section.title) || section.parents.some((parent) => pattern.test(parent));
}

function resolveQuestionGroup(title: string): QuizQuestionGroup | null {
  if (/选择|单选|多选|判断/.test(title)) return 'choice';
  if (/填空|补全/.test(title)) return 'blank';
  if (/简答|问答|论述/.test(title)) return 'short';
  if (/实践|应用|编程|实操/.test(title)) return 'practice';
  return null;
}

function resolveQuestionType(title: string, group: QuizQuestionGroup): QuizQuestionType {
  if (/多选/.test(title)) return 'multiple_choice';
  if (group === 'choice') return 'single_choice';
  if (group === 'blank') return 'blank';
  return 'short_answer';
}

function isAnswerSection(section: MarkdownSection): boolean {
  return sectionHasIntent(section, /参考答案|标准答案|答案解析|答案$/);
}

function isScoringSection(section: MarkdownSection): boolean {
  return sectionHasIntent(section, /评分|给分|Rubric|rubric/);
}

function isNonQuestionSection(section: MarkdownSection): boolean {
  return sectionHasIntent(section, /测评说明|说明|参考答案|标准答案|答案解析|答案$|评分|常见错因|错因|补救|建议|解析/);
}

function splitSections(markdown: string): MarkdownSection[] {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const sections: MarkdownSection[] = [];
  const headingStack: Array<{ level: number; title: string }> = [];
  let current: MarkdownSection | null = null;

  function pushCurrent(): void {
    if (current) {
      current.body = current.body.trim();
      sections.push(current);
    }
  }

  for (const line of lines) {
    const heading = line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (heading) {
      pushCurrent();
      const level = heading[1].length;
      const title = cleanText(heading[2]);
      while (headingStack.length && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      current = {
        title,
        level,
        parents: headingStack.map((item) => item.title),
        body: '',
      };
      headingStack.push({ level, title });
      continue;
    }
    if (!current) {
      current = { title: '', level: 0, parents: [], body: '' };
    }
    current.body += `${line}\n`;
  }
  pushCurrent();
  return sections.filter((section) => section.title || section.body.trim());
}

function extractTitle(markdown: string, fallbackTitle: string): string {
  const heading = markdown.match(/^#\s+(.+?)\s*$/m);
  if (heading) return cleanText(heading[1]);
  const firstMeaningfulLine = markdown
    .split(/\r?\n/)
    .map((line) => cleanText(line.replace(/^#+\s*/, '')))
    .find((line) => line.length > 0);
  return firstMeaningfulLine || fallbackTitle;
}

function pointsFromTitle(title: string, group: QuizQuestionGroup): number {
  const each = title.match(/每题\s*(\d+)\s*分/);
  if (each) return Number(each[1]);
  const explicit = title.match(/[（(]\s*(\d+)\s*分\s*[）)]/);
  if (explicit) return Number(explicit[1]);
  return defaultPoints[group];
}

function parseOptions(text: string): { prompt: string; options: QuizOption[] } {
  const optionMarker = /(?:^|\n|\s)([A-H])[\.\uFF0E、)）]\s*/g;
  const matches = Array.from(text.matchAll(optionMarker));
  if (matches.length < 2) {
    return { prompt: cleanText(text), options: [] };
  }
  const first = matches[0];
  const prompt = cleanText(text.slice(0, first.index));
  const options = matches.map((match, index) => {
    const next = matches[index + 1];
    const value = match[1].toUpperCase();
    const start = (match.index ?? 0) + match[0].length;
    const end = next?.index ?? text.length;
    return {
      value,
      label: cleanText(text.slice(start, end)),
    };
  }).filter((option) => option.label.length > 0);
  return { prompt, options };
}

function stripInlineAnswer(text: string): { body: string; inlineAnswer: string | string[] | null } {
  const answerMatch = text.match(/(?:参考答案|标准答案|答案)\s*[:：]\s*([^\n]+)/);
  if (!answerMatch) return { body: text, inlineAnswer: null };
  const answer = splitAnswerOptions(answerMatch[1]);
  return {
    body: text.replace(answerMatch[0], '').trim(),
    inlineAnswer: answer,
  };
}

function parseQuestionBlocks(section: MarkdownSection, group: QuizQuestionGroup): QuestionDraft[] {
  const type = resolveQuestionType(section.title, group);
  const points = pointsFromTitle(section.title, group);
  const blocks: Array<{ localOrder: number; lines: string[] }> = [];
  let current: { localOrder: number; lines: string[] } | null = null;

  for (const rawLine of section.body.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const questionStart = line.match(/^(?:[-*]\s*)?(?:\*\*)?(\d+)[.、\uFF0E)）]\s*(.+)$/);
    if (questionStart) {
      if (current) blocks.push(current);
      current = { localOrder: Number(questionStart[1]), lines: [questionStart[2]] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) blocks.push(current);

  return blocks.flatMap((block) => {
    const rawText = block.lines.join('\n');
    const { body, inlineAnswer } = stripInlineAnswer(rawText);
    const parsed = group === 'choice' ? parseOptions(body) : { prompt: cleanText(body), options: [] };
    if (!parsed.prompt) return [];
    if (group === 'choice' && parsed.options.length < 2) return [];
    return [{
      localOrder: block.localOrder,
      group,
      sectionTitle: section.title,
      type,
      prompt: parsed.prompt,
      options: parsed.options,
      points,
      inlineAnswer,
    }];
  });
}

function parseIndexedPairs(text: string): Array<{ order: number; value: string }> {
  const cleaned = cleanText(text);
  if (!cleaned) return [];
  const compactChoiceMatches = Array.from(cleaned.matchAll(/(?:^|[\s，,；;])(?:第\s*)?(\d+)(?:\s*题)?[.、:：\uFF0E)）]\s*([A-H](?:\s*[,，、/]\s*[A-H])*)/g));
  if (compactChoiceMatches.length > 1) {
    return compactChoiceMatches.map((match) => ({ order: Number(match[1]), value: match[2] }));
  }
  const leading = cleaned.match(/^(?:第\s*)?(\d+)(?:\s*题)?[.、:：\uFF0E)）]\s*(.+)$/);
  if (!leading) return [];
  return [{ order: Number(leading[1]), value: leading[2] }];
}

function collectIndexedText(sections: MarkdownSection[], mode: 'answer' | 'scoring'): IndexedText {
  const indexed = emptyIndexedText();
  const targetSections = sections.filter((section) => (mode === 'answer' ? isAnswerSection(section) : isScoringSection(section)));

  for (const section of targetSections) {
    let currentGroup = resolveQuestionGroup(section.title);
    for (const rawLine of section.body.split('\n')) {
      const line = cleanText(rawLine);
      if (!line) continue;
      const lineGroup = resolveQuestionGroup(line);
      if (lineGroup) currentGroup = lineGroup;
      const afterGroupLabel = lineGroup && /[:：]/.test(line) ? line.replace(/^.*?[:：]\s*/, '') : line;
      const pairs = parseIndexedPairs(afterGroupLabel);
      for (const pair of pairs) {
        const value = mode === 'answer' ? normalizeAnswerText(pair.value) : cleanText(pair.value);
        if (!value) continue;
        if (currentGroup) indexed.byGroup[currentGroup].set(pair.order, value);
        else indexed.global.set(pair.order, value);
      }
    }
  }
  return indexed;
}

function splitScoringPoints(value: string): string[] {
  return cleanText(value)
    .split(/[；;。]/)
    .map((item) => cleanText(item))
    .filter((item) => item.length > 0)
    .slice(0, 6);
}

function buildKeywords(question: QuizQuestion, expectedText: string): string[] {
  const source = [...question.scoringPoints, expectedText]
    .join('；')
    .split(/[；;。,.，、]/)
    .map((item) => cleanText(item))
    .filter((item) => item.length >= 2 && item.length <= 24);
  return Array.from(new Set(source)).slice(0, 10);
}

function answerForQuestion(question: QuestionDraft, globalOrder: number, answers: IndexedText): string | string[] {
  const grouped = answers.byGroup[question.group].get(question.localOrder);
  const global = answers.global.get(globalOrder);
  const answer = question.inlineAnswer ?? grouped ?? global ?? '';
  if (Array.isArray(answer)) return answer;
  if (question.type === 'multiple_choice') {
    const split = splitAnswerOptions(answer);
    return Array.isArray(split) ? split : answer;
  }
  return normalizeAnswerText(answer);
}

function scoringForQuestion(question: QuestionDraft, globalOrder: number, scoring: IndexedText): string[] {
  const grouped = scoring.byGroup[question.group].get(question.localOrder);
  const global = scoring.global.get(globalOrder);
  return splitScoringPoints(grouped ?? global ?? '');
}

export function parseQuizAssessmentMarkdown(markdown: string, fallbackTitle = '阶段测评题'): ParsedQuizAssessment {
  const sections = splitSections(markdown);
  const questionDrafts = sections.flatMap((section) => {
    if (isNonQuestionSection(section)) return [];
    const group = resolveQuestionGroup(section.title);
    if (!group) return [];
    return parseQuestionBlocks(section, group);
  });
  const answers = collectIndexedText(sections, 'answer');
  const scoring = collectIndexedText(sections, 'scoring');
  const questions = questionDrafts.map((draft, index): QuizQuestion => {
    const order = index + 1;
    const expectedAnswer = answerForQuestion(draft, order, answers);
    const scoringPoints = scoringForQuestion(draft, order, scoring);
    const question: QuizQuestion = {
      id: `q${order}`,
      order,
      localOrder: draft.localOrder,
      type: draft.type,
      group: draft.group,
      sectionTitle: draft.sectionTitle,
      prompt: draft.prompt,
      options: draft.options,
      expectedAnswer,
      points: draft.points,
      analysis: scoringPoints.length ? scoringPoints.join('；') : '',
      scoringPoints,
      keywords: [],
    };
    question.keywords = buildKeywords(question, Array.isArray(expectedAnswer) ? expectedAnswer.join('、') : expectedAnswer);
    return question;
  });
  const warnings: string[] = [];
  if (!questions.length) warnings.push('未从资源正文中解析到可作答题目，请重新生成包含题型标题和编号题目的阶段测评题。');
  const missingAnswerCount = questions.filter((question) => {
    const expected = question.expectedAnswer;
    const hasExpected = Array.isArray(expected) ? expected.length > 0 : expected.trim().length > 0;
    return !hasExpected && question.scoringPoints.length === 0;
  }).length;
  if (missingAnswerCount > 0) warnings.push(`${missingAnswerCount} 道题缺少参考答案或评分要点，暂不能进行可靠自动评分。`);
  const totalPoints = questions.reduce((sum, question) => sum + question.points, 0);
  const hasAutoScoringBasis = questions.length > 0 && missingAnswerCount === 0;
  return {
    title: extractTitle(markdown, fallbackTitle),
    questions,
    totalPoints,
    hasAutoScoringBasis,
    warnings,
  };
}
