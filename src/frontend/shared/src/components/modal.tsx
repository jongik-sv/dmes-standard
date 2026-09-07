"use client";

import { memo, useCallback, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Modal as M, Button } from "@mantine/core";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconHelp,
  IconInfoCircle,
} from "@tabler/icons-react";
import clsx from "clsx";
import "./modal.css";

const SIZE = { sm: "sm", md: "md", lg: "lg", xl: "xl" } as const;

/** dialog 내부에서 초점 이동 대상을 찾을 때 쓰는 selector — 기존 커스텀 구현과 동일 기준. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Mantine `Modal`(FocusTrap/useFocusReturn/useWindowEvent) 은 초점 트랩·ESC·초점 복귀를 제공하지만,
 * 이 저장소의 `modal-a11y.unit.test.ts` 계약(동기 단언, `event.defaultPrevented`, "첫 focusable 로
 * 즉시 이동")과 Mantine 9.6 구현 사이에 다음 지점이 어긋난다(team-lead 보고 완료, props 로 해결 불가
 * 확인됨 — 소스: use-modal.mjs, use-focus-trap.mjs, use-focus-return.mjs, Portal.mjs):
 * 1. 초기 초점 이동(`useFocusTrap`)과 초점 복귀(`useFocusReturn`)가 `setTimeout` 매크로태스크로
 *    지연되어, 동기 assertion 에서는 아직 반영되지 않는다.
 * 2. Escape 핸들러(`useWindowEvent`)가 `onClose()` 만 호출하고 `event.preventDefault()` 를 하지 않는다.
 *    게다가 `event.target?.getAttribute(...)` 를 무조건 호출해서, keydown 이 (테스트처럼) `document`
 *    자체에 dispatch 되면 `document` 에는 `getAttribute` 가 없어 TypeError 로 죽는다.
 * 3. `scopeTab` 은 활성 요소가 dialog 밖에 있고 "마지막/첫 tabbable" 도 아니면 아무 것도 하지 않고
 *    반환한다 — Tab 방향에 맞춰 안으로 되돌리는 보정이 없다.
 * 4. Mantine `Modal` 은 `Portal` 로 렌더하는데 `Portal` 은 최초 렌더에서 아무 것도 그리지 않고
 *    (`useState(false)`) 자신의 `useLayoutEffect` 에서 동기 재렌더로 실제 DOM 을 만든다. 이 재렌더
 *    횟수는 콘텐츠 구성에 따라 달라져(예: `MessageModal` 처럼 `titleMounted`/`bodyMounted` 컨텍스트
 *    소비가 얽히면) 상위 컴포넌트의 `useEffect`/`useLayoutEffect` 하나로는 "실제 DOM 이 완성된 시점"을
 *    안정적으로 잡을 수 없다. 그래서 `Modal.Content` 의 **ref 콜백**(해당 DOM 노드가 실제로 커밋되는
 *    바로 그 순간 동기 호출됨)에서 초기 초점·리스너 등록을 수행한다.
 * 그래서 기존(레거시) 초점 계약 훅을 이 모델로 이식해 Mantine 과 병행 구동한다. Escape 는 (2) 때문에
 * Mantine 쪽에 맡길 수 없어 `useEscapeCompat` 이 전담한다(아래).
 */
