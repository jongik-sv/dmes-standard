"use client";

/**
 * 미리보기 칸(시안 rightPreview) — 고른 사람(사람 기준) 또는 「그 역할만 받은 사람」(역할 기준)이 실제로 보는 메뉴와 화면.
 * - 버튼 줄: 켠 버튼 아래 색 칩 = 그 버튼을 켠 역할. 잠긴 버튼은 마우스오버·아래 글로 이유를 보인다.
 * - 메뉴 줄 끝 한 글자 칩 = 그 메뉴를 보이게 한 역할(사람 기준만).
 * 2단계(f3): 머리의 「현재/초안」 보기와 아래 「초안 영향」 묶음이 여기에 붙는다.
 */
import { memo, useCallback, useMemo } from "react";
import { IconLock } from "@tabler/icons-react";
import { Button, SegmentedControl } from "@dk-oasis/shared/form";
import { PERM_SYSADMIN_ROLE_ID, type ExplainButtonRow, type ExplainResult } from "./types";
import {
  activeRolesOfUser,
  allowedFromExplain,
  allowedFromPermRow,
  buttonWhy,
  effectivePerm,
  flattenNav,
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
  /** 메뉴: 사람 기준 = 그 사람 트리, 역할 기준 = 그 역할 트리. */
  tree: MenuTree | undefined;
  /** 고른 화면 판정(사람 기준 = 그 사람, 역할 기준 = 허용 값만 쓰는 아무 사람). */
  explain: ExplainResult | undefined;
  /** 이 화면의 메뉴 트리·explain 읽기가 실패했는가. */
  failed: boolean;
  rolePerms: ReadonlyMap<string, RolePermMap>;
  unusedObjs: ReadonlySet<string>;
  canEdit: boolean;
  onSetBy: (by: BenchBy) => void;
  onSelectObject: (objectId: string, menuId: string) => void;
  onToggleNav: (menuId: string) => void;
  onGoRole: (roleId: string, groupId: string) => void;
  onRetry: () => void;
  onSetPerm: (btn: readonly string[], popup: readonly string[]) => void;
}

interface ToolItem {
  code: string;
  on: boolean;
  /** 켠 역할(켜졌을 때) 또는 꺼진 길의 역할(역할·그룹 사용 안 함). */
  roles: string[];
  rolesOff: boolean;
  why: string;
  short: string;
}

