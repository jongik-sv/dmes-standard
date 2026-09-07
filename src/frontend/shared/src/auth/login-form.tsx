"use client";

import { signIn } from "next-auth/react";
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
import { PasswordChangeModal } from "./PasswordChangeModal";
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
      <Paper
        component="form"
        method="post"
        className="login-form"
        radius={0}
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
          size="md"
          radius={0}
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
          size="md"
          radius={0}
          visibilityToggleButtonProps={{ "aria-label": "비밀번호 표시 전환" }}
        />

        <Group className="login-save-id" justify="space-between" wrap="nowrap">
          <Checkbox
            label="아이디 저장"
            checked={saveId}
            onChange={(event) => setSaveId(event.currentTarget.checked)}
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
          size="md"
          h={45}
          radius={0}
          color="#1b3f7d"
        >
          {isPending ? "로그인 중..." : "로그인"}
        </Button>

        <Text component="p" className="login-copyright">
          {process.env.NEXT_PUBLIC_COPYRIGHT ?? `\u00a9 ${new Date().getFullYear()} ${appName}`}
        </Text>
      </Paper>

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
