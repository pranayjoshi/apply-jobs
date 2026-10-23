import type { Profile, Field } from '../src/types.ts';
export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
export function answerField(
  f: Field,
  p: Profile,
): { answer: string; source: string; resolved: boolean } {
  const label = normalize(f.label);
  const saved = p.answers.find((x) => normalize(x.question) === label);
  if (saved) {
    const answer = f.options.length
      ? f.options.find((option) => normalize(option) === normalize(saved.answer))
      : saved.answer;
    if (!answer)
      return { answer: '', source: 'Choose an option', resolved: !f.required };
    return { answer, source: 'Saved answer', resolved: true };
  }
  if (/reference|referee|recommender|supervisor|emergency contact/.test(label))
    return { answer: '', source: 'Needs your answer', resolved: !f.required };
  const history = p.employmentHistory?.[f.occurrence || 0],
    education = p.educationHistory?.[f.occurrence || 0];
  const structured: [RegExp, string | undefined, string][] = [
    [/^(company|company name|employer|employer name)$/, history?.company, 'Confirmed employment'],
    [/^(job title|position title|position held)$/, history?.title, 'Confirmed employment'],
    [/^(start date|employment start date)$/, history?.start, 'Confirmed employment'],
    [/^(end date|employment end date)$/, history?.end, 'Confirmed employment'],
    [/^(school|university|school name|institution)$/, education?.school, 'Confirmed education'],
    [/^(degree|degree earned)$/, education?.degree, 'Confirmed education'],
    [/^(field of study|major)$/, education?.field, 'Confirmed education'],
  ];
  const fact = structured.find(([pattern, value]) => value && pattern.test(label));
  if (fact) return { answer: fact[1]!, source: fact[2], resolved: true };
  const full = p.name.trim().split(/\s+/);
  const rules: [RegExp, string, string][] = [
    [/^(full name|name|your name|legal name)$/, p.name, 'Name'],
    [/first name|given name/, full[0] || '', 'Name'],
    [/last name|family name|surname/, full.slice(1).join(' '), 'Name'],
    [/e ?mail/, p.email, 'Email'],
    [/phone|mobile/, p.phone, 'Phone'],
    [/linkedin/, p.linkedin, 'LinkedIn'],
    [/website|portfolio|personal url/, p.website, 'Website'],
    [/^(location|city|current location|address city)$/, p.location, 'Location'],
    [
      /authorized.*work|legally.*work|work authorization/,
      p.workAuthorization,
      'Work authorization',
    ],
    [/sponsor/, p.sponsorship, 'Sponsorship'],
  ];
  const match = rules.find(([pattern]) => pattern.test(label));
  if (match && match[1]) {
    let answer = match[1];
    if (f.options.length) {
      const normalizedAnswer = normalize(answer);
      const candidate = f.options.find((o) => normalize(o) === normalizedAnswer);
      const partialMatches = f.options.filter(
        (o) => normalize(o).startsWith(normalizedAnswer) && normalizedAnswer.length >= 2,
      );
      const unambiguousPartial = partialMatches.length === 1 ? partialMatches[0] : undefined;
      if (!candidate && !unambiguousPartial)
        return { answer: '', source: 'Choose an option', resolved: false };
      answer = candidate || unambiguousPartial!;
    }
    return { answer, source: match[2], resolved: true };
  }
  if (f.type === 'file' && /resume|résumé|cv/i.test(f.label))
    return { answer: 'Prepared résumé', source: 'Application document', resolved: true };
  return {
    answer: '',
    source: f.required ? 'Needs your answer' : 'Optional',
    resolved: !f.required,
  };
}
