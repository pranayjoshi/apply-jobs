// Keep original section text available even when a model omits or truncates it.
export function resumeSections(text: string) {
  const result = { experience: '', education: '', projects: '', skills: '', summary: '' };
  type Section = keyof typeof result;
  const headings: Record<string, Section | 'stop'> = {};
  const register = (section: Section | 'stop', names: string[]) =>
    names.forEach((n) => {
      headings[n] = section;
    });
  register('experience', [
    'experience',
    'work experience',
    'professional experience',
    'employment',
    'employment history',
    'work history',
    'professional history',
    'relevant experience',
    'research experience',
    'teaching experience',
    'internships',
  ]);
  register('education', [
    'education',
    'academic background',
    'educational background',
    'academic qualifications',
    'education and qualifications',
  ]);
  register('projects', [
    'projects',
    'selected projects',
    'technical projects',
    'personal projects',
    'academic projects',
    'project experience',
    'relevant projects',
  ]);
  register('skills', [
    'skills',
    'technical skills',
    'technologies',
    'technical expertise',
    'core competencies',
    'skills and technologies',
  ]);
  register('summary', [
    'summary',
    'professional summary',
    'profile',
    'professional profile',
    'about me',
  ]);
  register('stop', [
    'certifications',
    'certificates',
    'awards',
    'honors',
    'honors and awards',
    'publications',
    'activities',
    'leadership',
    'volunteer experience',
    'volunteering',
    'interests',
    'languages',
    'references',
    'coursework',
    'relevant coursework',
    'objective',
  ]);
  let section: Section | 'stop' | undefined;
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const clean = line
      .trim()
      .replace(/^[\s#*•|–—-]+|[\s:|–—-]+$/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\s*&\s*/g, ' and ');
    if (headings[clean]) {
      section = headings[clean];
      continue;
    }
    const inline = line.match(/^\s*([A-Za-z &]+)\s*:\s*(.+)$/);
    if (inline && headings[inline[1].trim().toLowerCase()]) {
      section = headings[inline[1].trim().toLowerCase()];
      if (section !== 'stop') result[section] += inline[2] + '\n';
      continue;
    }
    if (section && section !== 'stop') result[section] += line + '\n';
  }
  for (const key of Object.keys(result) as Section[]) result[key] = result[key].trim();
  return result;
}
