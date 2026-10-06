"use client";

/**
 * 컬럼 설정 창 — 그리드 컬럼의 표시 여부와 순서를 한 줄씩 바꾸는 제어형 창(순수 UI, 그리드 내부를 모른다).
 *
 * - AgDataGrid 가 컬럼 개인화가 켜졌을 때 열 때마다 지금 컬럼 목록(`columns`)을 만들어 주고, 적용·복원 결과를 `onApply`·`onReset` 로 받는다.
 * - 내부 컬럼(`internal`: 선택 체크박스·행 번호·화면 정의에서 숨긴 컬럼)은 보이지 않는다. 다만 적용할 때 넘기는 상태에는 모든 컬럼을
 *   원래 자리 그대로 담는다 — 보이는 컬럼 순서만 보내면 ag-grid 가 빠진 컬럼(선택 체크박스 등)을 뒤로 보내기 때문이다.
 * - 숨길 수 없는 컬럼(`locked`)은 체크가 고정(비활성)이고 순서 이동만 된다.
 * - 고정(pinned) 컬럼은 구역(왼쪽 고정 · 일반 · 오른쪽 고정)별로 모아 보이고, 순서는 같은 구역 안에서만 옮긴다.
 * - 열 그룹(`group`·`groupPath`)이 있는 컬럼은 그룹 이름을 제목 줄로 앞에 보이고, 순서는 같은 그룹 안에서만 옮긴다(그룹 경계의 위로·아래로
 *   단추는 비활성). 그룹을 통째로 옮기는 기능은 없다. 그룹 없는 컬럼끼리는 구역 규칙만 따른다.
 * - 적용할 때 너비는 넘기지 않는다(`width` 가 있으면 컬럼 개인화가 그 컬럼 너비를 저장·잠근다).
 * - 열린 동안만 그린다(`opened` 가 false 면 아무것도 그리지 않는다). 열 때마다 `columns` 로 처음부터 시작한다.
 * - 스타일은 컴포넌트가 직접 넣는다(포털이 원격 모듈의 CSS 파일을 싣지 않는다 — Part B §18-3).
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";

import { Modal } from "../modal";
import { Button } from "../form/Button";
import { Checkbox } from "../form/Checkbox";

/** 열 그룹 하나 — 제목 줄에 이름을 보인다. */
export interface ColumnSettingsGroup {
  /** 그룹 id. 같은 그룹인지 가르는 열쇠다. */
  id: string;
  /** 그룹 머리글 이름. 비었으면 id 를 보인다. */
  header: string;
}

/** 설정 창에 보일 컬럼 하나 — 지금 그리드 순서대로 준다. */
export interface ColumnSettingsColumn {
  colId: string;
  /** 머리글 표시 이름. 비었으면 colId 를 보인다. */
  header: string;
  /** 지금 숨겨져 있는가. */
  hide: boolean;
  /** 고정 구역. 없으면(null·생략) 일반 구역. */
  pinned?: "left" | "right" | null;
  /** 숨길 수 없는 컬럼 — 체크가 고정(켜짐·비활성)이다. 순서 이동은 된다. */
  locked?: boolean;
  /** 설정 창에 보이지 않을 컬럼(선택 체크박스·행 번호·내부 컬럼). 적용 상태에는 원래 자리로 들어간다. */
  internal?: boolean;
  /** 이 컬럼을 품은 가장 가까운 열 그룹. 없으면(생략) 그룹 밖 컬럼 — 순서는 같은 그룹 안에서만 옮긴다. */
  group?: ColumnSettingsGroup;
  /** 그룹 경로(바깥 → 안쪽, 마지막이 `group`) — 중첩 그룹의 제목 줄. 생략하면 `group` 하나로 본다. */
  groupPath?: readonly ColumnSettingsGroup[];
}

/** 적용 상태의 한 항목 — 순서는 배열 순서, `hide` 는 숨김 여부. 너비는 없다. */
export interface ColumnSettingsState {
  colId: string;
  hide: boolean;
}

export interface ColumnSettingsModalProps {
  /** 창을 열었는가. false 면 아무것도 그리지 않는다. */
  opened: boolean;
  /** 지금 컬럼 목록(그리드 순서). 열 때마다 이 값으로 시작한다. */
  columns: readonly ColumnSettingsColumn[];
  /** [적용] — 모든 컬럼의 `{ colId, hide }` 를 바뀐 순서대로 넘기고 창을 닫는다. */
  onApply: (state: ColumnSettingsState[]) => void;
  /** [기본값 복원] — 복원을 알리고 창을 닫는다. */
  onReset: () => void;
  /** 닫기(취소·X·Esc·적용·복원 뒤). */
  onClose: () => void;
  /** 창 제목. 기본 「컬럼 설정」. */
  title?: string;
  /** 바깥 상자의 `data-testid` 접두어. 기본 `column-settings`. */
  testId?: string;
}

type Zone = "left" | "center" | "right";

