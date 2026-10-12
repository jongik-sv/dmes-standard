"use client";

/**
 * ERD 표 노드 — 머리(이름·위반 수)와 컬럼 행. 확대율이 50% 미만이면 표 이름 한 줄만 그린다(스펙 8절, Review Focus 5) —
 * 컬럼 행·작은 이름·위반 수·이름표를 만들지 않는다(Task 12 가 노드 글자가 한 줄인지 본다).
 * 확대율이 35% 미만이면 개요 단계 — 원래 높이 상자에 논리명·물리명 두 줄만 그린다(U50).
 * 확대율은 "50% 미만인가"·"35% 미만인가" 두 불리언만 구독한다. 확대·축소할 때마다가 아니라 경계를 넘을 때만 다시 그린다(Local-Rules §19).
 * 배율 값 자체는 useCanvasEditing 이 .react-flow 요소의 --erd-zoom·data-lod 로 쓰고 글자 크기는 CSS 가 정한다.
 * 머리의 「감사 n」은 감사 컬럼 보기가 꺼져 가린 감사 컬럼 수다(auditHidden, 접기로 가린 수와 따로 센다).
 * 손잡이: 머리에 표 손잡이 4개(늘), 행에는 선이 쓰는 것만. 행이 바뀌면 React Flow 가 손잡이 자리를 다시 재게 한다.
 * 표 크기(§7.4): 저장 너비·높이를 상자에 인라인으로 준다. 높이를 자동보다 줄여 가려지는 컬럼이 있으면 머리 + PK 묶음은 고정하고 일반 컬럼만
 * 스크롤 칸(`nowheel`)에 둔다. 아래에 「▾ N개 더」 막대(누르면 높이 자동). 접기(KEYS·NAME)는 저장 높이를 쓰지 않는다(data.h 가 없다).
 * 크기 손잡이(e·s·se)는 data.resizable 일 때만 단다. 끄는 크기는 sizeBus.draft 에 두고 이 노드만 구독한다(캔버스 전체를 다시 그리지 않는다).
 */
import { Fragment, memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  Handle, Position, useStore, useStoreApi, useUpdateNodeInternals, type NodeProps, type ReactFlowState,
} from "@dk-oasis/shared/react-flow";

import { TABLE_HANDLES, type ErdFlowNode, type ErdRowView, type HandleSpec, type InlineEdit } from "./erd-flow";
import { SIZE_GRIPS, ZOOM_NAMES_ONLY, ZOOM_OVERVIEW, bodyLayout, sizeBusOf, type SizeDraft } from "./erd-geometry";
import { PresenceTag } from "./PresenceTag";

export const namesOnlySelector = (s: ReactFlowState): boolean => s.transform[2] < ZOOM_NAMES_ONLY;
/** 개요 단계(U50) — 확대율 0.35 미만. 배율 값은 구독하지 않는다(글자 크기는 .react-flow 의 --erd-zoom 으로 CSS 가 정한다). */
export const overviewSelector = (s: ReactFlowState): boolean => s.transform[2] < ZOOM_OVERVIEW;

/** 관계 도구(4·5) 동안 노드 전체를 덮는 잇기 손잡이 id. 부모 표를 누르고 자식 표를 누르거나(connectOnClick), 부모에서 자식으로 끈다. */
export const PICK_HANDLE = "pick";

const NO_ROWS: ErdRowView[] = [];
const GRIP_LABEL = { e: "너비", s: "높이", se: "너비·높이" } as const;

/** 사전에 없는 단어 툴팁(2차 §7.3). */
export const UNKNOWN_WORD_TIP = "사전에 없는 단어";

/** 이름을 단어로 나눠 사전에 없는 단어(unknown 자리)만 기울임·회색으로 그린다. 없으면 글 그대로. */
function NameText({ text, unknown }: { text: string; unknown: readonly number[] }) {
  if (unknown.length === 0) return <>{text}</>;
  const words = text.split(" ");
  return (
    <>
      {words.map((w, k) => (
        <Fragment key={k}>
          {k > 0 && " "}
          {unknown.includes(k) ? <i className="erd-unknown" title={UNKNOWN_WORD_TIP}>{w}</i> : w}
        </Fragment>
      ))}
    </>
  );
}

/** 초점이 갈 곳 없이 빠졌는지(입력이 사라져 body 로 떨어짐). 그때만 캔버스 host 로 돌린다. */
const focusLost = (): boolean => !document.activeElement || document.activeElement === document.body;

