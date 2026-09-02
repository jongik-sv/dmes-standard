import { parsePageId, type PortalShellPageComponent } from "@dk-oasis/shared/portal-shell-core";
import { loadConfiguredModulePage } from "./module-config";

function isPortalShellPageComponent(value: unknown): value is PortalShellPageComponent {
  return typeof value === "function";
}

export async function resolvePortalPage(pageId: string) {
  const parsedPageId = parsePageId(pageId);
  if (!parsedPageId) {
    return null;
  }

  const pageComponent = await loadConfiguredModulePage(
    parsedPageId.moduleId,
    parsedPageId.pageName
  );
  if (!isPortalShellPageComponent(pageComponent)) {
    return null;
  }

  return pageComponent;
}
