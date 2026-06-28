const SPAMMY_TAGS = new Set(['followforfollow', 'likeforlike', 'follow4follow', 'like4like', 'spam']);

function cleanTag(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9_]+/g, '');
}

function rawParts(input: string | string[]) {
  const values = Array.isArray(input) ? input : [input];
  return values.flatMap((value) =>
    String(value || '')
      .replace(/([^\s,])#/g, '$1 #')
      .split(/[,\s]+/)
      .filter(Boolean)
  );
}

export function normalizeHashtags(input: string | string[], options: { max?: number; includeFyp?: boolean } = {}) {
  const max = Math.min(Math.max(Math.round(Number(options.max) || 8), 1), 20);
  const required = options.includeFyp === true ? ['fyp'] : [];
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const part of rawParts(input)) {
    const tag = cleanTag(part);
    if (!tag || tag.length < 2 || tag.length > 40 || SPAMMY_TAGS.has(tag) || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }

  const slots = Math.max(max - required.length, 0);
  const next = tags.filter((tag) => !required.includes(tag)).slice(0, slots);
  for (const tag of required) if (!next.includes(tag)) next.push(tag);
  return next.slice(0, max);
}

export function captionWithHashtags(caption: string, hashtags: string[]) {
  const base = String(caption || '').trim();
  const existing = new Set(normalizeHashtags(base.match(/#[a-z0-9_]+/gi) || [], { max: 40, includeFyp: false }));
  const tags = normalizeHashtags(hashtags, { max: 20, includeFyp: false }).filter((tag) => !existing.has(tag));
  const suffix = tags.map((tag) => `#${tag}`).join(' ');
  return [base, suffix].filter(Boolean).join(' ');
}
