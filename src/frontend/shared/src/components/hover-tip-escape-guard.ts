/**
 * 모달 안 상호작용 카드의 Escape 보호(내부용) — 카드가 열려 있을 때 누른 Escape 는 카드만 닫고 모달은 닫지 않는다.
 * React 에 기대지 않는 작은 모듈이다. `useHoverTip`(카드를 띄우는 쪽)과 shared `modal.tsx`(모달 쪽)가 모두 모듈 맨 위에서
 * `installHoverTipEscapeGuard()` 를 부른다.
 *
 * 왜 두 곳인가 — 등록 순서: Mantine Modal 은 window **캡처** 단계 keydown 에서 Escape 로 닫되, 대상 요소에 `data-mantine-stop-propagation="true"`
 * 가 있으면 건너뛴다(ModalBase/use-modal — Mantine 드롭다운이 쓰는 표지). 그 리스너는 모달 컴포넌트가 마운트될 때(useWindowEvent) 등록되고,
 * 같은 대상·단계의 리스너는 등록 순서대로 돈다. 이 가드가 모달보다 먼저 돌려면 모달이 마운트되기 전에 설치돼야 한다.
 *  - tsup 은 진입마다 모듈을 따로 묶는다(splitting:false). modal.tsx 가 설치하면 modal·ui-provider·message-provider·portal-shell 묶음에도 들어가,
 *    루트 레이아웃이 ui-provider 를 읽는 시점(ModalsProvider·MessageModal 이 마운트되기 전)에 설치된다.
 *  - useHoverTip 쪽 설치는 모달을 품지 않는 묶음(form·grid·mdm-meta 등)만 읽힌 경우를 위한 것이다.
 *  - Mantine Modal 을 shared 를 거치지 않고 직접 띄우는 곳이 가드 묶음보다 먼저 마운트되면 순서가 뒤집힌다(화면은 @mantine 을 직접 쓰지 않는다 — Part B).
 *
 * 동작: 열린 상호작용 카드가 있을 때(`open > 0`) 누른 Escape 의 그 순간 대상(focus 가 body 로 빠졌어도 body)에, 표지가 없을 때만 표지를 달고
 * 이 이벤트가 끝나면 자기가 단 것만 걷는다(bubble 단계 window 리스너, 누가 전파를 멈추면 setTimeout 0). 미리 달아 두지 않으므로 React 가 관리하는
 * Combobox 표지와 부딪치지 않고(지우지도, 지워지지도 않는다), 원래 표지가 있던 요소(DetailPopover 처럼 고정)도 건드리지 않는다. 카드가 여럿이어도
 * 카드 수로 맞다. 한글 조합 중 Escape(isComposing)는 건드리지 않는다. 카드가 없으면 아무것도 하지 않는다.
 *
 * 리스너·카드 수는 globalThis 키 하나로 페이지에 하나다 — 원격 모듈이 shared 를 따로 묶어 같은 페이지에 여러 벌 실려도 같다(mdm-meta store 와 같은 관례).
 */

/** Mantine Modal 이 Escape 로 닫지 않는 대상 표지(ModalBase/use-modal). */
const STOP_PROPAGATION_ATTR = "data-mantine-stop-propagation";

/** globalThis 키. */
export const HOVER_TIP_ESCAPE_GUARD_KEY = "__dkOasisHoverTipEscapeGuard";

/** 열린 상호작용 카드 수 — 카드 효과가 열릴 때 +1, 닫히거나 언마운트될 때 -1. */
export interface HoverTipEscapeGuard {
  open: number;
}

/** 가드를 설치하고(한 번만) 돌려준다. 서버 렌더(window 없음)에서는 null. */
export function installHoverTipEscapeGuard(): HoverTipEscapeGuard | null {
  if (typeof window === "undefined") return null;
  const g = globalThis as Record<string, unknown>;
  const existing = g[HOVER_TIP_ESCAPE_GUARD_KEY] as HoverTipEscapeGuard | undefined;
  if (existing) return existing;
  const guard: HoverTipEscapeGuard = { open: 0 };
  g[HOVER_TIP_ESCAPE_GUARD_KEY] = guard;
  window.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (guard.open <= 0 || event.key !== "Escape" || event.isComposing) return;
      const target = event.target;
      if (!(target instanceof Element) || target.hasAttribute(STOP_PROPAGATION_ATTR)) return;
      target.setAttribute(STOP_PROPAGATION_ATTR, "true");
      let done = false;
      const unmark = () => {
        if (done) return;
        done = true;
        window.removeEventListener("keydown", unmark);
        if (target.getAttribute(STOP_PROPAGATION_ATTR) === "true")
          target.removeAttribute(STOP_PROPAGATION_ATTR);
      };
      window.addEventListener("keydown", unmark, { once: true });
      setTimeout(unmark, 0);
    },
    true
  );
  return guard;
}
