"use client";

/**
 * 퍼미션 칸 — 미리보기 화면 안 「퍼미션」 묶음(시안 colPerm(inner) · rolePick · openRoles).
 * 1단계는 칩을 보기만 한다(ToggleChipGroup readOnly). 2단계(f3)에서 onSetPerm·「모두/조회만/없음」 일괄 단추를 잇는다.
 */
import { memo, useMemo } from "react";
import { ToggleChipGroup, type ToggleChipOption } from "@dk-oasis/shared/toggle-chip-group";
import { PERM_SYSADMIN_ROLE_ID } from "./types";
import {
  effectivePerm,
  fmtNum,
  groupsGivingRole,
  hasPerm,
  orphanTokens,
  parseTokens,
  popLabel,
  rolesOfUser,
  btnLabel,
  type BenchBy,
  type ObjAllowed,
  type RolePermMap,
} from "./model";
import { RoleChip, useBench } from "./parts";

export interface PermColProps {
  by: BenchBy;
  userId: string | null;
  roleId: string | null;
  objectId: string;
  objectName: string;
  /** 오브젝트 허용 값. 모르면 undefined(읽는 중). */
  allowed: ObjAllowed | undefined;
  objUnused: boolean;
  /** 역할별 퍼미션(읽은 것만). */
  rolePerms: ReadonlyMap<string, RolePermMap>;
  canEdit: boolean;
  onGoRole: (roleId: string, groupId: string) => void;
  /** 2단계(f3) 자리 — 퍼미션 버튼·팝업 칩. */
  onSetPerm: (btn: readonly string[], popup: readonly string[]) => void;
}

const noop = () => undefined;

export const PermCol = memo(function PermCol(p: PermColProps) {
  const { bench } = useBench();
  const { roleId, objectId, allowed, objUnused, rolePerms } = p;
  const row = roleId ? rolePerms.get(roleId)?.get(objectId) : undefined;
  const locked = roleId === PERM_SYSADMIN_ROLE_ID;
  const role = roleId ? bench.roleById.get(roleId) : undefined;

  const btnOptions = useMemo<ToggleChipOption[]>(() => (allowed?.btn ?? []).map((b) => ({ value: b, title: btnLabel(b) })), [allowed]);
  const popOptions = useMemo<ToggleChipOption[]>(() => (allowed?.popup ?? []).map((c) => ({ value: c, title: popLabel(c) })), [allowed]);

  const rawBtn = locked ? allowed?.btn ?? [] : hasPerm(row) ? parseTokens(row.BTN_PERM) : [];
  // 버튼·팝업 모두 퍼미션 줄의 값 그대로(오브젝트에 없는 값 포함). 편집 때 칩이 못 보이는 값을 잃지 않도록 onChange 에서 되붙인다
  const rawPop = locked ? allowed?.popup ?? [] : hasPerm(row) ? parseTokens(row.POPUP_PERM) : [];
  const orphan = orphanTokens(row, allowed);
  const editable = p.canEdit && !locked;

  return (
    <div className="pb-stack">
      <RolePick {...p} />
      {!roleId ? (
        <p className="pb-small pb-muted" style={{ margin: 0 }}>
          역할을 고르면 그 역할의 퍼미션이 나옵니다.
        </p>
      ) : (
        <>
          <div className="pb-pk">
            <span>PK</span>
            <span className="pb-mono">ROLE_ID = {roleId}</span>
            <span className="pb-mono">OBJECT_ID = {objectId}</span>
          </div>
          {objUnused && (
            <div className="pb-small">
              <b className="pb-bad">오브젝트가 「사용 안 함」</b>이라 아래 버튼을 골라도 아무도 쓰지 못합니다.
            </div>
          )}
          {role?.USE_TP === "N" && (
            <div className="pb-small">
              <b className="pb-bad">역할이 「사용 안 함」</b>이라 이 퍼미션은 계산에서 빠집니다.
            </div>
          )}
          <h5 className="pb-psub">
            버튼 권한 <span className="pb-small pb-muted">BTN_PERM</span>
          </h5>
          {allowed ? (
            <ToggleChipGroup aria-label="버튼 권한" options={btnOptions} value={rawBtn} onChange={editable ? (v) => p.onSetPerm([...v, ...orphan.btn], rawPop) : noop} readOnly={!editable} />
          ) : (
            <span className="pb-small pb-faint">오브젝트 버튼을 읽는 중입니다.</span>
          )}
          <h5 className="pb-psub">
            팝업 권한 <span className="pb-small pb-muted">POPUP_PERM · 오브젝트에 적은 팝업 안에서</span>
          </h5>
          {allowed && allowed.popup.length ? (
            <ToggleChipGroup aria-label="팝업 권한" options={popOptions} value={rawPop} onChange={editable ? (v) => p.onSetPerm(rawBtn, [...v, ...orphan.popup]) : noop} readOnly={!editable} />
          ) : (
            <span className="pb-small pb-faint">오브젝트에 팝업 권한이 없습니다</span>
          )}
          {(orphan.btn.length > 0 || orphan.popup.length > 0) && (
            <div className="pb-small">
              {[...orphan.btn, ...orphan.popup].map((b) => (
                <span key={b} className="pb-st block" style={{ marginLeft: 0, marginRight: 4 }}>
                  {b} · 오브젝트에 없음
                </span>
              ))}
              <br />
              <span className="pb-muted">퍼미션 행에는 남아 있지만 오브젝트에서 빠져 쓸 수 없습니다.</span>
            </div>
          )}
          <div className="pb-small pb-muted">
            {locked
              ? "시스템 관리자는 퍼미션 행 없이 오브젝트의 모든 버튼·팝업을 씁니다."
              : hasPerm(row)
                ? `버튼 = "${row.BTN_PERM ?? ""}" · 팝업 = "${row.POPUP_PERM ?? ""}"`
                : "퍼미션 행 없음 — 이 역할로는 이 화면이 메뉴에 나오지 않습니다."}
          </div>
          <div className="pb-ripple">↔ 이 역할을 받은 사람 {fmtNum(role?.USER_CNT ?? 0)}명에게 함께 적용됩니다.</div>
          {/* 2단계(f3): 「모두 · 조회만 · 없음 · 현재 값으로」 일괄 단추 자리 */}
        </>
      )}
      <OpenRoles {...p} />
    </div>
  );
});

