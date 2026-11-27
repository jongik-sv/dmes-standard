"use client";

/**
 * 미리보기 칸(시안 rightPreview) — 고른 사람(사람 기준) 또는 「그 역할만 받은 사람」(역할 기준)이 실제로 보는 메뉴와 화면.
 * - 버튼 줄: 켠 버튼 아래 색 칩 = 그 버튼을 켠 역할. 잠긴 버튼은 마우스오버·아래 글로 이유를 보인다.
 * - 메뉴 줄 끝 한 글자 칩 = 그 메뉴를 보이게 한 역할(사람 기준만).
 * - 2단계: 머리의 「현재 · 초안」 보기. 초안 보기는 현재와 비교해 버튼에 「새로·잃음」, 메뉴에 새로 보임(점)·사라짐(취소선)을 단다.
 *   사람 기준 초안 = 서버에 저장한 초안(DRAFT explain·메뉴 트리). 역할 기준 버튼 = 현재 값 + 화면 초안(바로 바뀜).
 *   아래에는 「초안 영향」 묶음(footer)을 붙인다.
 */
import { memo, useCallback, useMemo, type ReactNode } from "react";
import { IconLock } from "@tabler/icons-react";
import { Button, SegmentedControl } from "@dk-oasis/shared/form";
import { PERM_SYSADMIN_ROLE_ID, type ExplainButtonRow, type ExplainResult, type PermSource } from "./types";
import {
  activeRolesOfUser,
  allowedFromExplain,
  allowedFromPermRow,
  buttonWhy,
  effectivePerm,
  flattenNav,
  hiddenInMenu,
  fmtNum,
  groupsGivingRole,
  menuPathOf,
  objUseOf,
  parseTokens,
  popLabel,
  btnLabel,
  REASON_SHORT,
  roleButtonWhy,
  roleColorIndex,
  roleInitial,
  screenRowOf,
  type BenchBy,
  type MenuTree,
  type ObjAllowed,
  type RolePermMap,
} from "./model";
import { Panel, RoleChip, useBench } from "./parts";
import { PermCol } from "./PermCol";

const BY_OPTIONS = [
  { value: "person", label: "사람 기준" },
  { value: "role", label: "역할 기준" },
];
const LOOK_OPTIONS = [
  { value: "CUR", label: "현재" },
  { value: "DRAFT", label: "초안" },
];

const MAX_TAGS = 3;
const MAX_NAV_CHIPS = 4;

export interface PreviewProps {
  by: BenchBy;
  userId: string | null;
  roleId: string | null;
  objectId: string | null;
  /** 고른 화면의 메뉴 줄(같은 화면이 여러 메뉴에 걸릴 때 누른 줄). */
  menuId: string | null;
  nav: ReadonlySet<string>;
  /** 미리보기가 실제로 보는 쪽(CUR·DRAFT). */
  look: PermSource;
  /** 머리 「현재 · 초안」 고른 값. */
  source: PermSource;
  /** 「현재 · 초안」 보기를 보일지(2단계부터). */
  showLook: boolean;
  /** 화면 초안이 아직 저장되지 않았다(사람 기준 초안 보기는 저장 뒤 바뀐다). */
  pending: boolean;
  /** 메뉴: 사람 기준 = 그 사람 트리, 역할 기준 = 그 역할 트리(look 쪽). */
  tree: MenuTree | undefined;
  /** 비교 기준(초안 보기일 때 현재 트리). */
  baseTree: MenuTree | undefined;
  /** 고른 화면 판정(look 쪽). 사람 기준 = 그 사람, 역할 기준 = 허용 값만 쓰는 아무 사람. */
  explain: ExplainResult | undefined;
  /** 비교 기준 판정(초안 보기일 때 현재). */
  baseExplain: ExplainResult | undefined;
  /** 이 화면의 메뉴 트리·explain 읽기가 실패했는가. */
  failed: boolean;
  /** 역할별 퍼미션 + 화면 초안(퍼미션 칸·초안 보기). */
  rolePerms: ReadonlyMap<string, RolePermMap>;
  /** 역할별 퍼미션 현재 값. */
  basePerms: ReadonlyMap<string, RolePermMap>;
  unusedObjs: ReadonlySet<string>;
  canEdit: boolean;
  /** 아래 「초안 영향」 묶음(화면이 memo 해서 넘긴다). */
  footer?: ReactNode;
  onSetBy: (by: BenchBy) => void;
  onSetSource: (source: PermSource) => void;
  onSelectObject: (objectId: string, menuId: string) => void;
  onToggleNav: (menuId: string) => void;
  onGoRole: (roleId: string, groupId: string) => void;
  onRetry: () => void;
  onSetPerm: (btn: readonly string[], popup: readonly string[]) => void;
  onResetPerm: () => void;
}

