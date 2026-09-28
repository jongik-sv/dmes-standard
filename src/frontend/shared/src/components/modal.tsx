"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Modal as M, Button } from "@mantine/core";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconHelp,
  IconInfoCircle,
} from "@tabler/icons-react";
import clsx from "clsx";
import { CopyTextButton } from "./copy-text-button";
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
 * 2. Escape 핸들러(`useWindowEvent`)가 `onClose()` 는 정확히 호출하지만 `event.preventDefault()` 를
 *    하지 않는다 — `preventDefault()` 만 `useEscapeCompat` 이 보강하고 `onClose` 호출은 Mantine 에
 *    맡긴다(아래 `useEscapeCompat` 참고).
 * 3. `scopeTab` 은 활성 요소가 dialog 밖에 있고 "마지막/첫 tabbable" 도 아니면 아무 것도 하지 않고
 *    반환한다 — Tab 방향에 맞춰 안으로 되돌리는 보정이 없다.
 * 4. Mantine `Modal` 은 `Portal` 로 렌더하는데 `Portal` 은 최초 렌더에서 아무 것도 그리지 않고
 *    (`useState(false)`) 자신의 `useLayoutEffect` 에서 동기 재렌더로 실제 DOM 을 만든다. 이 재렌더
 *    횟수는 콘텐츠 구성에 따라 달라져(예: `MessageModal` 처럼 `titleMounted`/`bodyMounted` 컨텍스트
 *    소비가 얽히면) 상위 컴포넌트의 `useEffect`/`useLayoutEffect` 하나로는 "실제 DOM 이 완성된 시점"을
 *    안정적으로 잡을 수 없다. 그래서 `Modal.Content` 의 **ref 콜백**(해당 DOM 노드가 실제로 커밋되는
 *    바로 그 순간 동기 호출됨)에서 초기 초점·리스너 등록을 수행한다.
 * 5. React 자신의 커밋 내장 동작 하나가 초점 복귀와 충돌한다 — 아래 "이전 초점 캡처/복귀" 부분의
 *    주석 참고(이건 Mantine 문제가 아니라 React 자체 문제라 별도로 적었다).
 * 그래서 기존(레거시) 초점 계약 훅을 이 모델로 이식해 Mantine 과 병행 구동한다.
 */
