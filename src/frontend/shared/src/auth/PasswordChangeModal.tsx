"use client";

import { type FormEvent, useCallback, useState } from "react";

export interface PasswordChangeModalProps {
  defaultEmail?: string;
  defaultCurrentPassword?: string;
  onClose: () => void;
  /** 바꾼 새 비밀번호를 넘긴다 — 첫 로그인 변경 뒤 자동 로그인에 쓴다. */
  onSuccess?: (newPassword: string) => void;
  onResetSuccess?: () => void;
  /**
   * 바꾸기 전에는 들어갈 수 없는 변경(임시 비밀번호·사용 기간 지남). 닫기(×)·바깥 누르기로 닫히지 않고,
   * 「취소」가 로그인 화면으로 돌아간다. 비밀번호 초기화 버튼은 숨긴다.
   */
  mandatory?: boolean;
  /** 창 맨 위 안내 문구(왜 바꾸는지). */
  notice?: string;
  /** 아이디·기존 비밀번호 칸을 숨긴다 — 로그인 화면에서 방금 입력한 값으로 채운 경우. */
  hideCurrentPassword?: boolean;
}

/**
 * 화면 쪽 규칙 — 서버 규칙(mcm.password.min-length 8 · 영문+숫자, 2026-11-28 D11)과 같다.
 * 임시 비밀번호 금지·최근 5개 재사용 금지는 서버만 안다(값을 화면에 두지 않는다).
 */
export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "8자 이상 입력해주세요";
  if (!/[a-zA-Z]/.test(pw)) return "영문자를 포함해주세요";
  if (!/[0-9]/.test(pw)) return "숫자를 포함해주세요";
  return null;
}

export function PasswordChangeModal({
  defaultEmail = "",
  defaultCurrentPassword = "",
  onClose,
  onSuccess,
  onResetSuccess,
  mandatory = false,
  notice,
  hideCurrentPassword = false,
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
        if (mandatory) {
          // 첫 로그인 변경 — 부르는 쪽이 새 비밀번호로 바로 로그인한다(창은 부르는 쪽이 닫는다)
          onSuccess?.(newPassword);
          return;
        }
        setTimeout(() => {
          onSuccess?.(newPassword);
          onClose();
        }, 1200);
      } catch {
        setErrorMessage("서버 연결에 실패했습니다");
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, currentPassword, newPassword, confirmPassword, onClose, onSuccess, mandatory]
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
    <div className="pw-modal-overlay" onClick={mandatory ? undefined : onClose}>
      <div className="pw-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="pw-modal-header">
          <h3 className="pw-modal-title">비밀번호 변경</h3>
          {!mandatory && <button type="button" className="pw-modal-close" onClick={onClose}>×</button>}
        </div>
        <form className="pw-modal-body" onSubmit={handleSubmit}>
          {notice && <div className="pw-modal-notice">{notice}</div>}
          {!hideCurrentPassword && <>
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
          </>}

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
              <li>최근에 쓴 비밀번호·임시 비밀번호는 쓸 수 없음</li>
            </ul>
          </div>

          {errorMessage && <div className="pw-modal-error">{errorMessage}</div>}
          {successMessage && <div className="pw-modal-success">{successMessage}</div>}

          <div className="pw-modal-footer">
            {mandatory ? (
              <button
                type="button"
                className="pw-modal-btn pw-modal-btn-reset"
                onClick={onClose}
                disabled={isSubmitting}
              >
                취소
              </button>
            ) : (
              <button
                type="button"
                className="pw-modal-btn pw-modal-btn-reset"
                onClick={handleReset}
                disabled={isSubmitting}
              >
                비밀번호 초기화
              </button>
            )}
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
