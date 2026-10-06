import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getAuthSession } from "@/lib/auth/config";

export default async function PopupLayout({ children }: { children: ReactNode }) {
  const session = (await getAuthSession()) as { user?: { id?: string } } | null;
  if (!session?.user?.id) {
    redirect("/login");
  }
  return <>{children}</>;
}