/** 퍼미션을 볼 역할 고르기(시안 rolePick). 사람 기준 = 그 사람이 받은 역할, 역할 기준 = 고른 역할 한 줄. */
function RolePick({ by, userId, roleId, objectName, objectId, allowed, rolePerms, onGoRole }: PermColProps) {
  const { bench } = useBench();
  if (by === "role") {
    const role = roleId ? bench.roleById.get(roleId) : undefined;
    return (
      <div className="pb-small">
        {roleId ? <RoleChip roleId={roleId} /> : "역할 없음"} × 「{objectName}」{" "}
        <span className="pb-muted">· 이 역할을 받은 사람 {fmtNum(role?.USER_CNT ?? 0)}명</span>
      </div>
    );
  }
  if (!userId) return null;
  const rs = rolesOfUser(bench, userId);
  if (!rs.length) return <div className="pb-small pb-muted">「{bench.userById.get(userId)?.USER_NM ?? userId}」은(는) 받은 역할이 없습니다.</div>;
  return (
    <div className="pb-rpick" role="group" aria-label="퍼미션을 볼 역할">
      <span className="pb-small pb-muted">볼 역할</span>
      {rs.map((r) => {
        const row = rolePerms.get(r)?.get(objectId);
        const unused = bench.roleById.get(r)?.USE_TP === "N";
        const eff = effectivePerm(r, row, allowed, { roleUnused: unused });
        const total = allowed?.btn.length ?? 0;
        const cnt = r === PERM_SYSADMIN_ROLE_ID ? "모두" : hasPerm(row) ? `${eff.btn.length}/${total}` : rolePerms.has(r) ? "미등록" : "…";
        const g = groupsGivingRole(bench, userId, r)[0];
        return (
          <button
            key={r}
            type="button"
            aria-pressed={r === roleId}
            title={`${bench.roleById.get(r)?.ROLE_NM ?? r}의 퍼미션을 봅니다`}
            onClick={() => g && onGoRole(r, g)}
          >
            <RoleChip roleId={r} />
            <span className={hasPerm(row) || r === PERM_SYSADMIN_ROLE_ID ? "" : "pb-faint"}>{cnt}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 고른 화면(오브젝트)에 퍼미션 줄이 있는 역할(시안 openRoles). 사람 기준 = 그 사람이 받은 역할만, 역할 기준 = 고른 역할 하나.
 * 받지 않은 다른 역할은 보이지 않는다 — 그러려면 역할마다 퍼미션 줄 1,000여 개를 읽어야 해서(BE 결정 13a) 읽지 않는다.
 */
function OpenRoles({ by, userId, roleId, objectId, allowed, objUnused, rolePerms, onGoRole }: PermColProps) {
  const { bench } = useBench();
  const byRole = by === "role";
  const rname = (r: string) => bench.roleById.get(r)?.ROLE_NM ?? r;
  const uname = byRole ? `${roleId ? rname(roleId) : ""}만 받은 사람` : (userId && bench.userById.get(userId)?.USER_NM) || "";
  const mine = byRole ? (roleId ? [roleId] : []) : userId ? rolesOfUser(bench, userId) : [];
  // SYSADMIN 은 퍼미션 줄 없이 모두 받는다 — 이미 읽은 역할 정보(받은 역할 목록)만으로 한 줄을 만든다
  const hasAdmin = mine.includes(PERM_SYSADMIN_ROLE_ID);
  const rows = mine.filter((r) => r !== PERM_SYSADMIN_ROLE_ID);
  const loading = rows.some((r) => !rolePerms.has(r));
  const mineR = rows.filter((r) => hasPerm(rolePerms.get(r)?.get(objectId)));

  const line = (r: string) => {
    const unused = bench.roleById.get(r)?.USE_TP === "N";
    const eff = effectivePerm(r, rolePerms.get(r)?.get(objectId), allowed, { roleUnused: unused, objUnused });
    const gs = !byRole && userId ? groupsGivingRole(bench, userId, r) : [];
    const go = !byRole && r !== roleId && gs[0] && (
      <button type="button" className="pb-who" title="역할 칸에서 이 역할을 고릅니다" onClick={() => onGoRole(r, gs[0])}>
        고르기
      </button>
    );
    return (
      <li key={r} className={r === roleId ? "is-on" : ""}>
        <RoleChip roleId={r} off={unused} />
        <span className="pb-btnlist">{eff.btn.length ? eff.btn.join(", ") : "(쓸 버튼 없음)"}</span>
        {unused && <span className="pb-st block">사용 안 함</span>}
        {byRole ? (
          <small>받은 사람 {fmtNum(bench.roleById.get(r)?.USER_CNT ?? 0)}명</small>
        ) : (
          <small>{gs.map((g) => bench.groupById.get(g)?.ROLE_GROUP_NM ?? g).join(", ")} 그룹으로 받음</small>
        )}
        {go}
      </li>
    );
  };

  return (
    <div className="pb-openroles">
      <h4 className="pb-sub">
        이 메뉴를 연 역할 <span className="pb-small pb-muted">{byRole ? "고른 역할" : "받은 역할"} 중 퍼미션 행이 있는 역할 {loading ? "…" : `${mineR.length}개`}</span>
      </h4>
      <span className="pb-small pb-muted">{byRole ? "고른 역할" : `「${uname}」이(가) 받은 역할로 열림`}</span>
      <ul>
        {hasAdmin && (
          <li>
            <RoleChip roleId={PERM_SYSADMIN_ROLE_ID} />
            <span className="pb-btnlist">모든 버튼</span>
            <small>퍼미션 행 없이 모든 메뉴를 엶</small>
          </li>
        )}
        {mineR.map(line)}
        {!loading && !mineR.length && !hasAdmin && <li className="is-none">「{uname}」이(가) 받은 역할로는 이 메뉴가 열리지 않습니다.</li>}
      </ul>
      <span className="pb-small pb-faint">받지 않은 역할은 읽지 않으므로 보이지 않습니다. 시스템 관리자는 모든 메뉴를 엽니다.</span>
    </div>
  );
}
