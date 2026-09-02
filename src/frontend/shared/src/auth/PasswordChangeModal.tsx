"use client";

import { type FormEvent, useCallback, useState } from "react";

export interface PasswordChangeModalProps {
  defaultEmail?: string;
  defaultCurrentPassword?: string;
  onClose: () => void;
  onSuccess?: () => void;
  onResetSuccess?: () => void;
}

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "8자 이상 입력해주세요";
  if (!/[a-zA-Z]/.test(pw)) return "영문자를 포함해주세요";
  if (!/[0-9]/.test(pw)) return "숫자를 포함해주세요";
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(pw)) return "특수문자를 포함해주세요";
  return null;
}

export function PasswordChangeModal({
  defaultEmail = "",
  defaultCurrentPassword = "",
  onClose,
  onSuccess,
  onResetSuccess,
}: PasswordChangeModalProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [currentPassword, setCurrentPassword] = useState(defaultCurrentPassword);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setErrorMessage(null);
      setSuccessMessage(null);

      if (!email.trim()) { setErrorMessage("아이디를 입력하세요"); return; }
      if (!currentPassword) { setErrorMessage("기존 비밀번호를 입력하세요"); return; }

      const ruleError = validatePassword(newPassword);
      if (ruleError) { setErrorMessage(ruleError); return; }

      if (newPassword !== confirmPassword) {
        setErrorMessage("새 비밀번호가 일치하지 않습니다");
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await fetch("/api/auth/password", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            currentPassword,
            newPassword,
            confirmPassword,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setErrorMessage(data.error?.message ?? "비밀번호 변경에 실패했습니다");
          return;
        }
        setSuccessMessage("비밀번호가 변경되었습니다");
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 1200);
      } catch {
        setErrorMessage("서버 연결에 실패했습니다");
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, currentPassword, newPassword, confirmPassword, onClose, onSuccess]
  );

  const handleReset = useCallback(async () => {
    if (!email.trim()) { setErrorMessage("아이디를 입력하세요"); return; }
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message ?? "비밀번호 초기화에 실패했습니다");
        return;
      }
      onResetSuccess?.();
      setTimeout(() => {
        onClose();
      }, 500);
    } catch {
      setErrorMessage("서버 연결에 실패했습니다");
    } finally {
      setIsSubmitting(false);
    }
  }, [email]);

  return (
    <div className="pw-modal-overlay" onClick={onClose}>
      <div className="pw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pw-modal-header">
          <h3 className="pw-modal-title">비밀번호 변경</h3>
          <button type="button" className="pw-modal-close" onClick={onClose}>×</button>
        </div>

        <form className="pw-modal-body" onSubmit={handleSubmit}>
          <div className="pw-modal-field">
            <label>아이디</label>
            <input
              type="text"
              placeholder="아이디를 입력하세요"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="pw-modal-field">
            <label>기존 비밀번호</label>
            <input
              type="password"
              placeholder="기존 비밀번호를 입력하세요"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div className="pw-modal-field">
            <label>새 비밀번호</label>
            <input
              type="password"
              placeholder="새 비밀번호를 입력하세요"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="pw-modal-field">
            <label>새 비밀번호 확인</label>
            <input
              type="password"
              placeholder="새 비밀번호를 다시 입력하세요"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="pw-modal-rules">
            <p className="pw-modal-rules-title">비밀번호 규칙:</p>
            <ul>
              <li>8자 이상</li>
              <li>영문자 포함</li>
              <li>숫자 포함</li>
              <li>특수문자 포함</li>
            </ul>
          </div>

          {errorMessage && <div className="pw-modal-error">{errorMessage}</div>}
          {successMessage && <div className="pw-modal-success">{successMessage}</div>}

          <div className="pw-modal-footer">
            <button
              type="button"
              className="pw-modal-btn pw-modal-btn-reset"
              onClick={handleReset}
              disabled={isSubmitting}
            >
              비밀번호 초기화
            </button>
            <button
              type="submit"
              className="pw-modal-btn pw-modal-btn-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "처리 중..." : "변경"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
