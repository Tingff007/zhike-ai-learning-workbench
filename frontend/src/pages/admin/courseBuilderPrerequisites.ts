type PrerequisiteSource = Record<string, unknown> | null | undefined;

export function normalizePrerequisiteIds(
  source: PrerequisiteSource,
  validElementIds?: ReadonlySet<string>,
): string[] {
  const prerequisites = source?.prerequisites;
  if (!Array.isArray(prerequisites)) {
    return [];
  }

  const seen = new Set<string>();
  return prerequisites.flatMap((item) => {
    if (typeof item !== 'string') {
      return [];
    }

    const id = item.trim();
    if (!id || seen.has(id) || (validElementIds && !validElementIds.has(id))) {
      return [];
    }

    seen.add(id);
    return [id];
  });
}

export function countPrerequisiteIds(source: PrerequisiteSource, validElementIds?: ReadonlySet<string>): number {
  return normalizePrerequisiteIds(source, validElementIds).length;
}
