function normalize(text) {
  return text.toLowerCase();
}

function matchScore(tool, query) {
  const label = normalize(tool.label);
  const description = normalize(tool.description || '');
  const category = normalize(tool.category || '');
  const keywords = (tool.keywords || []).map(normalize);

  if (label === query) return 100;
  if (label.startsWith(query)) return 80;
  if (label.includes(query)) return 60;
  if (keywords.some((keyword) => keyword.startsWith(query))) return 50;
  if (keywords.some((keyword) => keyword.includes(query))) return 40;
  if (category.includes(query)) return 30;
  if (description.includes(query)) return 20;
  return 0;
}

// Ranked substring search over label/keywords/category/description, in that
// priority order. Deliberately not a fuzzy/typo-tolerant matcher - the tool
// list is small enough that simple substring ranking is sufficient (see
// design doc non-goals for the search palette).
export function searchTools(tools, query) {
  const trimmed = query.trim();
  if (!trimmed) {
    return tools;
  }
  const normalizedQuery = normalize(trimmed);
  return tools
    .map((tool) => ({ tool, score: matchScore(tool, normalizedQuery) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ tool }) => tool);
}
