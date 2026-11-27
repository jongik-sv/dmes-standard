"use client";

/**
 * 퍼미션 칸 — 미리보기 화면 안 「퍼미션」 묶음(시안 colPerm(inner) · rolePick · openRoles).
 * 2단계부터 칩을 켜고 끄면 초안에 담긴다(ToggleChipGroup, baseValue = 현재 값 → 추가·제거 모양).
 *   - 마지막 버튼 칩을 끄면 퍼미션 줄을 뺀다(D14). 팝업 칩은 버튼이 하나라도 있어야 고른다.
 *   - 「모두 · 조회만 · 없음 · 현재 값으로」 일괄 단추(조회만 = 서버 OBJ_READ_PERM, D18).
 *   - 오브젝트 밖 값(D15): 고친 줄은 저장 때 빠진다 — 그 줄에 한 줄로 알린다.
 */
import { memo, useMemo } from "react";
import { ToggleChipGroup, type ToggleChipOption } from "@dk-oasis/shared/toggle-chip-group";
import { Button } from "@dk-oasis/shared/form";
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
import { permDiffKind, type ChangeKind } from "./draft";
import { RoleChip, StatusTag, useBench } from "./parts";

export interface PermColProps {
  by: BenchBy;
  userId: string | null;
  roleId: string | null;
  objectId: string;
  objectName: string;
  /** 오브젝트 허용 값. 모르면 undefined(읽는 중). */
  allowed: ObjAllowed | undefined;
  objUnused: boolean;
  /** 역할별 퍼미션(읽은 것만) + 초안. */
  rolePerms: ReadonlyMap<string, RolePermMap>;
  /** 같은 것의 현재 값(초안 차이 기준). */
  basePerms: ReadonlyMap<string, RolePermMap>;
  canEdit: boolean;
  onGoRole: (roleId: string, groupId: string) => void;
  /** 퍼미션 버튼·팝업 칩(초안). 버튼이 비면 등록 해제. */
  onSetPerm: (btn: readonly string[], popup: readonly string[]) => void;
  /** 현재 값으로. */
  onResetPerm: () => void;
}

const noop = () => undefined;
const OPEN_TAG: Record<ChangeKind, string> = { add: "새로 엶", del: "닫음", mod: "버튼 바뀜" };
const DIFF_TITLES = { added: "초안에서 켬", removed: "초안에서 끔" };