function useModalA11yCompat(open: boolean, descriptionId?: string) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const keydownHandlerRef = useRef<((event: KeyboardEvent) => void) | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const descriptionIdRef = useRef(descriptionId);
  descriptionIdRef.current = descriptionId;
  const openRef = useRef(open);
  openRef.current = open;

  // `Modal.Content` 는 `bodyMounted` 컨텍스트가 바뀔 때마다 `aria-describedby` 를 자체 계산해
  // 다시 쓴다. 그 재렌더는 우리가 `children` 으로 넘긴 하위 트리를 (참조가 그대로라) 건드리지 않고
  // `Modal.Content` 자신만 다시 렌더하므로, 그 안에 있는 어떤 React effect 로도 "그다음 순간"을
  // 잡을 수 없다 — 대신 DOM 자체를 관찰해 값이 바뀔 때마다 즉시 되돌린다.
  const applyDescribedBy = useCallback(() => {
    const node = dialogRef.current;
    if (!node) return;
    const want = descriptionIdRef.current ?? null;
    if (node.getAttribute("aria-describedby") !== want) {
      if (want) node.setAttribute("aria-describedby", want);
      else node.removeAttribute("aria-describedby");
    }
  }, []);

  const setDialogRef = useCallback((node: HTMLElement | null) => {
    dialogRef.current = node;
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;

    // Mantine Transition 의 exit 시퀀스가 (테스트의 rAF 동기 스텁과 맞물리면) `flushSync` 를
    // 잘못된 시점에 호출해 이미 닫힌 뒤에도 `Modal.Content` 를 스퓨리어스하게 재마운트시킬 수 있다.
    // 이 순간의 `open` 이 이미 false 라면 초기 초점 이동 등 "여는 중" 셋업을 하지 않는다.
    if (!openRef.current) return;

    applyDescribedBy();
    if (typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver(applyDescribedBy);
      observer.observe(node, { attributes: true, attributeFilter: ["aria-describedby"] });
      observerRef.current = observer;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
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
        // Mantine scopeTab 은 dialog 밖으로 이탈한 초점을 되돌리지 않는다 — 여기서 보정한다.
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

    keydownHandlerRef.current = handleKeyDown;
    document.addEventListener("keydown", handleKeyDown);

    // ref 콜백은 dialog DOM 노드가 실제로 커밋되는 순간 동기 호출되므로, 한 프레임 미루지 않고
    // 바로 초점을 옮겨도 안전하다(오히려 Mantine Transition 이 내부적으로 쓰는
    // `requestAnimationFrame`/`flushSync` 시퀀스와 얽히지 않아 더 안정적이다).
    const firstFocusable = node.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? node).focus();
  }, [applyDescribedBy]);

  // descriptionId 자체가 열린 상태에서 바뀌는 경우 — 속성 변화가 아니라 prop 변화라
  // MutationObserver 가 잡지 못하므로 직접 재적용한다.
  useLayoutEffect(() => {
    applyDescribedBy();
  }, [descriptionId, applyDescribedBy]);

  // open → false 전환(또는 unmount) 시 리스너/observer 해제.
  // Mantine Transition 의 exit 애니메이션(기본 200ms) 과 무관하게, 이 컴포넌트의 open prop 이
  // 바뀌는 바로 그 커밋에서 동기 실행되어야 하므로 layout effect 로 둔다.
  useLayoutEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (keydownHandlerRef.current) {
        document.removeEventListener("keydown", keydownHandlerRef.current);
        keydownHandlerRef.current = null;
      }
    };
  }, [open]);

  // 이전 초점 캡처/복귀는 ref 콜백(= Modal.Content DOM 마운트 시점)이 아니라 이 컴포넌트의 open
  // prop 전환에 직접 묶는다. Mantine Transition 은 (테스트의 rAF 동기 스텁과 맞물리면) exit 전환
  // 중 `flushSync` 를 잘못된 시점에 호출해 `Modal.Content` 를 한 번 더 마운트/언마운트(또는 FocusTrap
  // 의 ref 재부착)시킬 수 있는데, ref 콜백에 의존하면 그 잡음까지 "previousFocus" 로 잘못 캡처한다.
  // open 은 우리 컴포넌트 자신의 prop 이라 그 잡음과 무관하게 안정적이다.
  useLayoutEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return () => {
      if (!previousFocus?.isConnected) return;
      previousFocus.focus();

      // Watchdog — 위 복귀 직후, 같은 동기 구간 안에서 Mantine 쪽의 잔여 오동작(위 flushSync
      // 오용)이 focus 를 다시 가로채는 경우가 있다(테스트 환경 한정 — 실제 브라우저의 진짜 비동기
      // rAF/setTimeout 에서는 재현되지 않는다). 같은 tick 에서 발생하는 focusin 만 되돌리고,
      // microtask 이후에는 정상적인(모달과 무관한) 후속 초점 이동을 막지 않도록 즉시 해제한다.
      const handleFocusIn = () => {
        if (document.activeElement !== previousFocus && previousFocus.isConnected) {
          previousFocus.focus();
        }
      };
      document.addEventListener("focusin", handleFocusIn, true);
      queueMicrotask(() => document.removeEventListener("focusin", handleFocusIn, true));
    };
  }, [open]);

  return { setDialogRef };
}

/**
 * Escape 전담 처리. Mantine 내부 `useWindowEvent` 핸들러는 `window` 캡처 단계에서 등록되고
 * `event.target?.getAttribute(...)` 를 무조건 호출하므로, keydown 이 `document` 자체에 dispatch 되면
 * (이 저장소 `modal-a11y.unit.test.ts` 의 `dispatchKey` 가 그렇게 한다) `document` 에는 `getAttribute`
 * 가 없어 TypeError 로 죽는다. 실제 서비스에서는 keydown 이 항상 포커스를 가진 특정 Element 를
 * target 으로 하므로 발생하지 않는 문제지만, 계약 테스트가 이 경로를 쓰는 한 우리가 선제 차단해야
 * 한다. `window` 캡처 단계에 우리 리스너를 **layout effect** 로 등록해 Mantine 의 것(passive
 * `useEffect`)보다 먼저 붙게 하고, `stopImmediatePropagation` 으로 Mantine 핸들러 실행 자체를
 * 막은 뒤 onClose 호출까지 직접 담당한다(중복 호출 없음 — Mantine 쪽은 아예 실행되지 않는다).
 */
