import NextAuth, { type NextAuthOptions } from "next-auth";
import { NextResponse } from "next/server";
import {
  createPortalAuthKit,
  type AuthRole,
  type AuthenticatedUser,
  type CreatePortalAuthKitOptions,
  type PortalAuthKit,
} from "./server";

export type RequireAuthUser = (minimumRole?: AuthRole) => Promise<AuthenticatedUser | null>;

export interface CreateAuthRouteHandlersOptions {
  authOptions: NextAuthOptions;
  requireAuthUser: RequireAuthUser;
}

export interface CreatePortalAppBindingsOptions extends CreatePortalAuthKitOptions {
  minimumRole?: AuthRole;
}

export interface PortalAppBindings {
  authKit: PortalAuthKit;
  authHandlers: ReturnType<typeof createAuthRouteHandlers>;
}

export function createNextAuthRouteHandlers(authOptions: NextAuthOptions) {
  const handler = NextAuth(authOptions);

  return {
    GET: handler,
    POST: handler,
  };
}

export function createAuthMeGetHandler(requireAuthUser: RequireAuthUser) {
  return async function GET(): Promise<Response> {
    const user = await requireAuthUser();
    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user,
    });
  };
}

export function createAuthRouteHandlers(options: CreateAuthRouteHandlersOptions) {
  const { GET: nextAuthGet, POST: nextAuthPost } = createNextAuthRouteHandlers(options.authOptions);
  const authMeGet = createAuthMeGetHandler(options.requireAuthUser);

  return {
    nextAuthGet,
    nextAuthPost,
    authMeGet,
  };
}

export function createPortalAppBindings(
  options: CreatePortalAppBindingsOptions
): PortalAppBindings {
  const authKit = createPortalAuthKit(options);
  const authHandlers = createAuthRouteHandlers({
    authOptions: authKit.authOptions,
    requireAuthUser: authKit.requireAuthUser,
  });

  return {
    authKit,
    authHandlers,
  };
}
