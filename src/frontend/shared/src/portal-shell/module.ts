import type { PortalShellPageComponent } from "./types";

export interface ParsedPageId {
  moduleId: string;
  pageName: string;
}

export interface PortalShellModuleProvider {
  moduleId: string;
  getPage: (pageId: string) => Promise<PortalShellPageComponent | null>;
}

export type PortalShellResolvePage = (pageId: string) => Promise<PortalShellPageComponent | null>;
export type PortalShellPageLoader = () => Promise<{ default: PortalShellPageComponent }>;
export type PortalShellPageLoaderMap = Record<string, PortalShellPageLoader>;

function hasInvalidMenuPathCharacters(value: string): boolean {
  return value.includes("\\") || value.includes(":");
}

function isValidPathSegment(segment: string): boolean {
  return segment.length > 0 && segment !== "." && segment !== "..";
}

export function isValidPageLeafName(pageName: string): boolean {
  if (!pageName || pageName.includes("/")) {
    return false;
  }

  if (hasInvalidMenuPathCharacters(pageName)) {
    return false;
  }

  return isValidPathSegment(pageName);
}

export function isValidPagePath(path: string): boolean {
  if (path === "/") {
    return true;
  }

  if (!path || !path.startsWith("/") || path.endsWith("/")) {
    return false;
  }

  if (hasInvalidMenuPathCharacters(path)) {
    return false;
  }

  const segments = path.slice(1).split("/");
  return segments.every((segment) => isValidPathSegment(segment));
}

export function composePageName(path: string, pageName: string): string | null {
  if (!isValidPagePath(path) || !isValidPageLeafName(pageName)) {
    return null;
  }

  if (path === "/") {
    return pageName;
  }

  return `${path.slice(1)}/${pageName}`;
}

export function isValidPageNamePath(pageName: string): boolean {
  if (!pageName || pageName.startsWith("/") || pageName.endsWith("/")) {
    return false;
  }

  if (hasInvalidMenuPathCharacters(pageName)) {
    return false;
  }

  const segments = pageName.split("/");
  return segments.every((segment) => isValidPathSegment(segment));
}

export function parsePageId(pageId: string): ParsedPageId | null {
  const separatorIndex = pageId.indexOf(":");

  if (separatorIndex <= 0 || separatorIndex >= pageId.length - 1) {
    return null;
  }

  const pageName = pageId.slice(separatorIndex + 1);
  if (!isValidPageNamePath(pageName)) {
    return null;
  }

  return {
    moduleId: pageId.slice(0, separatorIndex),
    pageName,
  };
}

export function createPortalShellPageResolver(
  providers: PortalShellModuleProvider[]
): PortalShellResolvePage {
  const providersByModuleId = new Map(providers.map((provider) => [provider.moduleId, provider]));

  return async (pageId: string) => {
    const parsed = parsePageId(pageId);
    if (!parsed) {
      return null;
    }

    const provider = providersByModuleId.get(parsed.moduleId);
    if (!provider) {
      return null;
    }

    return provider.getPage(pageId);
  };
}

export function createPageMapModuleProvider(
  moduleId: string,
  pageLoaders: PortalShellPageLoaderMap
): PortalShellModuleProvider {
  const pageLoadersByPageId = new Map(Object.entries(pageLoaders));

  return {
    moduleId,
    async getPage(pageId: string) {
      const parsed = parsePageId(pageId);
      if (!parsed || parsed.moduleId !== moduleId) {
        return null;
      }

      const pageLoader = pageLoadersByPageId.get(parsed.pageName);
      if (!pageLoader) {
        return null;
      }

      const pageModule = await pageLoader();
      return pageModule.default ?? null;
    },
  };
}
