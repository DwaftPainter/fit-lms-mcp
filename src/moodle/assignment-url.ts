/** Return only a same-site, read-only assignment link with its course-module ID. */
export function assignmentUrl(candidate: string | undefined, baseUrl: string): string | null {
  return moduleViewUrl(candidate, baseUrl, "assign");
}

export function moduleViewUrl(candidate: string | undefined, baseUrl: string, expectedType?: string): string | null {
  if (!candidate) return null;
  try {
    const url = new URL(candidate, `${baseUrl}/`);
    const base = new URL(`${baseUrl}/`);
    const id = url.searchParams.get("id");
    const prefix = `${base.pathname}mod/`;
    const type = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length).match(/^([a-z][a-z0-9_]*)\/view\.php$/)?.[1] : undefined;
    if (
      url.origin !== base.origin || url.username || url.password ||
      !type || (expectedType !== undefined && type !== expectedType) ||
      !id || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) ||
      [...url.searchParams.keys()].some(key => key !== "id" && key !== "sesskey")
    ) return null;
    // Never expose session keys or fragments received in LMS links.
    return `${baseUrl}/mod/${type}/view.php?id=${id}`;
  } catch {
    return null;
  }
}