export const PermCol = memo(function PermCol(p: PermColProps) {
  const { bench } = useBench();
  const { roleId, objectId, allowed, objUnused, rolePerms, basePerms } = p;
  const row = roleId ? rolePerms.get(roleId)?.get(objectId) : undefined;
  const baseRow = roleId ? basePerms.get(roleId)?.get(objectId) : undefined;
  const locked = roleId === PERM_SYSADMIN_ROLE_ID;
  const role = roleId ? bench.roleById.get(roleId) : undefined;
  const hasRow = hasPerm(row);
  const loaded = !!roleId && (locked || rolePerms.has(roleId));
  const editable = p.canEdit && !locked && loaded;
  const chg = locked ? null : permDiffKind(baseRow, row);

  const btnOptions = useMemo<ToggleChipOption[]>(() => (allowed?.btn ?? []).map((b) => ({ value: b, title: btnLabel(b) })), [allowed]);
  // 팝업은 버튼이 하나라도 있어야 고른다(퍼미션 줄 = 버튼 있음, D14)
  const popOff = editable && !hasRow;
  const popOptions: ToggleChipOption[] = (allowed?.popup ?? []).map((c) => ({ value: c, title: popLabel(c), disabled: popOff }));

  const rawBtn = locked ? allowed?.btn ?? [] : hasRow ? parseTokens(row.BTN_PERM) : [];
  const rawPop = locked ? allowed?.popup ?? [] : hasRow ? parseTokens(row.POPUP_PERM) : [];
  const baseBtn = hasPerm(baseRow) ? parseTokens(baseRow.BTN_PERM) : [];
  const basePop = hasPerm(baseRow) ? parseTokens(baseRow.POPUP_PERM) : [];
  // 오브젝트 밖 값: 고치지 않은 줄은 그대로 남아 있다(계산에서 빠짐). 고친 줄은 저장 때 빠진다(draft.setPerm)
  const orphan = orphanTokens(row, allowed);
  const baseOrphan = orphanTokens(baseRow, allowed);
  const dropped = chg && chg !== "del" ? [...baseOrphan.btn, ...baseOrphan.popup] : [];
  const readBtn = parseTokens((row ?? baseRow)?.OBJ_READ_PERM).filter((x) => allowed?.btn.includes(x));

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
            {chg && (
              <StatusTag kind={chg} title="초안에서 바뀐 퍼미션">
                {chg === "add" ? "새로 등록" : chg === "del" ? "등록 해제" : "바뀜"}
              </StatusTag>
            )}
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
            <ToggleChipGroup
              aria-label="버튼 권한"
              options={btnOptions}
              value={rawBtn}
              baseValue={p.canEdit && !locked ? baseBtn : undefined}
              diffTitles={DIFF_TITLES}
              onChange={editable ? (v) => p.onSetPerm(v, rawPop) : noop}
              readOnly={!editable}
            />
          ) : (
            <span className="pb-small pb-faint">오브젝트 버튼을 읽는 중입니다.</span>
          )}
          <h5 className="pb-psub">
            팝업 권한{" "}
            <span className="pb-small pb-muted">
              POPUP_PERM · 오브젝트에 적은 팝업 안에서{editable && !hasRow ? " · 버튼을 하나 켜면 고를 수 있습니다" : ""}
            </span>
          </h5>
          {allowed && allowed.popup.length ? (
            <ToggleChipGroup
              aria-label="팝업 권한"
              options={popOptions}
              value={rawPop}
              baseValue={p.canEdit && !locked ? basePop : undefined}
              diffTitles={DIFF_TITLES}
              onChange={editable ? (v) => p.onSetPerm(rawBtn, v) : noop}
              readOnly={!editable}
            />
          ) : (
            <span className="pb-small pb-faint">오브젝트에 팝업 권한이 없습니다</span>
          )}
          {dropped.length > 0 ? (
            <div className="pb-small pb-warn" role="note">
              오브젝트에 없는 값 <b className="pb-mono">{dropped.join(", ")}</b> 는 저장 때 빠진다
            </div>
          ) : (
            (orphan.btn.length > 0 || orphan.popup.length > 0) && (
              <div className="pb-small">
                {[...orphan.btn, ...orphan.popup].map((b) => (
                  <span key={b} className="pb-st block" style={{ marginLeft: 0, marginRight: 4 }}>
                    {b} · 오브젝트에 없음
                  </span>
                ))}
                <br />
                <span className="pb-muted">퍼미션 행에는 남아 있지만 오브젝트에서 빠져 쓸 수 없습니다.{editable && " 칩을 고치면 저장 때 빠집니다."}</span>
              </div>
            )
          )}
          <div className="pb-small pb-muted">
            {locked
              ? "시스템 관리자는 퍼미션 행 없이 오브젝트의 모든 버튼·팝업을 씁니다. 바꿀 수 없습니다."
              : hasRow
                ? `버튼 = "${row.BTN_PERM ?? ""}" · 팝업 = "${row.POPUP_PERM ?? ""}"`
                : editable
                  ? "퍼미션 행 없음 — 버튼 칩을 하나 켜면 등록됩니다."
                  : "퍼미션 행 없음 — 이 역할로는 이 화면이 메뉴에 나오지 않습니다."}
            {chg && (
              <>
                <br />
                현재 값: {hasPerm(baseRow) ? `"${baseRow.BTN_PERM ?? ""}"${baseRow.POPUP_PERM ? ` · 팝업 "${baseRow.POPUP_PERM}"` : ""}` : "행 없음"}
              </>
            )}
          </div>
          <div className="pb-ripple">↔ 이 역할을 받은 사람 {fmtNum(role?.USER_CNT ?? 0)}명에게 함께 적용됩니다.</div>
          {p.canEdit && !locked && (
            <div className="pb-toolbar" role="group" aria-label="퍼미션 한꺼번에 고르기">
              <Button size="mini" disabled={!editable || !allowed?.btn.length} onClick={() => p.onSetPerm(allowed?.btn ?? [], rawPop)}>
                모두
              </Button>
              <Button
                size="mini"
                disabled={!editable || !readBtn.length}
                title={readBtn.length ? `조회만: ${readBtn.join(", ")}` : "이 오브젝트에는 조회 버튼이 없습니다"}
                onClick={() => p.onSetPerm(readBtn, rawPop)}
              >
                조회만
              </Button>
              <Button size="mini" disabled={!editable || !hasRow} title="퍼미션 줄을 뺍니다(등록 해제)" onClick={() => p.onSetPerm([], [])}>
                없음
              </Button>
              {chg && (
                <Button size="mini" disabled={!editable} onClick={p.onResetPerm}>
                  현재 값으로
                </Button>
              )}
            </div>
          )}
        </>
      )}
      <OpenRoles {...p} />
    </div>
  );
});