const ZONE_RANK: Record<Zone, number> = { left: 0, center: 1, right: 2 };
const ZONE_LABEL: Record<Zone, string> = { left: "왼쪽 고정", center: "일반", right: "오른쪽 고정" };
const LOCKED_TIP = "숨길 수 없는 컬럼";

function zoneOf(c: Pick<ColumnSettingsColumn, "pinned">): Zone {
  return c.pinned === "left" ? "left" : c.pinned === "right" ? "right" : "center";
}

function groupIdOf(c: Pick<ColumnSettingsColumn, "group">): string {
  return c.group?.id ?? "";
}

/** 그룹 경로(바깥 → 안쪽). `groupPath` 가 없으면 `group` 하나. */
function pathOf(c: Pick<ColumnSettingsColumn, "group" | "groupPath">): readonly ColumnSettingsGroup[] {
  return c.groupPath ?? (c.group ? [c.group] : []);
}

/** 서로 자리를 바꿀 수 있는 이웃인가 — 같은 고정 구역, 같은 그룹. */
function sameBlock(a: ColumnSettingsColumn, b: ColumnSettingsColumn): boolean {
  return zoneOf(a) === zoneOf(b) && groupIdOf(a) === groupIdOf(b);
}

export const COLUMN_SETTINGS_STYLE_HREF = "cm-column-settings";

const COLUMN_SETTINGS_CSS = `
.cm-colset-list { list-style: none; margin: 0; padding: 0; max-height: 50vh; overflow-y: auto; border: 1px solid var(--color-border-light); border-radius: var(--radius-md); }
.cm-colset-zone { padding: 3px var(--spacing-md); font-size: var(--font-size-xs); color: var(--color-text-muted); background: var(--color-bg-header); border-bottom: 1px solid var(--color-border-light); }
.cm-colset-group { padding: 3px var(--spacing-md); padding-left: calc(var(--spacing-md) + var(--cm-depth, 0) * var(--spacing-lg)); font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text); background: var(--color-bg-header); border-bottom: 1px solid var(--color-border-light); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-colset-row[data-depth] { padding-left: calc(var(--spacing-md) + var(--cm-depth, 0) * var(--spacing-lg)); }
.cm-colset-row { display: flex; align-items: center; gap: var(--spacing-sm); padding: 3px var(--spacing-md); border-bottom: 1px solid var(--color-border-light); font-size: var(--font-size-md); color: var(--color-text); }
.cm-colset-row:last-child { border-bottom: 0; }
.cm-colset-row:hover { background: var(--color-bg-hover); }
.cm-colset-check { flex: none; display: inline-flex; }
.cm-colset-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-colset-row--hidden .cm-colset-title { color: var(--color-text-disabled); }
.cm-colset-move { flex: none; display: inline-flex; gap: var(--spacing-xs); }
.cm-colset-reset { margin-right: auto; }
`;

/**
 * 컬럼 설정 창. 제어형이다 — 열림·목록·결과는 모두 props 로 오간다.
 * 열린 동안만 그린다(안쪽 본체는 열릴 때마다 새로 만들어져 `columns` 로 처음부터 시작한다).
 */
export function ColumnSettingsModal(props: ColumnSettingsModalProps) {
  if (!props.opened) return null;
  return <ColumnSettingsBody {...props} />;
}

