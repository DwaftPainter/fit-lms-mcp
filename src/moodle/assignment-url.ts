/** Return only a same-site, read-only assignment link with its course-module ID. */
export function assignmentUrl(candidate: string | undefined, baseUrl: string): string | null {
  if (!candidate) return null;
  try {
    const url = new URL(candidate, `${baseUrl}/`);
    const base = new URL(`${baseUrl}/`);
    const id = url.searchParams.get("id");
    if (
      url.origin !== base.origin || url.username || url.password ||
      url.pathname !== `${base.pathname}mod/assign/view.php` ||
      !id || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) ||
      [...url.searchParams.keys()].some(key => key !== "id" && key !== "sesskey")
    ) return null;
    // Never expose session keys or fragments received in LMS links.
    return `${baseUrl}/mod/assign/view.php?id=${id}`;
  } catch {
    return null;
  }
}