/**
 * 그 자리 편집 입력(c2). 저장 값으로 시작하고 Enter·초점 잃음 = 고치기, Esc = 그만두기. 한 번만 끝낸다(Enter 뒤 blur 가 다시 부르지 않게).
 * 거절된 값이면 입력을 열어 둔다(aria-invalid). 키로 끝낼 때만 초점을 캔버스로 돌린다 — blur 때 돌리면 사용자가 누른 다른 칸의 초점을 빼앗는다.
 * 고치지 않고 사라지면(축소로 행이 빠짐·화면 밖·대상 지움) 그만두기로 닫는다. StrictMode 의 이중 마운트는 다음 마운트가 예약을 지운다.
 * 키는 캔버스 host 로 올리지 않는다(Delete·숫자 키가 도구로 가지 않게). nodrag·nopan·nowheel 이라 입력 안 끌기·휠이 캔버스를 움직이지 않는다.
 */
function InlineInput({ edit }: { edit: InlineEdit }) {
  const done = useRef(false);
  const [invalid, setInvalid] = useState(false);
  const editRef = useRef(edit);
  editRef.current = edit;
  const input = useRef<HTMLInputElement>(null);
  const gone = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (gone.current) clearTimeout(gone.current);
    gone.current = null;
    // blur 는 네이티브로 듣는다 — 줄 순서가 바뀌어 React 가 입력 DOM 을 옮길 때 나는 blur 를 React 는 버린다.
    const el = input.current;
    const onOut = (e: FocusEvent) => finishRef.current(el?.value ?? "", !e.relatedTarget);
    el?.addEventListener("focusout", onOut);
    return () => {
      el?.removeEventListener("focusout", onOut);
      gone.current = setTimeout(() => {
        if (done.current) return;
        done.current = true;
        editRef.current.onCancel(focusLost());
      }, 0);
    };
  }, []);
  const finish = (value: string | null, refocus: boolean) => {
    if (done.current) return;
    done.current = true;
    if (value === null) {
      editRef.current.onCancel(refocus);
      return;
    }
    if (!editRef.current.onCommit(value, refocus)) {
      done.current = false;
      setInvalid(true);
    }
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  return (
    <input
      ref={input} className="erd-inline nodrag nopan nowheel" data-testid="erd-inline" aria-label={edit.field === "phys" ? "물리명" : "논리명"}
      aria-invalid={invalid || undefined}
      defaultValue={edit.value} placeholder={edit.placeholder ?? undefined} autoFocus spellCheck={false}
      onFocus={(e) => e.currentTarget.select()}
      onChange={() => invalid && setInvalid(false)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") {
          e.preventDefault();
          finish(e.currentTarget.value, true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(null, true);
        }
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}

function Handles({ list }: { list: readonly HandleSpec[] }) {
  return (
    <>
      {list.map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          type={h.type}
          position={h.side === "L" ? Position.Left : Position.Right}
          isConnectable={false}
          className="erd-handle"
        />
      ))}
    </>
  );
}

