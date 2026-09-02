"use client";

import React, { useEffect, useRef, useMemo, memo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { generateId } from "../utils/libUtil";
import "./modal.css";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function useModalFocusContract(
  open: boolean,
  modalRef: React.RefObject<HTMLDivElement | null>,
  onClose?: () => void
) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // open 변화에만 의존한다. onClose가 매 렌더 새 함수여도 effect cleanup이
  // 재실행되어 이전 화면의 초점을 가로채지 않도록 최신 callback은 ref로 읽는다.
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      const dialog = modalRef.current;
      if (event.key !== "Tab" || !dialog) return;

      const focusableElements = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!activeElement || !dialog.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
        return;
      }

      if (event.shiftKey && (activeElement === firstElement || activeElement === dialog)) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (activeElement === lastElement || activeElement === dialog)) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    const focusFrameId = requestAnimationFrame(() => {
      const dialog = modalRef.current;
      if (!dialog) return;

      const firstFocusable = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        dialog.focus();
      }
    });

    return () => {
      cancelAnimationFrame(focusFrameId);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
    };
  }, [open, modalRef]);
}

export interface ModalProps {
  open: boolean;
  title?: string;
  /** ContentBody 상단 toolbar 슬롯 — A-BTN 정합 (예: 조회/행추가/행삭제). */
  toolbar?: ReactNode;
  children?: ReactNode;
  /** Modal Footer 슬롯 — dialog actions (예: 확인/취소). */
  footer?: ReactNode;
  onClose?: () => void;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showCloseButton?: boolean;
  /** body padding/스타일 추가 클래스. */
  bodyClassName?: string;
  /** dialog이 설명으로 참조할 소비처 본문 요소 ID. */
  descriptionId?: string;
}

function ModalComponent({
  open,
  title,
  toolbar,
  children,
  footer,
  onClose,
  className = "",
  size = "md",
  showCloseButton = true,
  bodyClassName = "",
  descriptionId,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const modalId = useMemo(() => generateId("modal"), []);
  useModalFocusContract(open, modalRef, onClose);

  if (!open || typeof document === "undefined") return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  return createPortal(
    <div className="cm-modal-overlay" onClick={handleOverlayClick}>
      <div
        ref={modalRef}
        className={`cm-modal cm-modal-${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? `${modalId}-title` : undefined}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        {title && (
          <div className="cm-modal-header">
            <h3 id={`${modalId}-title`} className="cm-modal-title">
              {title}
            </h3>
            {showCloseButton && (
              <button className="cm-modal-close" onClick={onClose} aria-label="닫기">
                &times;
              </button>
            )}
          </div>
        )}
        {toolbar && <div className="cm-modal-toolbar">{toolbar}</div>}
        <div className={`cm-modal-body ${bodyClassName}`.trim()}>{children}</div>
        {footer && <div className="cm-modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export const Modal = memo(ModalComponent);

export type AlertType = "info" | "warning" | "error" | "success" | "confirm";

export interface MessageModalProps {
  open: boolean;
  title?: string;
  message?: string | ReactNode;
  alertType?: AlertType;
  onClose: () => void;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
}

const COLOR_MAP: Record<AlertType, string> = {
  info: "#1976d2",
  warning: "#ed6c02",
  error: "#d32f2f",
  success: "#2e7d32",
  confirm: "var(--color-primary, #337ab7)",
};

export function MessageModal({
  open,
  title,
  message,
  alertType = "info",
  onClose,
  onConfirm,
  confirmText = "확인",
  cancelText = "취소",
}: MessageModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const modalId = useMemo(() => generateId("msg-modal"), []);
  const isConfirm = alertType === "confirm";
  useModalFocusContract(open, modalRef, onClose);

  // [확인] — onConfirm 만 호출한다. 모달 닫기는 provider 의 onConfirm(handleConfirm)이 담당하므로
  // 여기서 onClose() 를 부르지 않는다(부르면 confirm 의 onCancel 이 중복 발화되는 구버전 버그 발생).
  const handleConfirm = () => {
    onConfirm?.();
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="cm-modal-overlay cm-message-modal-overlay">
      <div
        ref={modalRef}
        className="cm-modal cm-modal-sm cm-message-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${modalId}-title`}
        aria-describedby={`${modalId}-message`}
        tabIndex={-1}
      >
        <div
          className="cm-modal-header cm-message-header"
          style={{ backgroundColor: COLOR_MAP[alertType] || COLOR_MAP.info }}
        >
          <h3 id={`${modalId}-title`} className="cm-modal-title">
            {title || (isConfirm ? "확인" : "알림")}
          </h3>
        </div>
        <div className="cm-modal-body cm-message-body">
          <div id={`${modalId}-message`} className="cm-message-content">
            {message}
          </div>
        </div>
        <div className="cm-modal-footer cm-message-footer">
          {isConfirm ? (
            <>
              <button className="cm-btn cm-btn-outline" onClick={onClose}>
                {cancelText}
              </button>
              <button className="cm-btn cm-btn-primary" onClick={handleConfirm}>
                {confirmText}
              </button>
            </>
          ) : (
            <button className="cm-btn cm-btn-primary" onClick={onClose}>
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