function useModalA11yCompat(open: boolean, descriptionId?: string) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const keydownHandlerRef = useRef<((event: KeyboardEvent) => void) | null>(null);
  const descriptionIdRef = useRef(descriptionId);
  descriptionIdRef.current = descriptionId;
  const openRef = useRef(open);
  openRef.current = open;

  // `Modal.Content` 는 `bodyMounted` 컨텍스트가 true 가 될 때 `aria-describedby` 를 자체 계산해
  // 다시 쓴다. `Modal.Body` 를 쓰지 않는 한(아래 ModalImpl 참고) `bodyMounted` 는 계속 false 로
  // 남아 이 재계산이 항상 `undefined` 로 안정되므로, 마운트 시 한 번만 적용하면 이후 재렌더에도
  // 우리 값이 유지된다(실측 확인 — `Modal.Body` 를 쓰면 이 가정이 깨진다).
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
    if (!node) return;

    // Mantine Transition 의 exit 시퀀스가 (테스트의 rAF 동기 스텁과 맞물리면) `flushSync` 를
    // 잘못된 시점에 호출해 이미 닫힌 뒤에도 `Modal.Content` 를 스퓨리어스하게 재마운트시킬 수 있다.
    // 이 순간의 `open` 이 이미 false 라면 초기 초점 이동 등 "여는 중" 셋업을 하지 않는다.
    if (!openRef.current) return;

    applyDescribedBy();

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

  // descriptionId 자체가 열린 상태에서 바뀌는 경우(드묾) 재적용한다.
  useLayoutEffect(() => {
    applyDescribedBy();
  }, [descriptionId, applyDescribedBy]);

  // open → false 전환(또는 unmount) 시 리스너 해제.
  // Mantine Transition 의 exit 애니메이션(기본 200ms) 과 무관하게, 이 컴포넌트의 open prop 이
  // 바뀌는 바로 그 커밋에서 동기 실행되어야 하므로 layout effect 로 둔다.
  useLayoutEffect(() => {
    return () => {
      if (keydownHandlerRef.current) {
        document.removeEventListener("keydown", keydownHandlerRef.current);
        keydownHandlerRef.current = null;
      }
    };
  }, [open]);

  // 이전 초점 캡처/복귀는 ref 콜백(= Modal.Content DOM 마운트 시점)이 아니라 이 컴포넌트의 open
  // prop 전환에 직접 묶는다 — open 은 우리 컴포넌트 자신의 prop 이라 Mantine 내부 DOM churn 과
  // 무관하게 안정적으로 캡처된다.
  //
  // **왜 layout effect 가 아니라 effect(passive) 인가**: React 는 커밋의 mutation phase 가 끝나면
  // "이 커밋 시작 시점에 포커스돼 있던 요소"(commitBeforeMutationEffects 에서 캡처)와 "지금 실제로
  // 포커스된 요소"를 비교해, 둘이 다르고 캡처된 요소가 아직 문서에 붙어 있으면 그 요소로 강제로
  // `.focus()`를 다시 호출하는 내장 로직이 있다(react-dom-client.development.js 의
  // `flushMutationEffects`, 이른바 focus/selection 보존 — 텍스트 인풋 전용이 아니라 어떤 요소든
  // `focus` 메서드만 있으면 적용된다. Mantine 과 무관한 React 자체 동작이다). Modal 이 닫힐 때
  // Mantine 의 기본 exit transition(200ms) 때문에 `Modal.Content` DOM 은 그 커밋에서 즉시 사라지지
  // 않고 그대로 붙어 있으므로, "이 커밋 시작 시점에 포커스돼 있던" 다이얼로그 내부 버튼이 여전히
  // 문서에 남아 이 복원 대상이 된다. 이 복원 로직은 mutation phase 끝(=layout effect 들이 실행되기
  // 바로 직전) 에 실행되므로, 우리가 layout effect 의 cleanup 에서 `previousFocus.focus()`를 불러도
  // (그 자체는 mutation phase 도중의 layout-effect-unmount 처리 중에 실행됨) 그 직후 React 의 복원
  // 로직이 "커밋 시작 시점 포커스 요소"로 다시 덮어써 버린다 — 실측: `focus()`를 몽키패치해 호출
  // 스택을 확인, `flushMutationEffects` 가 다이얼로그 내부 버튼에 `.focus()`를 다시 호출하는 것을
  // 직접 확인했다. 이 순서는 Mantine/rAF/Transition 타이밍과 무관하게 React 자체 커밋 구조상
  // 항상 이렇게 되므로, 실제 브라우저(비 테스트 환경)에서도 재현되는 진짜 문제다(이전에 이 사실을
  // "테스트 환경 한정" 이라 잘못 판단해 focusin watchdog 으로 덮어 뒀던 것을 team-lead 리뷰로 걷어내며
  // 재조사해 알아냈다). 해결책은 우리 복원을 React 의 그 복원 로직보다 **뒤에** 실행시키는 것 —
  // passive effect(`useEffect`)는 mutation/layout phase 가 모두 끝난 뒤(페인트 이후) 실행되므로,
  // 여기서 `.focus()`를 부르면 항상 마지막 발언권을 갖는다.
  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return () => {
      if (!previousFocus?.isConnected) return;
      previousFocus.focus();
    };
  }, [open]);

  return { setDialogRef };
}

/**
 * Escape 보정. Mantine 내부 `useWindowEvent` 핸들러(`window` 캡처 단계, `useEffect`=passive 라
 * 우리 아래 `useLayoutEffect` 보다 항상 나중에 등록된다)는 `event.preventDefault()` 를 호출하지
 * 않는다 — 이 저장소의 `modal-a11y.unit.test.ts` 계약("Escape 를 누르면 `defaultPrevented`
 * 여야 한다")을 만족시키려면 우리가 대신 호출해야 한다. `onClose` 호출 자체는 Mantine 의 핸들러가
 * `event.isComposing`(한글 입력 중 Escape 로 조합을 취소하는 IME 케이스)과
 * `data-mantine-stop-propagation`(모달 안에 열린 Mantine Select/DateInput 등의 드롭다운이 Escape
 * 를 자기가 먼저 소비하도록 표시하는 것)을 고려해 이미 정확히 처리하므로, 여기서 다시 부르지
 * 않는다(중복 호출 방지). `event.target` 이 실제 포커스된 Element 라는 전제는 실제 keydown 이면
 * 항상 성립하고, 테스트도 (`modal-a11y.unit.test.ts` 의 `dispatchKey`) 실제 포커스된 요소에
 * dispatch 하도록 맞춰져 있다.
 */
