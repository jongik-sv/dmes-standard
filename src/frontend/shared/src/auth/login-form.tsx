"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState, useTransition } from "react";
import { PasswordChangeModal } from "./PasswordChangeModal";
import "./login-form.css";

const SAVE_ID_STORAGE_KEY = "oasis.login.savedUserId";
const SAVE_ID_FLAG_KEY = "oasis.login.saveIdEnabled";
const BACKEND_API_URL = "";  // 프론트 프록시 경유

export interface PortalLoginFormProps {
  appName: string;
  callbackUrl: string;
}

export function PortalLoginForm({ appName, callbackUrl }: PortalLoginFormProps) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [saveId, setSaveId] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [modalDefaultEmail, setModalDefaultEmail] = useState("");
  const [modalDefaultPassword, setModalDefaultPassword] = useState("");

  // 로컬스토리지에서 저장된 아이디 불러오기
  useEffect(() => {
    try {
      const flag = localStorage.getItem(SAVE_ID_FLAG_KEY);
      if (flag === "true") {
        const savedId = localStorage.getItem(SAVE_ID_STORAGE_KEY) ?? "";
        setUserId(savedId);
        setSaveId(true);
      }
    } catch {
      // localStorage 접근 불가 시 무시
    }
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    // 아이디 저장 처리
    try {
      if (saveId) {
        localStorage.setItem(SAVE_ID_FLAG_KEY, "true");
        localStorage.setItem(SAVE_ID_STORAGE_KEY, userId.trim());
      } else {
        localStorage.removeItem(SAVE_ID_FLAG_KEY);
        localStorage.removeItem(SAVE_ID_STORAGE_KEY);
      }
    } catch {
      // localStorage 접근 불가 시 무시
    }

    // 비밀번호가 dmes이면 mustChangePassword 체크를 위해 백엔드에 먼저 확인
    if (password === "dmes") {
      startTransition(async () => {
        // signIn을 시도해서 인증 자체는 되는지 확인
        const signInResponse = await signIn("credentials", {
          userId: userId.trim(),
          password,
          callbackUrl,
          redirect: false,
        });

        if (!signInResponse || signInResponse.error) {
          setErrorMessage("아이디 또는 비밀번호가 올바르지 않습니다.");
          return;
        }

        // 인증은 성공했지만 비밀번호가 dmes → 비밀번호 변경 강제
        setModalDefaultEmail(userId.trim());
        setModalDefaultPassword("dmes");
        setShowPasswordModal(true);
        setErrorMessage("비밀번호를 변경해주세요.");
      });
      return;
    }

    startTransition(async () => {
      const signInResponse = await signIn("credentials", {
        userId: userId.trim(),
        password,
        callbackUrl,
        redirect: false,
      });

      if (!signInResponse || signInResponse.error) {
        setErrorMessage("아이디 또는 비밀번호가 올바르지 않습니다.");
        return;
      }

      router.replace(signInResponse.url ?? callbackUrl);
      router.refresh();
    });
  }

  const handleOpenPasswordModal = useCallback(() => {
    setModalDefaultEmail(userId.trim());
    setModalDefaultPassword("");
    setShowPasswordModal(true);
  }, [userId]);

  const handleClosePasswordModal = useCallback(() => {
    setShowPasswordModal(false);
  }, []);

  const handlePasswordChangeSuccess = useCallback(() => {
    setPassword("");
    setErrorMessage(null);
  }, []);

  const handleResetSuccess = useCallback(() => {
    setSuccessMessage("초기화가 완료되었습니다.");
    setErrorMessage(null);
    setTimeout(() => setSuccessMessage(null), 3000);
  }, []);

  return (
    <div className="login-wrapper" style={{ backgroundImage: "url(/images/bg_login.png)" }}>
      <form className="login-form" onSubmit={handleSubmit}>
        <h2 className="login-title">Login</h2>

        <input
          id="login-user-id"
          type="text"
          className="login-input"
          placeholder="아이디"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          autoComplete="username"
        />

        <input
          id="login-password"
          type="password"
          className="login-input"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <div className="login-save-id">
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={saveId}
              onChange={(e) => setSaveId(e.target.checked)}
            />
            아이디 저장
          </label>
          <button
            type="button"
            className="login-change-pw"
            onClick={handleOpenPasswordModal}
          >
            비밀번호 변경
          </button>
        </div>

        {errorMessage && <div className="login-error">{errorMessage}</div>}
        {successMessage && <div className="login-success">{successMessage}</div>}

        <button type="submit" className="login-button" disabled={isPending}>
          {isPending ? "로그인 중..." : "로그인"}
        </button>

        <p className="login-copyright">
          Copyright &copy; 2019 DONGKUK CO.,LTD. All Right Reserved.
        </p>
      </form>

      {showPasswordModal && (
        <PasswordChangeModal
          defaultEmail={modalDefaultEmail}
          defaultCurrentPassword={modalDefaultPassword}
          onClose={handleClosePasswordModal}
          onSuccess={handlePasswordChangeSuccess}
          onResetSuccess={handleResetSuccess}
        />
      )}
    </div>
  );
}