/** 퍼미션을 고칠 역할 고르기(시안 rolePick). 사람 기준 = 그 사람이 받은 역할, 역할 기준 = 고른 역할 한 줄. */
function RolePick({ by, userId, roleId, objectName, objectId, allowed, rolePerms, basePerms, canEdit, onGoRole }: PermColProps) {
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
    <div className="pb-rpick" role="group" aria-label="퍼미션을 고칠 역할">
      <span className="pb-small pb-muted">{canEdit ? "고칠 역할" : "볼 역할"}</span>
      {rs.map((r) => {
        const row = rolePerms.get(r)?.get(objectId);
        const unused = bench.roleById.get(r)?.USE_TP === "N";
        const eff = effectivePerm(r, row, allowed, { roleUnused: unused });
        const total = allowed?.btn.length ?? 0;
        const cnt = r === PERM_SYSADMIN_ROLE_ID ? "모두" : hasPerm(row) ? `${eff.btn.length}/${total}` : rolePerms.has(r) ? "미등록" : "…";
        const g = groupsGivingRole(bench, userId, r)[0];
        const changed = r !== PERM_SYSADMIN_ROLE_ID && !!permDiffKind(basePerms.get(r)?.get(objectId), row);
        return (
          <button
            key={r}
            type="button"
            aria-pressed={r === roleId}
            title={`${bench.roleById.get(r)?.ROLE_NM ?? r}의 퍼미션을 ${canEdit ? "고칩니다" : "봅니다"}`}
            onClick={() => g && onGoRole(r, g)}
          >
            <RoleChip roleId={r} />
            <span className={hasPerm(row) || r === PERM_SYSADMIN_ROLE_ID ? "" : "pb-faint"}>{cnt}</span>
            {changed && <i className="pb-chd" title="초안에서 바뀜" />}
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
function OpenRoles({ by, userId, roleId, objectId, allowed, objUnused, rolePerms, basePerms, onGoRole }: PermColProps) {
  const { bench } = useBench();
  const byRole = by === "role";
  const rname = (r: string) => bench.roleById.get(r)?.ROLE_NM ?? r;
  const uname = byRole ? `${roleId ? rname(roleId) : ""}만 받은 사람` : (userId && bench.userById.get(userId)?.USER_NM) || "";
  const mine = byRole ? (roleId ? [roleId] : []) : userId ? rolesOfUser(bench, userId) : [];
  // SYSADMIN 은 퍼미션 줄 없이 모두 받는다 — 이미 읽은 역할 정보(받은 역할 목록)만으로 한 줄을 만든다
  const hasAdmin = mine.includes(PERM_SYSADMIN_ROLE_ID);
  const rows = mine.filter((r) => r !== PERM_SYSADMIN_ROLE_ID);
  const loading = rows.some((r) => !rolePerms.has(r));
  // 초안에서 닫은 역할도 「닫음」으로 남긴다
  const mineR = rows.filter((r) => hasPerm(rolePerms.get(r)?.get(objectId)) || hasPerm(basePerms.get(r)?.get(objectId)));

  const line = (r: string) => {
    const unused = bench.roleById.get(r)?.USE_TP === "N";
    const row = rolePerms.get(r)?.get(objectId);
    const eff = effectivePerm(r, row, allowed, { roleUnused: unused, objUnused });
    const k = permDiffKind(basePerms.get(r)?.get(objectId), row);
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
        {k && <StatusTag kind={k}>{OPEN_TAG[k]}</StatusTag>}
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
        이 메뉴를 연 역할 <span className="pb-small pb-muted">{byRole ? "고른 역할" : "받은 역할"} 중 퍼미션 행이 있는 역할 {loading ? "…" : `${mineR.filter((r) => hasPerm(rolePerms.get(r)?.get(objectId))).length}개`}</span>
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