function useEscapeCompat(open: boolean) {
  useLayoutEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      // onClose 는 Mantine 자체 핸들러(useWindowEvent, 아래에서 나중에 실행됨)가 호출한다.
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
  useEscapeCompat(open);

  // e2e 계약(계획 Global Constraints): overlay 계열 클래스는 base 에서 `.cm-modal` 을 **감싸는**
  // 컨테이너에 있었고, e2e 는 이 요소에 두 가지를 동시에 요구한다 —
  //   (1) `expect(overlay).toBeVisible()`  (2) `overlay.locator(".ag-header-cell")` 자손 질의
  //       (`mpp-ppd-revision-verify:158-161`, `portal-tab-history:33`)
  // 부착 지점을 셋 다 실측한 결과 `inner` 만 두 조건을 함께 만족한다.
  //   - `M.Overlay`      : fixed 1600x900(보임) 이지만 자기 닫힘 요소라 자손 0건.
  //   - `classNames.root`: dialog 를 자손으로 갖지만 `position: static; height: 0` 이라
  //                        Playwright `isVisible()` 이 false — `toBeVisible()` 이 실패한다.
  //   - `classNames.inner`: `position: fixed; inset: 0`(1600x900, 보임) 이면서 Content 를 자손으로
  //                        가진다. base 의 overlay 역할과 정확히 같다.
  // `M.Overlay` 에 같은 클래스를 병행 부여하지 않는 이유(실측): DOM 순서상 Overlay 가 inner 보다
  // 앞서므로 `.cm-modal-overlay` 든 `.cm-message-modal-overlay` 든 **첫 매칭이 자손 없는 스크림**이
  // 되어 (2) 가 다시 깨진다. M4 가 없앤 "같은 클래스가 서로 다른 역할의 요소 두 곳에 존재하는" 상태를
  // 되살리는 셈이기도 하다. `modal.css:145` 의 `.cm-message-modal-overlay { z-index: 10000 }` 은
  // `position: fixed` 인 inner 에 걸리므로 "다른 Modal 위에 항상 표시" 의도는 그대로 유지된다
  // (스크림은 Mantine 기본 z-index 와 DOM 순서로 여전히 아래 Modal 을 덮는다).
  // `open=false` 일 때 비우는 것은 이중 안전장치다. 부착 지점이 `classNames.root` 였을 때는
  // **필수**였다 — `ModalBase` 가 root Box 를 `opened` 와 무관하게 항상 렌더하므로(실측 확인)
  // 클래스가 영구히 남아 `.count() === 0` 으로 닫힘을 판정하는 e2e 6곳이 깨졌다. 지금 쓰는 `inner` 는
  // Transition 안이라 닫히면 스스로 언마운트되므로 이 가드 없이도 클래스가 사라진다(실측: 가드를
  // 빼도 아래 "open=false 면 남지 않는다" 단언이 통과). 계약 자체는 그 단위 테스트가 지키고,
  // 이 가드는 `keepMounted` 같은 옵션이 나중에 붙어도 안전하도록 남겨 둔다.
  const overlayClasses = open ? clsx("cm-modal-overlay", "modal-overlay", overlayClassName) : undefined;

  return (
    <M.Root
      opened={open}
      onClose={onClose ?? (() => {})}
      size={SIZE[size]}
      centered
      classNames={{ inner: overlayClasses }}
    >
      <M.Overlay />
      <M.Content
        ref={setDialogRef}
        // `M.Content` 의 `className` prop 은 Mantine 내부에서 `mantine-Modal-content` 뿐 아니라
        // `mantine-Modal-inner`(flex 부모, 폭/정렬을 담당) 에도 그대로 전달된다(ModalContent.mjs:
        // `ctx.getStyles("content", {className,...})` 와 `ctx.getStyles("inner", {className,...})`
        // 가 같은 className 을 공유해서 호출됨 — 실측 확인: `.mantine-Modal-inner` 에도
        // `cm-modal cm-modal-md` 가 그대로 붙는다). `.cm-modal { display:flex; flex-direction:
        // column }` 이 inner 에도 걸리면 inner 의 주축이 세로로 바뀌어 `flex: 0 0 var(--modal-size)`
        // 가 폭이 아니라 높이에 적용되고, 결과적으로 Modal 폭이 붕괴한다(LookupModal md 실측
        // 325px, 정상이면 600px). `classNames` 는 selector 별로 분리되므로 `content` 키만 지정해
        // inner 를 건드리지 않는다.
        classNames={{ content: clsx("cm-modal", `cm-modal-${size}`, className) }}
      >
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
  const copyable = (alertType === "error" || alertType === "warning") && !!message;
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
          <>
            <Button className="cm-btn cm-btn-primary" color={color} autoFocus onClick={onClose}>
              {confirmText}
            </Button>
            {/* 오류·경고는 문의·보고용으로 메시지를 복사할 수 있게 한다. DOM 은 [확인] 뒤라 첫 초점은 [확인] 그대로, 화면에서는 왼쪽 끝. */}
            {copyable && <CopyTextButton text={() => `${title || "알림"}\n${message ?? ""}`} style={{ order: -1, marginRight: "auto" }} />}
          </>
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