export const ErdTableNode = memo(function ErdTableNode({ id, data, selected, isConnectable }: NodeProps<ErdFlowNode>) {
  const namesOnly = useStore(namesOnlySelector);
  const overview = useStore(overviewSelector);
  const rows = namesOnly ? NO_ROWS : data.rows;
  const updateInternals = useUpdateNodeInternals();
  // 끄는 중 크기(이 노드 것만). 버스의 draft 는 바뀔 때만 새 객체라 스냅샷이 안정적이다.
  const bus = sizeBusOf(useStoreApi());
  const subscribe = useCallback((l: () => void) => {
    bus.listeners.add(l);
    return () => {
      bus.listeners.delete(l);
    };
  }, [bus]);
  const getDraft = useCallback((): SizeDraft | null => (bus.draft?.id === id ? bus.draft : null), [bus, id]);
  const draft = useSyncExternalStore(subscribe, getDraft, () => null);
  const width = draft ? draft.w : data.w ?? null;
  const height = data.heightLocked ? null : draft ? draft.h : data.h ?? null;
  let keyRows = 0;
  while (keyRows < rows.length && rows[keyRows].key === "PK") keyRows++;
  const { hidden } = bodyLayout(namesOnly ? null : height, keyRows, rows.length - keyRows);
  const clipped = hidden > 0;
  // 스크롤 칸의 스크롤바를 눌러도 표 끌기가 시작되지 않게 한다. React Flow 끌기는 노드 뿌리의 네이티브 mousedown 이라
  // React 의 전파 멈춤으로는 막히지 않는다 — 스크롤 칸의 네이티브 리스너가 칸 자신(스크롤바·빈 곳)을 누른 것만 멈춘다(컬럼 행을 잡고 끄는 것은 그대로).
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const guard = (e: Event) => {
      if (e.target === el) e.stopPropagation();
    };
    el.addEventListener("mousedown", guard);
    el.addEventListener("touchstart", guard, { passive: true });
    return () => {
      el.removeEventListener("mousedown", guard);
      el.removeEventListener("touchstart", guard);
    };
  }, [clipped]);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true; // 처음 그릴 때는 React Flow 가 스스로 잰다
      return;
    }
    updateInternals(id);
  }, [id, rows, overview, updateInternals]);

  if (overview) {
    // 개요 단계 — 원래 높이 상자에 논리명·물리명 두 줄. 손잡이(관계 끝점·잇기)는 그대로 둔다(선이 머리 손잡이 id 를 쓴다).
    return (
      <div className="erd-node" data-lod="overview" data-testid={`erd-node-${id}`} data-selected={selected ? "" : undefined}
        style={width === null ? { height: data.boxHeight } : { height: data.boxHeight, width }}>
        {data.pickable && (
          <Handle id={PICK_HANDLE} type="source" position={Position.Top} isConnectable={isConnectable}
            className="erd-pick nodrag" data-testid={`erd-pick-${id}`} />
        )}
        <Handles list={TABLE_HANDLES} />
        <div className="erd-node__ov">
          {data.logicalName && <div className="erd-node__ov-l">{data.logicalName}</div>}
          <div className="erd-node__ov-p">{data.physName}</div>
        </div>
      </div>
    );
  }

  const renderRow = (r: ErdRowView) => (
    <div key={r.id} className="erd-col" data-col={r.id} data-tone={r.tone ?? undefined} data-sep={r.sepAbove ? "" : undefined} data-testid={`erd-col-${r.id}`}>
      <span className="erd-col__key" data-key={r.key || undefined}>
        {r.key}
      </span>
      {data.inline?.target === r.id ? <InlineInput edit={data.inline} /> : (
        <span className="erd-col__name nopan" data-field={r.nameField} title={r.nameTip ?? undefined}>
          <NameText text={r.name} unknown={r.unknown} />
          {r.nameSub && <span className="erd-col__name-sub" data-field="phys">{r.nameSub}</span>}
        </span>
      )}
      <span className="erd-col__sub">{r.sub}</span>
      <Handles list={r.handles} />
    </div>
  );
  const boxStyle = width === null && (height === null || namesOnly) ? undefined
    : { ...(width !== null ? { width } : {}), ...(height !== null && !namesOnly ? { height } : {}) };
  const clipText = `▾ ${hidden}개 더`;

  return (
    <div className="erd-node" data-testid={`erd-node-${id}`} data-selected={selected ? "" : undefined} data-names-only={namesOnly ? "" : undefined}
      data-clipped={clipped ? "" : undefined} style={boxStyle}>
      {data.pickable && (
        <Handle id={PICK_HANDLE} type="source" position={Position.Top} isConnectable={isConnectable}
          className="erd-pick nodrag" data-testid={`erd-pick-${id}`} />
      )}
      {!namesOnly && data.viewers.length > 0 && (
        <div className="erd-node__viewers">
          {data.viewers.map((v) => (
            <PresenceTag key={v.session} viewer={v} />
          ))}
        </div>
      )}
      <div className="erd-node__hd">
        <Handles list={TABLE_HANDLES} />
        {data.inline?.target === "title" ? <InlineInput edit={data.inline} /> : (
          <span className="erd-node__title nopan" data-field={data.titleField} title={data.titleTip ?? undefined}>
            <NameText text={data.title} unknown={data.titleUnknown} />
          </span>
        )}
        {!namesOnly && data.subtitle && <span className="erd-node__sub">{data.subtitle}</span>}
        {!namesOnly && data.auditHidden > 0 && (
          <span className="erd-node__audit" data-testid={`erd-audit-badge-${id}`} title={`감사 컬럼 ${data.auditHidden}개 숨김`}>
            감사 {data.auditHidden}
          </span>
        )}
        {!namesOnly && data.violations > 0 && (
          <span className="erd-node__warn" title={`표준 위반 ${data.violations}건`}>
            {data.violations}
          </span>
        )}
      </div>
      {clipped ? (
        <>
          {rows.slice(0, keyRows).map(renderRow)}
          <div ref={body} className="erd-node__body nowheel" data-testid={`erd-body-${id}`}>
            {rows.slice(keyRows).map(renderRow)}
          </div>
          {data.expandable ? (
            <button type="button" className="erd-node__clip nodrag nopan" data-testid={`erd-clip-${id}`} title="높이를 자동으로 되돌려 모두 보기"
              onClick={() => bus.expand?.(id)}>
              {clipText}
            </button>
          ) : (
            <div className="erd-node__clip" data-testid={`erd-clip-${id}`}>{clipText}</div>
          )}
        </>
      ) : rows.map(renderRow)}
      {!namesOnly && data.hiddenCount > 0 && <div className="erd-node__more">접힘 · 컬럼 {data.hiddenCount}개 숨김</div>}
      {!namesOnly && data.resizable && SIZE_GRIPS.filter((g) => !data.heightLocked || g === "e").map((g) => (
        <span key={g} className="erd-grip nodrag nopan" role="button" data-grip={g} data-testid={`erd-grip-${id}-${g}`}
          aria-label={`표 크기 — ${GRIP_LABEL[g]}`} title="끌어 표 크기를 바꾼다" onPointerDown={(e) => bus.start?.(e, id, g)} />
      ))}
    </div>
  );
});
