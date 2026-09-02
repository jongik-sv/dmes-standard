import { createPortalLoginPage } from "@dk-oasis/shared/auth-login-page";
import { PortalLoginForm } from "@dk-oasis/shared/auth-login-form";
import "@dk-oasis/shared/auth-login-form.css";
import { getAuthSession, normalizeCallbackUrl } from "@/lib/auth/config";

export default createPortalLoginPage({
  appName: "DMES Portal",
  getAuthSession,
  normalizeCallbackUrl,
  renderLoginForm: ({ appName, callbackUrl }) => (
    <PortalLoginForm appName={appName} callbackUrl={callbackUrl} />
  ),
});
