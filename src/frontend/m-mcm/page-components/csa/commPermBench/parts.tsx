"use client";

/**
 * commPermBench 화면 안 작은 부품 — 칸 껍데기·역할 칩·상태 꼬리표·원래 프로그램 링크 아이콘.
 * 업무(역할·그룹) 이름을 읽으므로 화면 폴더에 둔다.
 */
import { createContext, memo, useContext, type ReactNode } from "react";
import { IconPencil } from "@tabler/icons-react";
import { Button } from "@dk-oasis/shared/form";
import { SortToggle, type SortState } from "@dk-oasis/shared/sort-toggle";
import { legacyTip, openLegacy, type LegacyMode, type LegacyTarget } from "./nav";
import { COL_SORT_OPTIONS, roleColorIndex, type BenchIndex, type ColSortKey } from "./model";

/** 작업대 자료 색인 + 3단계 링크 사용 여부. 자료를 다 읽은 뒤에만 그린다. */
export interface BenchCtx {
  /** 초안을 얹은 색인(칸·체크가 보는 값). */
  bench: BenchIndex;
  /** 서버 현재 값 색인(초안 차이 꼬리표의 기준). */
  base: BenchIndex;
  canLink: boolean;
  /** 로그인한 관리자가 SYSADMIN 인가 — 아니면 SYSADMIN 이 걸린 소속 체크를 잠근다. */
  isSysadmin: boolean;
}

export const BenchContext = createContext<BenchCtx | null>(null);

export function useBench(): BenchCtx {
  const v = useContext(BenchContext);
  if (!v) throw new Error("BenchContext 가 없습니다.");
  return v;
}

export function Panel({ title, count, icons, hint, children, bodyClassName = "pb-scroll", head }: {
  title?: ReactNode;
  count?: ReactNode;
  icons?: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  bodyClassName?: string;
  /** 머리 줄을 통째로 바꾼다(미리보기). */
  head?: ReactNode;
}) {
  return (
    <section className="pb-panel">
      {head ?? (
        <div className="pb-panel-head">
          <h3>{title}</h3>
          {count !== undefined && <span className="pb-count">{count}</span>}
          {icons && <span className="pb-icobtns">{icons}</span>}
        </div>
      )}
      {hint && <div className="pb-colhint">{hint}</div>}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export const RoleChip = memo(function RoleChip({ roleId, off = false, className = "" }: { roleId: string; off?: boolean; className?: string }) {
  const { bench } = useBench();
  const name = bench.roleById.get(roleId)?.ROLE_NM ?? roleId;
  return <span className={`pb-rchip pb-rc${roleColorIndex(bench.roleOrder, roleId)}${off ? " is-off" : ""} ${className}`.trim()}>{name}</span>;
});

export function GroupChip({ groupId }: { groupId: string }) {
  const { bench } = useBench();
  return <span className="pb-gchip">{bench.groupById.get(groupId)?.ROLE_GROUP_NM ?? groupId}</span>;
}

/** 상태 꼬리표. kind: add·del·mod·block. */
export function StatusTag({ kind, children, title }: { kind: "add" | "del" | "mod" | "block"; children: ReactNode; title?: string }) {
  return (
    <span className={`pb-st ${kind}`} title={title}>
      {children}
    </span>
  );
}

/**
 * 칸 머리 아이콘 = 원래 프로그램 링크(↗). 3단계(f4) 전에는 그려 두되 누를 수 없다.
 * 시안은 1·2단계에서 이 아이콘을 숨긴다(body[data-phase] CSS). 여기서는 지시대로 보이되 비활성으로 둔다.
 */
export const LegacyIconButton = memo(function LegacyIconButton({ target, mode, id, label, icon, disabled = false }: {
  target: LegacyTarget;
  mode: LegacyMode;
  id?: string | null;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
}) {
  const { canLink } = useBench();
  const tip = legacyTip(target, label);
  return (
    <Button
      size="mini"
      className="pb-go"
      ariaLabel={tip}
      title={canLink ? tip : `${tip} (3단계에서 엽니다)`}
      disabled={!canLink || disabled}
      onClick={() => openLegacy(target, mode, id ?? undefined)}
    >
      {icon}
    </Button>
  );
});

/** 메뉴 칸 폴더 줄의 연필 = 메뉴 관리 링크. */
export function FolderPen({ folderId, name, canLink }: { folderId: string; name: string; canLink: boolean }) {
  const tip = legacyTip("folder", `${name} 폴더 이름`);
  return (
    <button
      type="button"
      className="pb-pen pb-go"
      aria-label={tip}
      title={canLink ? tip : `${tip} (3단계에서 엽니다)`}
      disabled={!canLink}
      data-pb-stop="1"
      onClick={(e) => {
        e.stopPropagation();
        openLegacy("folder", "edit", folderId);
      }}
    >
      <IconPencil size={13} stroke={2} aria-hidden />
    </button>
  );
}

/** 칸 머리 정렬 단추(ID·이름, 오름·내림). 상태는 칸이 쥔다. */
export const ColSort = memo(function ColSort({ label, value, onChange, testId }: {
  label: string;
  value: SortState<ColSortKey>;
  onChange: (next: SortState<ColSortKey>) => void;
  testId: string;
}) {
  return <SortToggle options={COL_SORT_OPTIONS} value={value} onChange={onChange} aria-label={label} testId={testId} />;
});