interface ToolItem {
  code: string;
  on: boolean;
  /** 켠 역할(켜졌을 때) 또는 꺼진 길의 역할(역할·그룹 사용 안 함) 또는 초안에서 잃은 버튼의 현재 역할. */
  roles: string[];
  rolesOff: boolean;
  /** 초안 보기 비교: gain = 새로 켜짐 · lose = 잃음. */
  chg: "gain" | "lose" | null;
  why: string;
  short: string;
}

export const Preview = memo(function Preview(p: PreviewProps) {
  const { bench, base } = useBench();
  const { by, userId, roleId, objectId, menuId, tree, baseTree, explain, baseExplain, failed, rolePerms, basePerms, unusedObjs, look } = p;
  const byRole = by === "role";
  const cmp = look === "DRAFT";
  // 보는 쪽 값: 초안 보기 = 초안을 얹은 소속·퍼미션(화면 초안 — 저장 전에도 바로), 현재 보기 = 현재 값.
  // cmp(서버 DRAFT) 는 사람 기준 explain·메뉴 트리에만 쓴다
  const draftView = p.showLook && p.source === "DRAFT";
  const idx = draftView ? bench : base;
  const shownPerms = draftView ? rolePerms : basePerms;
  const user = !byRole && userId ? bench.userById.get(userId) : undefined;
  const role = roleId ? bench.roleById.get(roleId) : undefined;
  const rname = useCallback((r: string) => bench.roleById.get(r)?.ROLE_NM ?? r, [bench]);
  const who = byRole ? `${role?.ROLE_NM ?? "역할 없음"}만 받은 사람` : user?.USER_NM ?? "";
  const dept = byRole ? "가상 사용자" : user?.DEPT_NM ?? "";

  const { items, visibleCnt, newCnt, goneCnt } = useMemo(
    () => (tree ? flattenNav(tree, p.nav, cmp ? baseTree : undefined) : { items: [], visibleCnt: 0, newCnt: 0, goneCnt: 0 }),
    [tree, p.nav, cmp, baseTree],
  );

  // 사람 기준: 메뉴마다 보이게 한 역할(사용 중인 역할 중 그 화면 버튼이 하나라도 있는 역할)
  const activeRoles = useMemo(() => (!byRole && userId ? activeRolesOfUser(idx, userId) : []), [idx, byRole, userId]);
  const navRoles = useMemo(() => {
    const out = new Map<string, string[]>();
    if (byRole || !tree) return out;
    for (const it of items) {
      if (!it.OBJECT_ID || it.GONE) continue;
      const oid = it.OBJECT_ID;
      const rs = activeRoles.filter((r) => {
        const row = shownPerms.get(r)?.get(oid);
        if (r === PERM_SYSADMIN_ROLE_ID) return true;
        return !!row && effectivePerm(r, row, allowedFromPermRow(row)).btn.length > 0;
      });
      if (rs.length) out.set(oid, rs);
    }
    return out;
  }, [byRole, tree, items, activeRoles, shownPerms]);

  // 고른 화면
  const screen = objectId && tree ? screenRowOf(tree, objectId, menuId) : undefined;
  const objName = screen?.MENU_NM ?? objectId ?? "";
  // 메뉴 줄의 OBJ_USE_TP 가 먼저(역할 기준 트리도 준다). 없으면(옛 서버) 읽어 둔 사람 기준 트리·explain 으로 판정한다
  const rowUnused = objUseOf(screen);
  const objUnused = !!objectId && (rowUnused ?? (unusedObjs.has(objectId) || !!explain?.buttons.some((b) => b.ALLOWED === "Y" && b.REASON === "OBJ_UNUSED")));
  const allowed = useMemo<ObjAllowed | undefined>(() => {
    if (!objectId) return undefined;
    const ex = explain ?? baseExplain;
    if (ex) return allowedFromExplain(ex);
    for (const m of basePerms.values()) {
      const row = m.get(objectId);
      if (row) return allowedFromPermRow(row);
    }
    return undefined;
  }, [objectId, explain, baseExplain, basePerms]);

  const { tools, pops } = useMemo(() => {
    const t: ToolItem[] = [];
    const ps: ToolItem[] = [];
    if (!objectId) return { tools: t, pops: ps };
    if (!byRole) {
      if (!explain) return { tools: t, pops: ps };
      const userUnused = user?.USE_TP === "N";
      const names = { roleName: rname, groupName: (g: string) => bench.groupById.get(g)?.ROLE_GROUP_NM ?? g };
      const was = new Map<string, ExplainButtonRow>();
      if (cmp && baseExplain) for (const b of baseExplain.buttons) was.set(`${b.KIND}|${b.CODE}`, b);
      const item = (b: ExplainButtonRow): ToolItem => {
        // 사용자 사용 안 함이면 서버 값과 상관없이 못 쓴다(마우스오버 글과 맞춘다)
        const on = b.GRANTED === "Y" && !userUnused;
        const w = was.get(`${b.KIND}|${b.CODE}`);
        const wasOn = !!w && w.GRANTED === "Y" && !userUnused;
        const chg = cmp && baseExplain ? (on && !wasOn ? "gain" : !on && wasOn ? "lose" : null) : null;
        const offPath = !on && (b.REASON === "ROLE_UNUSED" || b.REASON === "GROUP_UNUSED");
        return {
          code: b.CODE,
          on,
          roles: on || offPath ? parseTokens(b.ROLES) : chg === "lose" && w ? parseTokens(w.ROLES) : [],
          rolesOff: offPath || chg === "lose",
          chg,
          why: buttonWhy(b, explain, userUnused, names),
          short: userUnused && !on ? "사용자 사용 안 함" : REASON_SHORT[b.REASON] || "켠 역할 없음",
        };
      };
      for (const b of explain.buttons) if (b.ALLOWED === "Y") (b.KIND === "BTN" ? t : ps).push(item(b));
      return { tools: t, pops: ps };
    }
    if (!roleId || !allowed) return { tools: t, pops: ps };
    const roleUnused = role?.USE_TP === "N";
    const eff = effectivePerm(roleId, shownPerms.get(roleId)?.get(objectId), allowed, { roleUnused, objUnused });
    const eff0 = draftView ? effectivePerm(roleId, basePerms.get(roleId)?.get(objectId), allowed, { roleUnused, objUnused }) : eff;
    const nm = rname(roleId);
    const short = objUnused ? REASON_SHORT.OBJ_UNUSED : roleUnused ? REASON_SHORT.ROLE_UNUSED : REASON_SHORT.NO_PERM;
    const one = (c: string, on: boolean, was: boolean): ToolItem => {
      const chg = on && !was ? "gain" : !on && was ? "lose" : null;
      return { code: c, on, roles: on || chg === "lose" ? [roleId] : [], rolesOff: chg === "lose", chg, why: roleButtonWhy(c, on, nm, objUnused, roleUnused), short };
    };
    for (const c of allowed.btn) t.push(one(c, eff.btn.includes(c), eff0.btn.includes(c)));
    for (const c of allowed.popup) ps.push(one(c, eff.popup.includes(c), eff0.popup.includes(c)));
    return { tools: t, pops: ps };
  }, [objectId, byRole, explain, baseExplain, cmp, draftView, user, bench, roleId, allowed, shownPerms, basePerms, role, objUnused, rname]);

  // 역할 기준: 허용 값(퍼미션 줄)에 더해 오브젝트 사용 여부를 알아야 한다 — 메뉴 줄 OBJ_USE_TP 또는 explain
  const loadingMain = !!objectId && !failed && (byRole ? !allowed || (rowUnused === undefined && !explain) : !explain);
  const canOpen = tools.some((x) => x.on) || pops.some((x) => x.on);
  // 열 수 없는 화면: 버튼 줄 대신 잠긴 이유(겹치지 않게)와 꺼진 길의 역할을 보인다
  const lockedWhy = useMemo(() => {
    const all = [...tools, ...pops];
    const text = [...new Set(all.map((x) => x.short).filter(Boolean))].join(" · ");
    const roles = [...new Set(all.filter((x) => x.rolesOff).flatMap((x) => x.roles))];
    const lost = all.filter((x) => x.chg === "lose").length;
    return { text, roles, lost };
  }, [tools, pops]);

  const tag = (r: string, off: boolean) => {
    const g = !byRole && userId ? groupsGivingRole(idx, userId, r)[0] : undefined;
    const tip = `${rname(r)} — ${off ? "이 역할에 값은 있지만 꺼진 길(또는 초안에서 잃음)입니다" : "이 역할로 켜졌습니다"}`;
    if (g && !off) {
      return (
        <button key={r} type="button" className={`pb-rtag${r === roleId ? " is-cur" : ""}`} title={`${tip} · 누르면 아래 퍼미션에서 이 역할을 고릅니다`} onClick={() => p.onGoRole(r, g)}>
          <RoleChip roleId={r} />
        </button>
      );
    }
    return (
      <span key={r} className={`pb-rtag${r === roleId ? " is-cur" : ""}`} title={tip}>
        <RoleChip roleId={r} off={off} />
      </span>
    );
  };

  const roleTags = (x: ToolItem) => (
    <div className="pb-abroles">
      {x.roles.slice(0, MAX_TAGS).map((r) => tag(r, x.rolesOff))}
      {x.roles.length > MAX_TAGS && (
        <span className="pb-small pb-faint" title={x.roles.slice(MAX_TAGS).map(rname).join(", ")}>
          +{x.roles.length - MAX_TAGS}
        </span>
      )}
      {(!x.on || !x.roles.length) && x.chg !== "lose" && <span className="pb-small pb-faint">{x.short}</span>}
    </div>
  );

  const chgTag = (x: ToolItem) =>
    x.chg && <span className={`pb-tag${x.chg === "lose" ? " is-m" : ""}`}>{x.chg === "gain" ? "새로" : "잃음"}</span>;

  const head = (
    <div className="pb-panel-head">
      <SegmentedControl value={by} onChange={(v) => p.onSetBy(v as BenchBy)} options={BY_OPTIONS} ariaLabel="보는 기준" />
      <h3>{byRole ? `「${role?.ROLE_NM ?? "역할 없음"}」만 받은 사람으로 보기` : `「${who}」으로 보기`}</h3>
      {p.showLook && <SegmentedControl value={p.source} onChange={(v) => p.onSetSource(v as PermSource)} options={LOOK_OPTIONS} ariaLabel="현재와 초안" />}
      <span className="pb-small pb-muted">
        메뉴 {fmtNum(visibleCnt)}개
        {cmp && (newCnt > 0 || goneCnt > 0) && (
          <>
            {" · "}
            <span className="pb-pm">
              <b className="pb-p">새로 {newCnt}</b> <b className="pb-m">사라짐 {goneCnt}</b>
            </span>
          </>
        )}
      </span>
    </div>
  );

  const crumb = objectId && tree ? menuPathOf(tree, objectId, screen?.MENU_ID) : "";
  // 메뉴에서 숨김(그 줄 SHOW_TP N·REASON MENU_HIDDEN 또는 위 폴더 숨김) — 권한이 닿으면 주소로 여는 화면(bench-be #11)
  const hidden = !!tree && hiddenInMenu(tree, screen);

  const selectedMenuId = screen?.MENU_ID ?? null;

  const navEl = (
    <nav className="pb-appnav" aria-label={`${who}의 메뉴`}>
      {!tree && !failed && <span className="pb-empty-note">메뉴를 읽는 중입니다.</span>}
      {tree && !items.length && <span className="pb-empty-note">열 수 있는 화면이 없습니다.</span>}
      {items.map((it) => {
        if (!it.OBJECT_ID) {
          return (
            <button key={it.MENU_ID} type="button" className={`lv${Math.min(it.LEVEL, 1)}`} onClick={() => p.onToggleNav(it.MENU_ID)} aria-expanded={it.OPEN}>
              {it.OPEN ? "▾" : "▸"} {it.NAME}
              <span className="pb-n">{it.CNT}</span>
            </button>
          );
        }
        const rs = navRoles.get(it.OBJECT_ID) ?? [];
        const oid = it.OBJECT_ID;
        return (
          <button
            key={it.MENU_ID}
            type="button"
            className={`lv2${it.MENU_ID === selectedMenuId ? " is-on" : ""}${it.GONE ? " is-gone" : ""}${it.HIDDEN ? " is-hidden" : ""}`}
            title={it.NEW ? "초안에서 새로 보임" : it.GONE ? "초안에서 메뉴에서 사라짐" : it.HIDDEN ? "메뉴에서 숨김(주소로 연 화면)" : undefined}
            onClick={() => p.onSelectObject(oid, it.MENU_ID)}
          >
            {it.NEW && <span className="pb-dot" aria-label="새로" />}
            <span className="pb-sl">{it.NAME}</span>
            {it.HIDDEN && <span className="pb-hid">숨김</span>}
            {rs.length > 0 && (
              <span className="pb-rones">
                {rs.slice(0, MAX_NAV_CHIPS).map((r) => (
                  <span key={r} className={`pb-rchip pb-rone pb-rc${roleColorIndex(bench.roleOrder, r)}`} title={`${rname(r)} — 이 역할로 메뉴에 보임`}>
                    {roleInitial(rname(r))}
                  </span>
                ))}
                {rs.length > MAX_NAV_CHIPS && (
                  <span className="pb-rmore" title={rs.slice(MAX_NAV_CHIPS).map(rname).join(", ")}>
                    +{rs.length - MAX_NAV_CHIPS}
                  </span>
                )}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );

  const permSec = objectId ? (
    <div className="pb-appperm">
      <h4 className="pb-sub">
        퍼미션{" "}
        <span className="pb-small pb-muted">
          {byRole
            ? "고른 역할 × 이 화면. 다른 역할은 왼쪽 역할 칸이나 아래 「이 메뉴를 연 역할」에서 고릅니다"
            : `「${who}」이(가) 받은 역할 중 하나를 골라 ${p.canEdit ? "고칩니다" : "봅니다"}. 위 버튼 줄은 모든 역할을 합친 결과이고, 버튼 아래 색 칩이 그 버튼을 켠 역할입니다`}
        </span>
      </h4>
      <PermCol
        by={by}
        userId={userId}
        roleId={roleId}
        objectId={objectId}
        objectName={objName}
        allowed={allowed}
        objUnused={objUnused}
        rolePerms={rolePerms}
        basePerms={basePerms}
        canEdit={p.canEdit}
        onGoRole={p.onGoRole}
        onSetPerm={p.onSetPerm}
        onResetPerm={p.onResetPerm}
      />
    </div>
  ) : null;

  const lookWord = (byRole ? draftView : cmp) ? "초안에서" : "현재";
  const main = !objectId ? (
    <div className="pb-cantopen">메뉴 칸이나 왼쪽 메뉴에서 화면을 고릅니다.</div>
  ) : (
    <>
      <div className="pb-appcrumb">
        {crumb}
        {hidden && (
          <>
            {" · "}
            <b>메뉴에서 숨김(주소로 연 화면)</b>
          </>
        )}
      </div>
      <h3>
        {objName} {canOpen && <span className="pb-mono pb-faint">{objectId}</span>}
      </h3>
      {failed && !tools.length && !pops.length ? (
        <div className="pb-cantopen">
          <span className="pb-err" role="alert">
            읽지 못했습니다.
          </span>{" "}
          <Button size="mini" onClick={p.onRetry}>
            다시 읽기
          </Button>
        </div>
      ) : loadingMain ? (
        <div className="pb-cantopen">버튼을 읽는 중입니다.</div>
      ) : canOpen ? (
        <>
          <div className="pb-apptools">
            <span className="pb-lbl">버튼</span>
            {tools.map((x) => (
              <div key={x.code} className="pb-abwrap">
                <span className={`pb-abtn${x.on ? "" : " is-locked"}${x.chg ? ` is-${x.chg}` : ""}`} tabIndex={0} title={x.why}>
                  {!x.on && <IconLock size={11} stroke={2.4} aria-hidden />}
                  {btnLabel(x.code)}
                  {chgTag(x)}
                </span>
                {roleTags(x)}
              </div>
            ))}
          </div>
          <div className="pb-apppops">
            <span className="pb-lbl">팝업</span>
            {pops.length ? (
              pops.map((x) => (
                <div key={x.code} className="pb-abwrap">
                  <span className={`pb-pbtn${x.on ? "" : " is-locked"}${x.chg ? ` is-${x.chg}` : ""}`} tabIndex={0} title={x.why}>
                    {x.on ? "⧉" : <IconLock size={11} stroke={2.4} aria-hidden />} {popLabel(x.code)}
                    <code>{x.code}</code>
                    {chgTag(x)}
                  </span>
                  {roleTags(x)}
                </div>
              ))
            ) : (
              <span className="pb-small pb-faint">이 화면에는 팝업 권한이 없습니다</span>
            )}
          </div>
        </>
      ) : (
        <div className="pb-cantopen">
          「{who}」은(는) {lookWord} 이 화면을 열 수 없습니다. 메뉴에도 보이지 않습니다.
          {lockedWhy.lost > 0 && <div className="pb-small pb-m">초안에서 버튼 {lockedWhy.lost}개를 잃어 닫힙니다.</div>}
          {lockedWhy.text && (
            <div className="pb-small" style={{ marginTop: 6 }}>
              잠긴 이유: {lockedWhy.text} {lockedWhy.roles.map((r) => tag(r, true))}
            </div>
          )}
        </div>
      )}
      {permSec}
    </>
  );

  // 역할 기준 버튼은 화면 초안을 바로 쓰고, 사람 기준(서버 판정)·메뉴는 저장한 초안을 쓴다
  const lookText = !draftView
    ? "현재 권한으로 보는 중"
    : cmp
      ? `초안 권한으로 보는 중${p.pending ? " · 메뉴·사람 기준 버튼은 저장한 뒤 바뀝니다" : ""}`
      : p.pending
        ? "초안 권한으로 보는 중 · 저장한 뒤 바뀝니다"
        : "초안 권한으로 보는 중 · 바꾼 것 없음(현재와 같음)";

  return (
    <Panel head={head}>
      <div className="pb-pad">
        <div className="pb-appwin">
          <div className="pb-appbar">
            <b>DMES</b>
            <span>
              {who} · {dept}
            </span>
            <span className="pb-sp" />
            <span>{lookText}</span>
          </div>
          <div className="pb-appbody">
            {navEl}
            <div className="pb-appmain">{main}</div>
          </div>
        </div>
      </div>
      {p.footer}
    </Panel>
  );
});