export const Preview = memo(function Preview(p: PreviewProps) {
  const { bench } = useBench();
  const { by, userId, roleId, objectId, menuId, tree, explain, failed, rolePerms, unusedObjs } = p;
  const byRole = by === "role";
  const user = !byRole && userId ? bench.userById.get(userId) : undefined;
  const role = roleId ? bench.roleById.get(roleId) : undefined;
  const rname = useCallback((r: string) => bench.roleById.get(r)?.ROLE_NM ?? r, [bench]);
  const who = byRole ? `${role?.ROLE_NM ?? "역할 없음"}만 받은 사람` : user?.USER_NM ?? "";
  const dept = byRole ? "가상 사용자" : user?.DEPT_NM ?? "";

  const { items, visibleCnt } = useMemo(() => (tree ? flattenNav(tree, p.nav) : { items: [], visibleCnt: 0 }), [tree, p.nav]);

  // 사람 기준: 메뉴마다 보이게 한 역할(사용 중인 역할 중 그 화면 버튼이 하나라도 있는 역할)
  const activeRoles = useMemo(() => (!byRole && userId ? activeRolesOfUser(bench, userId) : []), [bench, byRole, userId]);
  const navRoles = useMemo(() => {
    const out = new Map<string, string[]>();
    if (byRole || !tree) return out;
    for (const it of items) {
      if (!it.OBJECT_ID) continue;
      const oid = it.OBJECT_ID;
      const rs = activeRoles.filter((r) => {
        const row = rolePerms.get(r)?.get(oid);
        if (r === PERM_SYSADMIN_ROLE_ID) return true;
        return !!row && effectivePerm(r, row, allowedFromPermRow(row)).btn.length > 0;
      });
      if (rs.length) out.set(oid, rs);
    }
    return out;
  }, [byRole, tree, items, activeRoles, rolePerms]);

  // 고른 화면
  const screen = objectId && tree ? screenRowOf(tree, objectId, menuId) : undefined;
  const objName = screen?.MENU_NM ?? objectId ?? "";
  // 메뉴 줄의 OBJ_USE_TP 가 먼저(역할 기준 트리도 준다). 없으면(옛 서버) 읽어 둔 사람 기준 트리·explain 으로 판정한다
  const rowUnused = objUseOf(screen);
  const objUnused = !!objectId && (rowUnused ?? (unusedObjs.has(objectId) || !!explain?.buttons.some((b) => b.ALLOWED === "Y" && b.REASON === "OBJ_UNUSED")));
  const allowed = useMemo<ObjAllowed | undefined>(() => {
    if (!objectId) return undefined;
    if (explain) return allowedFromExplain(explain);
    for (const m of rolePerms.values()) {
      const row = m.get(objectId);
      if (row) return allowedFromPermRow(row);
    }
    return undefined;
  }, [objectId, explain, rolePerms]);

  const { tools, pops } = useMemo(() => {
    const t: ToolItem[] = [];
    const ps: ToolItem[] = [];
    if (!objectId) return { tools: t, pops: ps };
    if (!byRole) {
      if (!explain) return { tools: t, pops: ps };
      const userUnused = user?.USE_TP === "N";
      const names = { roleName: rname, groupName: (g: string) => bench.groupById.get(g)?.ROLE_GROUP_NM ?? g };
      const item = (b: ExplainButtonRow): ToolItem => {
        // 사용자 사용 안 함이면 서버 값과 상관없이 못 쓴다(마우스오버 글과 맞춘다)
        const on = b.GRANTED === "Y" && !userUnused;
        const offPath = !on && (b.REASON === "ROLE_UNUSED" || b.REASON === "GROUP_UNUSED");
        return {
          code: b.CODE,
          on,
          roles: on || offPath ? parseTokens(b.ROLES) : [],
          rolesOff: offPath,
          why: buttonWhy(b, explain, userUnused, names),
          short: userUnused && !on ? "사용자 사용 안 함" : REASON_SHORT[b.REASON] || "켠 역할 없음",
        };
      };
      for (const b of explain.buttons) if (b.ALLOWED === "Y") (b.KIND === "BTN" ? t : ps).push(item(b));
      return { tools: t, pops: ps };
    }
    if (!roleId || !allowed) return { tools: t, pops: ps };
    const row = rolePerms.get(roleId)?.get(objectId);
    const roleUnused = role?.USE_TP === "N";
    const eff = effectivePerm(roleId, row, allowed, { roleUnused, objUnused });
    const nm = rname(roleId);
    for (const c of allowed.btn) {
      const on = eff.btn.includes(c);
      t.push({ code: c, on, roles: on ? [roleId] : [], rolesOff: false, why: roleButtonWhy(c, on, nm, objUnused, roleUnused), short: objUnused ? REASON_SHORT.OBJ_UNUSED : roleUnused ? REASON_SHORT.ROLE_UNUSED : REASON_SHORT.NO_PERM });
    }
    for (const c of allowed.popup) {
      const on = eff.popup.includes(c);
      ps.push({ code: c, on, roles: on ? [roleId] : [], rolesOff: false, why: roleButtonWhy(c, on, nm, objUnused, roleUnused), short: objUnused ? REASON_SHORT.OBJ_UNUSED : roleUnused ? REASON_SHORT.ROLE_UNUSED : REASON_SHORT.NO_PERM });
    }
    return { tools: t, pops: ps };
  }, [objectId, byRole, explain, user, bench, roleId, allowed, rolePerms, role, objUnused, rname]);

  // 역할 기준: 허용 값(퍼미션 줄)에 더해 오브젝트 사용 여부를 알아야 한다 — 메뉴 줄 OBJ_USE_TP 또는 explain
  const loadingMain = !!objectId && !failed && (byRole ? !allowed || (rowUnused === undefined && !explain) : !explain);
  const canOpen = tools.some((x) => x.on) || pops.some((x) => x.on);
  // 열 수 없는 화면: 버튼 줄 대신 잠긴 이유(겹치지 않게)와 꺼진 길의 역할을 보인다
  const lockedWhy = useMemo(() => {
    const all = [...tools, ...pops];
    const text = [...new Set(all.map((x) => x.short).filter(Boolean))].join(" · ");
    const roles = [...new Set(all.filter((x) => x.rolesOff).flatMap((x) => x.roles))];
    return { text, roles };
  }, [tools, pops]);

  const tag = (r: string, off: boolean) => {
    const g = !byRole && userId ? groupsGivingRole(bench, userId, r)[0] : undefined;
    const tip = `${rname(r)} — ${off ? "이 역할에 값은 있지만 꺼진 길입니다" : "이 역할로 켜졌습니다"}`;
    if (g && !off) {
      return (
        <button key={r} type="button" className={`pb-rtag${r === roleId ? " is-cur" : ""}`} title={`${tip} · 누르면 아래 퍼미션에서 이 역할을 봅니다`} onClick={() => p.onGoRole(r, g)}>
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
      {(!x.on || !x.roles.length) && <span className="pb-small pb-faint">{x.short}</span>}
    </div>
  );

  const head = (
    <div className="pb-panel-head">
      <SegmentedControl value={by} onChange={(v) => p.onSetBy(v as BenchBy)} options={BY_OPTIONS} ariaLabel="보는 기준" />
      <h3>{byRole ? `「${role?.ROLE_NM ?? "역할 없음"}」만 받은 사람으로 보기` : `「${who}」으로 보기`}</h3>
      {/* 2단계(f3): 「현재 · 초안」 보기 자리 */}
      <span className="pb-small pb-muted">메뉴 {fmtNum(visibleCnt)}개</span>
    </div>
  );

  const crumb = objectId && tree ? menuPathOf(tree, objectId, screen?.MENU_ID) : "";
  const hidden = screen?.SHOW_TP === "N";

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
          <button key={it.MENU_ID} type="button" className={`lv2${it.MENU_ID === selectedMenuId ? " is-on" : ""}`} onClick={() => p.onSelectObject(oid, it.MENU_ID)}>
            <span className="pb-sl">{it.NAME}</span>
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
            : `「${who}」이(가) 받은 역할 중 하나를 골라 봅니다. 위 버튼 줄은 모든 역할을 합친 결과이고, 버튼 아래 색 칩이 그 버튼을 켠 역할입니다`}
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
        canEdit={p.canEdit}
        onGoRole={p.onGoRole}
        onSetPerm={p.onSetPerm}
      />
    </div>
  ) : null;

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
                <span className={`pb-abtn${x.on ? "" : " is-locked"}`} tabIndex={0} title={x.why}>
                  {!x.on && <IconLock size={11} stroke={2.4} aria-hidden />}
                  {btnLabel(x.code)}
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
                  <span className={`pb-pbtn${x.on ? "" : " is-locked"}`} tabIndex={0} title={x.why}>
                    {x.on ? "⧉" : <IconLock size={11} stroke={2.4} aria-hidden />} {popLabel(x.code)}
                    <code>{x.code}</code>
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
          「{who}」은(는) 현재 이 화면을 열 수 없습니다. 메뉴에도 보이지 않습니다.
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
            <span>현재 권한으로 보는 중</span>
          </div>
          <div className="pb-appbody">
            {navEl}
            <div className="pb-appmain">{main}</div>
          </div>
        </div>
      </div>
      {/* 2단계(f3): 「초안 영향」 묶음 자리 */}
    </Panel>
  );
});
