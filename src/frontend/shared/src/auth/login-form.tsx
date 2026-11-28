"use client";

import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState, useTransition } from "react";
import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Group,
  Paper,
  PasswordInput,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { clearCurrentUserCache } from "../portal-shell/current-user";
import { resetPortalSessionState } from "../portal-shell/start-pages";
import { PasswordChangeModal } from "./PasswordChangeModal";
import { changeNotice, parseLoginError } from "./login-reason";
import "./login-form.css";

const SAVE_ID_STORAGE_KEY = "oasis.login.savedUserId";
const SAVE_ID_FLAG_KEY = "oasis.login.saveIdEnabled";
const BACKEND_API_URL = ""; // 프론트 프록시 경유

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
  // 2026-11-28 — 바꾸기 전에는 못 들어가는 변경 창(임시 비밀번호·사용 기간 지남). 닫을 수 없고 「취소」는 로그인 화면으로.
  const [mandatoryNotice, setMandatoryNotice] = useState<string | null>(null);
  // 만료 N일 전 알림 — 로그인은 됐고, 홈으로 가기 전에 한 번 묻는다
  const [expiryDaysLeft, setExpiryDaysLeft] = useState<number | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  // hydration 이전에는 handleSubmit 의 preventDefault 가 아직 붙지 않아, 제출이
  // 네이티브 GET 으로 나가 비밀번호가 쿼리스트링에 노출될 수 있다(e2e 실측:
  // portal-tab-history.spec.ts 가 domcontentloaded 직후 클릭). hydration 완료
  // 전까지는 submit 버튼을 비활성화해 이 창구를 막는다.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

    // 2026-11-28 — 비밀번호 글자("dmes") 비교를 지웠다. 변경 창은 서버 응답(A011·A012)으로만 연다.
    const id = userId.trim();
    const pw = password;
    startTransition(async () => {
      await signInAndGo(id, pw);
    });
  }

  /** 로그인 → 사유별 안내 또는 변경 창 → 성공이면 (만료 전 알림 뒤) 홈으로. */
  async function signInAndGo(id: string, pw: string) {
    const signInResponse = await signIn("credentials", {
      userId: id,
      password: pw,
      callbackUrl,
      redirect: false,
    });

    if (!signInResponse || signInResponse.error) {
      const { code, message } = parseLoginError(signInResponse?.error);
      if (code === "A011" || code === "A012") {
        setModalDefaultEmail(id);
        setModalDefaultPassword(pw);
        setMandatoryNotice(changeNotice(code, message));
        setShowPasswordModal(true);
        setErrorMessage(null);
        return;
      }
      setErrorMessage(message);
      return;
    }

    const target = signInResponse.url ?? callbackUrl;
    try {
      const session = (await getSession()) as { pwdExpiresInDays?: number } | null;
      if (session && typeof session.pwdExpiresInDays === "number") {
        setPendingUrl(target);
        setExpiryDaysLeft(session.pwdExpiresInDays);
        setModalDefaultEmail(id);
        setModalDefaultPassword(pw);
        return;
      }
    } catch {
      // 알림을 못 읽어도 로그인은 이어 간다
    }
    goHome(target);
  }

  function goHome(target: string) {
    // 클라이언트 이동이라 이전 화면의 사용자·RBAC 캐시가 남을 수 있다 — 새 사용자로 다시 확인하게 비운다(K3).
    clearCurrentUserCache();
    // 로그인 직후에는 홈 + 기본 화면만 연다 — 이전 세션에 남은 탭과 기본 화면 표지를 비운다(새로고침은 영향 없음).
    resetPortalSessionState();
    router.replace(target);
    router.refresh();
  }

  const handleOpenPasswordModal = useCallback(() => {
    setModalDefaultEmail(userId.trim());
    setModalDefaultPassword("");
    setShowPasswordModal(true);
  }, [userId]);

  const handleClosePasswordModal = useCallback(() => {
    setShowPasswordModal(false);
    if (mandatoryNotice) {
      // 「취소」 — 로그인 화면으로 돌아간다(세션은 처음부터 없다)
      setMandatoryNotice(null);
      setPassword("");
    }
    if (pendingUrl) {
      // 만료 전 알림에서 「지금 바꾸기」를 열었다가 닫음 — 그대로 들어간다
      const url = pendingUrl;
      setPendingUrl(null);
      goHome(url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandatoryNotice, pendingUrl]);

  const handlePasswordChangeSuccess = useCallback(
    (newPassword: string) => {
      setPassword("");
      setErrorMessage(null);
      if (mandatoryNotice) {
        // 바꾼 비밀번호로 바로 로그인한다 — 세션은 이때 처음 생긴다
        const id = modalDefaultEmail;
        setMandatoryNotice(null);
        setShowPasswordModal(false);
        startTransition(async () => {
          await signInAndGo(id, newPassword);
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mandatoryNotice, modalDefaultEmail]
  );

  const handleResetSuccess = useCallback(() => {
    setSuccessMessage("초기화가 완료되었습니다.");
    setErrorMessage(null);
    setTimeout(() => setSuccessMessage(null), 3000);
  }, []);

  return (
    <div className="login-wrapper" style={{ backgroundImage: "url(/images/bg_login.png)" }}>
      {/* 배경 이미지(bg_login.png)에 새겨진 "Digital Manufacturing" 제목 아래 빈 영역에
          카드를 놓기 위한 배치 슬롯. 위치 계산은 login-form.css 의 .login-card-slot 참고. */}
      <div className="login-card-slot">
        <Paper
          component="form"
          method="post"
          className="login-form"
          radius="md"
          onSubmit={handleSubmit}
        >
          <Title order={2} className="login-title">
            Login
          </Title>

          <TextInput
            id="login-user-id"
            name="userId"
            label="아이디"
            aria-label="User ID"
            className="login-input"
            placeholder="아이디"
            value={userId}
            onChange={(event) => setUserId(event.currentTarget.value)}
            autoComplete="username"
            size="sm"
            radius="sm"
            disabled={!mounted}
          />

          <PasswordInput
            id="login-password"
            name="password"
            label="비밀번호"
            aria-label="Password"
            className="login-input"
            placeholder="비밀번호"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            autoComplete="current-password"
            size="sm"
            radius="sm"
            disabled={!mounted}
            visibilityToggleButtonProps={{ "aria-label": "비밀번호 표시 전환" }}
          />

          <Group className="login-save-id" justify="space-between" wrap="nowrap">
            <Checkbox
              label="아이디 저장"
              checked={saveId}
              onChange={(event) => setSaveId(event.currentTarget.checked)}
              disabled={!mounted}
            />
            <Anchor
              component="button"
              type="button"
              className="login-change-pw"
              onClick={handleOpenPasswordModal}
            >
              비밀번호 변경
            </Anchor>
          </Group>

          {errorMessage && (
            <Alert color="danger" className="login-error" variant="light" p="xs">
              {errorMessage}
            </Alert>
          )}
          {successMessage && (
            <Alert color="green" className="login-success" variant="light" p="xs">
              {successMessage}
            </Alert>
          )}

          <Button
            type="submit"
            className="login-button"
            fullWidth
            disabled={isPending || !mounted}
            size="sm"
            h={38}
            radius="sm"
            color="loginBrand"
          >
            {isPending ? "로그인 중..." : "로그인"}
          </Button>

          <Text component="p" className="login-copyright">
            {process.env.NEXT_PUBLIC_COPYRIGHT ?? `\u00a9 ${new Date().getFullYear()} ${appName}`}
          </Text>
        </Paper>
      </div>

      {showPasswordModal && (
        <PasswordChangeModal
          defaultEmail={modalDefaultEmail}
          defaultCurrentPassword={modalDefaultPassword}
          onClose={handleClosePasswordModal}
          onSuccess={handlePasswordChangeSuccess}
          onResetSuccess={handleResetSuccess}
          mandatory={mandatoryNotice !== null}
          notice={mandatoryNotice ?? undefined}
          hideCurrentPassword={mandatoryNotice !== null || pendingUrl !== null}
        />
      )}

      {expiryDaysLeft !== null && !showPasswordModal && (
        <div className="pw-modal-overlay">
          <div className="pw-modal" role="dialog" aria-modal="true">
            <div className="pw-modal-header">
              <h3 className="pw-modal-title">비밀번호 사용 기간</h3>
            </div>
            <div className="pw-modal-body">
              <div className="pw-modal-notice">
                비밀번호 사용 기간이 {expiryDaysLeft}일 남았습니다. 지금 바꿀 수 있습니다.
              </div>
              <div className="pw-modal-footer">
                <button
                  type="button"
                  className="pw-modal-btn pw-modal-btn-reset"
                  onClick={() => {
                    const url = pendingUrl ?? callbackUrl;
                    setExpiryDaysLeft(null);
                    setPendingUrl(null);
                    goHome(url);
                  }}
                >
                  나중에
                </button>
                <button
                  type="button"
                  className="pw-modal-btn pw-modal-btn-submit"
                  onClick={() => {
                    setExpiryDaysLeft(null);
                    setShowPasswordModal(true);
                  }}
                >
                  지금 바꾸기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
