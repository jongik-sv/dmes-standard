import { isValidPageNamePath, parsePageId } from "./module";
import type { PortalShellResolvePage } from "./module";
import type { PortalShellPageComponent } from "./types";

export * from "./types";
export * from "./module";

function isPortalShellPageComponent(value: unknown): value is PortalShellPageComponent {
  return typeof value === "function";
}

export function createSafePageLoader(
  pageLoader: (pageName: string) => Promise<{ default: unknown }>
): (pageName: string) => Promise<PortalShellPageComponent | null> {
  return async (pageName: string) => {
    if (!isValidPageNamePath(pageName)) {
      return null;
    }

    try {
      const pageModule = await pageLoader(pageName);
      if (!isPortalShellPageComponent(pageModule.default)) {
        return null;
      }

      return pageModule.default;
    } catch {
      return null;
    }
  };
}

export function createModulePageResolver(
  moduleId: string,
  loadPageByName: (pageName: string) => Promise<PortalShellPageComponent | null>
): PortalShellResolvePage {
  return async (pageId: string) => {
    const parsed = parsePageId(pageId);
    if (!parsed || parsed.moduleId !== moduleId) {
      return null;
    }

    return loadPageByName(parsed.pageName);
  };
}
