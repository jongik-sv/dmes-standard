"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { MessageModal, type AlertType } from "./modal";

export interface ShowMessageParams {
  title?: string;
  message: string;
  alertType?: AlertType;
  callback?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  /**
   * true 면 모달 대신 자동으로 사라지는 토스트로 표시.
   * As-Is `gfn_commonBottomStatus_msg`(하단 상태바) 등가 — 확인 클릭이 필요 없는
   * 정보성 메시지(조회 건수 등) 용. alertType "confirm" 은 사용자의 선택이 필요하므로
   * toast 지정이 무시되고 모달로 표시된다.
   */
  toast?: boolean;
  /** 토스트 자동 닫힘 시간(ms). 기본 3000. toast: true 일 때만 사용. */
  toastDuration?: number;
}

interface MessageContextValue {
  showMessage: (params: ShowMessageParams) => void;
}

const MessageContext = createContext<MessageContextValue | null>(null);

export function useMessage(): MessageContextValue {
  const context = useContext(MessageContext);
  if (!context) {
    throw new Error("useMessage must be used within a MessageProvider");
  }
  return context;
}

export function useGfnMessage() {
  const { showMessage } = useMessage();

  const gfn_message = useCallback(
    (
      sMessageText: string,
      sParam: string = "",
      sDefault: string = "",
      sAlertType?: AlertType | "toast",
      sTitle?: string,
      fn_callback?: () => void,
      fn_cancel?: () => void,
    ) => {
      let message = sMessageText || sDefault;
      if (!message) return;

      if (sParam) message = message.replace("{0}", sParam);
      message = message.replaceAll("/n", "\n");

      const isToast = sAlertType === "toast";
      const alertType = isToast ? "info" : sAlertType || "info";
      const title = sTitle || (alertType === "confirm" ? "확인" : "알림");

      showMessage({
        title,
        message,
        alertType,
        toast: isToast,
        onConfirm: alertType === "confirm" ? fn_callback : undefined,
        onCancel: alertType === "confirm" ? fn_cancel : undefined,
        callback: alertType !== "confirm" ? fn_callback : undefined,
      });
    },
    [showMessage],
  );

  return gfn_message;
}

interface MsgState {
  open: boolean;
  title?: string;
  message?: string;
  alertType?: AlertType;
  callback?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  type: Exclude<AlertType, "confirm">;
}

export function MessageProvider({ children }: { children: ReactNode }) {
  const [msgState, setMsgState] = useState<MsgState>({ open: false });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeqRef = useRef(0);
  const toastTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  // 현재 msgState 스냅샷 — handleClose/handleConfirm 이 setState 업데이터 밖(이벤트 핸들러
  // 스코프)에서 콜백을 호출하도록 참조로 보관한다("렌더 중 다른 컴포넌트 setState" 경고 방지).
  const msgStateRef = useRef<MsgState>(msgState);
  msgStateRef.current = msgState;

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  const showMessage = useCallback(
    ({ title, message, alertType = "info", callback, onConfirm, onCancel, toast, toastDuration }: ShowMessageParams) => {
      if (toast && alertType !== "confirm") {
        const id = ++toastSeqRef.current;
        setToasts((prev) => [...prev, { id, message, type: alertType }]);
        const timer = setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
          toastTimersRef.current.delete(id);
          callback?.();
        }, toastDuration ?? 3000);
        toastTimersRef.current.set(id, timer);
        return;
      }
      setMsgState({ open: true, title, message, alertType, callback, onConfirm, onCancel });
    },
    [],
  );

  // [취소]/닫기(X·Esc·backdrop) — confirm 은 onCancel, 그 외는 callback 을 실행한다.
  // 콜백을 setState 업데이터 밖에서 호출해 "렌더 중 setState" 경고를 방지한다(구버전 버그).
  const handleClose = useCallback(() => {
    const cur = msgStateRef.current;
    setMsgState({ open: false });
    if (cur.alertType === "confirm") cur.onCancel?.();
    else cur.callback?.();
  }, []);

  // [확인] — confirm 의 onConfirm 만 실행한다(onCancel 은 실행하지 않는다). 모달 닫기도 여기서 담당.
  const handleConfirm = useCallback(() => {
    const cur = msgStateRef.current;
    setMsgState({ open: false });
    cur.onConfirm?.();
  }, []);

  return (
    <MessageContext.Provider value={{ showMessage }}>
      {children}
      <MessageModal
        open={msgState.open}
        title={msgState.title}
        message={msgState.message}
        alertType={msgState.alertType}
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
      {toasts.length > 0 && (
        <div className="cm-toast-container" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`cm-toast cm-toast-${t.type}`} role="status">
              {t.message}
            </div>
          ))}
        </div>
      )}
    </MessageContext.Provider>
  );
}
