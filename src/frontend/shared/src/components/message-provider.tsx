"use client";

import React, { createContext, useContext, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import { notifications } from "@mantine/notifications";
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

/**
 * tsup splitting:false 로 entry 별(예: message-provider / portal-shell) 모듈이 inline 중복되면
 * createContext 인스턴스가 갈라져 Provider ↔ Consumer 가 서로 다른 Context 를 참조한다
 * (증상: portal-shell 내부 소비자에서 "useMessage must be used within a MessageProvider").
 * tab-page-context.ts 관례대로 globalThis 캐싱으로 단일 인스턴스를 보장한다.
 */
const MESSAGE_CTX_KEY = "__dkOasisMessageContext__";

interface MessageCtxCache {
  [MESSAGE_CTX_KEY]?: ReturnType<typeof createContext<MessageContextValue | null>>;
}

const messageCtxCache = globalThis as unknown as MessageCtxCache;

const MessageContext =
  messageCtxCache[MESSAGE_CTX_KEY] ??
  (messageCtxCache[MESSAGE_CTX_KEY] = createContext<MessageContextValue | null>(null));

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

/** toast 색상 — `MessageModal` 의 `COLOR_MAP` 과 같은 의미값을 Mantine 색 이름으로. */
const TOAST_COLOR_MAP: Record<Exclude<AlertType, "confirm">, string> = {
  info: "dmes",
  warning: "orange",
  error: "danger",
  success: "green",
};

export function MessageProvider({ children }: { children: ReactNode }) {
  const [msgState, setMsgState] = useState<MsgState>({ open: false });
  // 현재 msgState 스냅샷 — handleClose/handleConfirm 이 setState 업데이터 밖(이벤트 핸들러
  // 스코프)에서 콜백을 호출하도록 참조로 보관한다("렌더 중 다른 컴포넌트 setState" 경고 방지).
  const msgStateRef = useRef<MsgState>(msgState);
  msgStateRef.current = msgState;

  const showMessage = useCallback(
    ({ title, message, alertType = "info", callback, onConfirm, onCancel, toast, toastDuration }: ShowMessageParams) => {
      if (toast && alertType !== "confirm") {
        notifications.show({
          title,
          message,
          color: TOAST_COLOR_MAP[alertType],
          autoClose: toastDuration ?? 3000,
          onClose: () => callback?.(),
        });
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

  // 렌더마다 새 객체를 넘기면 msgState 가 바뀔 때 useMessage 소비자 전체가 다시 그려진다.
  const contextValue = useMemo<MessageContextValue>(() => ({ showMessage }), [showMessage]);

  return (
    <MessageContext.Provider value={contextValue}>
      {children}
      <MessageModal
        open={msgState.open}
        title={msgState.title}
        message={msgState.message}
        alertType={msgState.alertType}
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    </MessageContext.Provider>
  );
}
