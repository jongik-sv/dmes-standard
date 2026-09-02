import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export type PortalLoginSearchParams = Record<string, string | string[] | undefined>;

export interface PortalLoginPageProps {
  searchParams?: Promise<PortalLoginSearchParams> | PortalLoginSearchParams;
}

export interface CreatePortalLoginPageOptions {
  appName: string;
  getAuthSession: () => Promise<unknown>;
  normalizeCallbackUrl: (rawValue: string | null | undefined) => string;
  renderLoginForm: (props: PortalLoginFormRenderProps) => ReactNode;
  authenticatedRedirectPath?: string;
}

export interface PortalLoginFormRenderProps {
  appName: string;
  callbackUrl: string;
}

interface LoginSessionShape {
  user?: {
    id?: string;
  };
}

async function resolveSearchParams(
  searchParams: PortalLoginPageProps["searchParams"]
): Promise<PortalLoginSearchParams> {
  if (!searchParams) {
    return {};
  }

  if ("then" in searchParams && typeof searchParams.then === "function") {
    return await searchParams;
  }

  return searchParams;
}

export function createPortalLoginPage(options: CreatePortalLoginPageOptions) {
  const authenticatedRedirectPath = options.authenticatedRedirectPath ?? "/portal";

  return async function PortalLoginPage({ searchParams }: PortalLoginPageProps) {
    const session = (await options.getAuthSession()) as LoginSessionShape | null;
    const sessionUser = session?.user;
    if (sessionUser?.id) {
      redirect(authenticatedRedirectPath);
    }

    const resolvedSearchParams = await resolveSearchParams(searchParams);
    const callbackUrlValue = resolvedSearchParams.callbackUrl;
    const callbackUrl = options.normalizeCallbackUrl(
      Array.isArray(callbackUrlValue) ? callbackUrlValue[0] : callbackUrlValue
    );

    return options.renderLoginForm({
      appName: options.appName,
      callbackUrl,
    });
  };
}
