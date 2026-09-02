import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: string;
      roles: string[];
    };
  }

  interface User {
    role: string;
    roles: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    roles?: string[];
    /** BFF RBAC (방식 T) — 허용 권한키 "module/objId/action" 배열. SYSADMIN 은 ["*"]. */
    perms?: string[];
    backendAccessToken?: string;
    backendRefreshToken?: string;
  }
}

export {};
