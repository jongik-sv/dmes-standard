export const DEFAULT_PORTAL_HOME_PAGE_NAME_BY_MODULE: Readonly<Record<string, string>> =
  Object.freeze({
    portal: "home",
  });

export function resolvePortalHomePageId(
  moduleId: string,
  overridePageName?: string | null
): string | null {
  const normalizedModuleId = moduleId.trim();
  if (!normalizedModuleId) {
    return null;
  }

  const normalizedPageName = overridePageName?.trim();
  const pageName =
    normalizedPageName || DEFAULT_PORTAL_HOME_PAGE_NAME_BY_MODULE[normalizedModuleId];

  if (!pageName) {
    return null;
  }

  return `${normalizedModuleId}:${pageName}`;
}
