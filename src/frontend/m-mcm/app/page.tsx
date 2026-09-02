import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth/config";

export default async function Home() {
  const session = (await getAuthSession()) as { user?: { id?: string } } | null;
  const sessionUser = session?.user;
  redirect(sessionUser?.id ? "/portal" : "/login");
}