function useEscapeCompat(open: boolean, onClose?: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onCloseRef.current?.();
    };

    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [open]);
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

/** `MessageModal` 전용으로 overlay 에 e2e 클래스(`cm-message-modal-overlay`)를 추가하기 위한 내부 구현.
 *  공개 `ModalProps` 계약에는 없는 필드라 export 하지 않는다. */
function ModalImpl({
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
  overlayClassName = "",
}: ModalProps & { overlayClassName?: string }) {
  const { setDialogRef } = useModalA11yCompat(open, descriptionId);
  useEscapeCompat(open, onClose);

  return (
    <M.Root opened={open} onClose={onClose ?? (() => {})} size={SIZE[size]} centered>
      <M.Overlay className={clsx("cm-modal-overlay", "modal-overlay", overlayClassName)} />
      <M.Content ref={setDialogRef} className={clsx("cm-modal", className)}>
        {(title || showCloseButton) && (
          <M.Header className="cm-modal-header">
            <M.Title className="cm-modal-title">{title}</M.Title>
            {showCloseButton && <M.CloseButton aria-label="닫기" />}
          </M.Header>
        )}
        {/* Mantine `Modal.Body` 대신 순수 div — `M.Body` 는 마운트 시 `bodyMounted` 컨텍스트를
            true 로 바꿔 `Modal.Content` 의 `aria-describedby` 를 자체 id 로 재계산·재렌더한다(위
            useModalA11yCompat 주석 참고). 그 재계산은 매 렌더 `undefined` 로 안정되어야 우리가
            직접 지정한 `descriptionId` 가 이후 재렌더에도 유지된다. 패딩/스크롤은 modal.css 의
            `.cm-modal-body` 가 전담(Mantine CSS 모듈 훅이 아니므로 여기 의존한다). */}
        <div className={clsx("cm-modal-body", bodyClassName)}>
          {toolbar && <div className="cm-modal-toolbar">{toolbar}</div>}
          {children}
          {footer && <div className="cm-modal-footer">{footer}</div>}
        </div>
      </M.Content>
    </M.Root>
  );
}

function ModalComponent(props: ModalProps) {
  return <ModalImpl {...props} />;
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

const ICON_MAP: Record<AlertType, typeof IconInfoCircle> = {
  info: IconInfoCircle,
  warning: IconAlertTriangle,
  error: IconCircleX,
  success: IconCircleCheck,
  confirm: IconHelp,
};

const COLOR_MAP: Record<AlertType, string> = {
  info: "blue",
  warning: "orange",
  error: "danger",
  success: "green",
  confirm: "dmes",
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
  const isConfirm = alertType === "confirm";
  const Icon = useMemo(() => ICON_MAP[alertType] ?? ICON_MAP.info, [alertType]);
  const color = COLOR_MAP[alertType] ?? COLOR_MAP.info;

  // [확인] — onConfirm 만 호출한다. 모달 닫기는 provider 의 onConfirm(handleConfirm)이 담당하므로
  // 여기서 onClose() 를 부르지 않는다(부르면 confirm 의 onCancel 이 중복 발화되는 구버전 버그 발생).
  const handleConfirm = () => {
    onConfirm?.();
  };

  return (
    <ModalImpl
      open={open}
      onClose={onClose}
      size="sm"
      className="cm-message-modal"
      overlayClassName="cm-message-modal-overlay"
      showCloseButton={false}
      title={title || (isConfirm ? "확인" : "알림")}
      footer={
        isConfirm ? (
          <>
            <Button className="cm-btn cm-btn-outline" variant="default" onClick={onClose}>
              {cancelText}
            </Button>
            <Button className="cm-btn cm-btn-primary" color={color} autoFocus onClick={handleConfirm}>
              {confirmText}
            </Button>
          </>
        ) : (
          <Button className="cm-btn cm-btn-primary" color={color} autoFocus onClick={onClose}>
            {confirmText}
          </Button>
        )
      }
    >
      <div className="cm-message-content">
        <Icon size={20} className="cm-message-icon" color={`var(--mantine-color-${color}-6)`} />
        <div className="cm-message-text">{message}</div>
      </div>
    </ModalImpl>
  );
}