function ColumnSettingsBody({ columns, onApply, onReset, onClose, title = "컬럼 설정", testId = "column-settings" }: ColumnSettingsModalProps) {
  // 모든 컬럼(내부 컬럼 포함)을 지금 순서로 갖고 있는다. 바뀐 상태를 만들 때 내부 컬럼을 원래 자리에 그대로 두기 위해서다.
  const [rows, setRows] = useState<ColumnSettingsColumn[]>(() => columns.map((c) => ({ ...c })));

  /** 보이는 줄 — 구역별(왼쪽 고정 → 일반 → 오른쪽 고정)로 모으고, 같은 구역 안에서는 그리드 순서를 지킨다. */
  const shown = useMemo(
    () => rows.filter((r) => !r.internal).sort((a, b) => ZONE_RANK[zoneOf(a)] - ZONE_RANK[zoneOf(b)]),
    [rows],
  );
  const hasPinned = shown.some((r) => zoneOf(r) !== "center");
  /** 보이는 컬럼이 하나라도 남는가 — 숨길 수 없는 컬럼은 늘 보인다. */
  const hasVisible = shown.some((r) => r.locked || !r.hide);

  // 순서를 옮긴 뒤 같은 단추에 초점을 돌려준다(줄이 옮겨 가며 초점을 잃지 않게 — 키보드로 이어서 옮길 수 있다).
  const focusRef = useRef<{ colId: string; dir: -1 | 1 } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const f = focusRef.current;
    if (!f) return;
    focusRef.current = null;
    const root = bodyRef.current;
    if (!root) return;
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-move]"));
    const pick = (dir: -1 | 1) => buttons.find((b) => b.dataset.move === `${f.colId}:${dir}` && !b.disabled);
    (pick(f.dir) ?? pick(f.dir === -1 ? 1 : -1))?.focus();
  }, [rows]);

  const toggle = (colId: string, hide: boolean) =>
    setRows((prev) => prev.map((r) => (r.colId === colId && !r.locked ? { ...r, hide } : r)));

  const move = (colId: string, dir: -1 | 1) => {
    const i = shown.findIndex((r) => r.colId === colId);
    const neighbor = shown[i + dir];
    if (i < 0 || !neighbor || !sameBlock(neighbor, shown[i])) return;
    focusRef.current = { colId, dir };
    // 두 컬럼이 서로의 자리를 바꾼다 — 사이에 낀 내부 컬럼과 다른 컬럼은 제자리다.
    setRows((prev) => {
      const a = prev.findIndex((r) => r.colId === colId);
      const b = prev.findIndex((r) => r.colId === neighbor.colId);
      if (a < 0 || b < 0) return prev;
      const next = prev.slice();
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  };

  const handleApply = () => {
    onApply(rows.map((r) => ({ colId: r.colId, hide: r.hide })));
    onClose();
  };
  const handleReset = () => {
    onReset();
    onClose();
  };

  let lastZone: Zone | null = null;
  let lastPath: readonly ColumnSettingsGroup[] = [];
  return (
    <>
      <style href={COLUMN_SETTINGS_STYLE_HREF} precedence="default">
        {COLUMN_SETTINGS_CSS}
      </style>
      <Modal
        open
        title={title}
        size="md"
        onClose={onClose}
        footer={
          <>
            <Button className="cm-colset-reset" data-testid={`${testId}-reset`} onClick={handleReset}>
              기본값 복원
            </Button>
            <Button data-testid={`${testId}-cancel`} onClick={onClose}>
              취소
            </Button>
            <Button variant="primary" data-testid={`${testId}-apply`} disabled={!hasVisible} onClick={handleApply}>
              적용
            </Button>
          </>
        }
      >
        <div ref={bodyRef} data-testid={testId}>
          <ul className="cm-colset-list" aria-label="컬럼 목록">
            {shown.flatMap((r, i) => {
              const zone = zoneOf(r);
              const out = [];
              if (hasPinned && zone !== lastZone) {
                out.push(
                  <li key={`zone:${zone}`} className="cm-colset-zone" data-testid={`${testId}-zone-${zone}`}>
                    {ZONE_LABEL[zone]}
                  </li>,
                );
              }
              // 그룹 제목 줄 — 앞 줄과 경로가 달라진 깊이부터 그린다(구역이 바뀌면 처음부터).
              const path = pathOf(r);
              let diff = 0;
              if (zone === lastZone) while (diff < path.length && diff < lastPath.length && path[diff].id === lastPath[diff].id) diff++;
              for (let d = diff; d < path.length; d++) {
                out.push(
                  <li
                    key={`group:${zone}:${i}:${path[d].id}`}
                    className="cm-colset-group"
                    style={{ "--cm-depth": d } as CSSProperties}
                    data-testid={`${testId}-group-${path[d].id}`}
                  >
                    {path[d].header || path[d].id}
                  </li>,
                );
              }
              lastPath = path;
              lastZone = zone;
              const label = r.header || r.colId;
              const checked = r.locked ? true : !r.hide;
              const upDisabled = i === 0 || !sameBlock(shown[i - 1], r);
              const downDisabled = i === shown.length - 1 || !sameBlock(shown[i + 1], r);
              out.push(
                <li
                  key={r.colId}
                  className={`cm-colset-row${checked ? "" : " cm-colset-row--hidden"}`}
                  data-testid={`${testId}-row-${r.colId}`}
                  data-depth={path.length > 0 ? path.length : undefined}
                  style={path.length > 0 ? ({ "--cm-depth": path.length } as CSSProperties) : undefined}
                >
                  <span className="cm-colset-check" title={r.locked ? LOCKED_TIP : undefined} data-testid={`${testId}-check-${r.colId}`}>
                    <Checkbox
                      checked={checked}
                      disabled={!!r.locked}
                      aria-label={r.locked ? `${label} (${LOCKED_TIP})` : `${label} 표시`}
                      onChange={(v) => toggle(r.colId, !v)}
                    />
                  </span>
                  <span className="cm-colset-title" title={label}>
                    {label}
                  </span>
                  <span className="cm-colset-move">
                    <Button
                      size="mini"
                      ariaLabel={`${label} 위로 이동`}
                      disabled={upDisabled}
                      data-move={`${r.colId}:-1`}
                      data-testid={`${testId}-up-${r.colId}`}
                      onClick={() => move(r.colId, -1)}
                    >
                      <IconChevronUp size={14} />
                    </Button>
                    <Button
                      size="mini"
                      ariaLabel={`${label} 아래로 이동`}
                      disabled={downDisabled}
                      data-move={`${r.colId}:1`}
                      data-testid={`${testId}-down-${r.colId}`}
                      onClick={() => move(r.colId, 1)}
                    >
                      <IconChevronDown size={14} />
                    </Button>
                  </span>
                </li>,
              );
              return out;
            })}
          </ul>
        </div>
      </Modal>
    </>
  );
}
