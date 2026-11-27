"use client";

/**
 * commPermBench 화면 — 권한 작업대(시안 docs/perm-bench/mock-v16.html 「권한 작업대」 본문).
 *
 * 1단계(f2, 보기만): 사람 → 역할 그룹 → 역할 → 메뉴 칸(체크는 보기만), 사람 기준·역할 기준 미리보기,
 * 버튼 아래 켠 역할과 잠긴 이유, 퍼미션 칩(보기만)·이 메뉴를 연 역할.
 * 2단계(f3)·3단계(f4)는 useBenchState 의 phase·edit 자리와 각 칸의 「2단계(f3)」 주석 자리에 붙인다.
 *
 * 칸 폭: 칸 사이 경계를 끌거나 ← → 키. 사람 기준·역할 기준 칸 폭은 따로 저장한다.
 */
import { useMemo, useRef, type CSSProperties } from "react";
import { PageLayout, type PageButton } from "@dk-oasis/shared/layout";
import { Button } from "@dk-oasis/shared/form";
import { ResizableColumns, type ResizableColumnDef, type ResizableColumnsHandle } from "@dk-oasis/shared/resizable-columns";
import { createMockPermBenchApi } from "./mock";
import { createPermBenchApi } from "./api";
import { useReloadOnReturn } from "./nav";
import { screenRowOf, unusedObjectsOf } from "./model";
import { BenchContext, type BenchCtx } from "./parts";
import { PeopleCol } from "./PeopleCol";
import { GroupCol } from "./GroupCol";
import { RoleAllCol, RoleCol } from "./RoleCol";
import { MenuCol } from "./MenuCol";
import { Preview } from "./Preview";
import { PERM_BENCH_CSS, PERM_BENCH_STYLE_HREF } from "./styles";
import { useBenchState } from "./useBenchState";
import { explainKey, roleTreeKey, userTreeKey } from "./useBenchData";

const SCREEN_ID = "commPermBench";

/** 가짜 자료로 볼지. 서버 작업대 API(bench-be b1·b5)를 붙이면 false. */
const USE_MOCK = true;

/** 칸 폭(시안 WD0). 숫자 = px. */
const PERSON_COLUMNS: ResizableColumnDef[] = [
  { key: "people", width: 210 },
  { key: "groups", width: 230 },
  { key: "roles", width: 240 },
  { key: "menu", width: 540 },
  { key: "preview", width: 860 },
];
/** 칸 높이 = 작업 영역 높이(칸 안에서 스크롤). 너무 낮은 창에서는 560px 아래로 줄이지 않고 바깥이 스크롤한다. */
const WORK_STYLE: CSSProperties = { height: "100%", minHeight: 560, gridTemplateRows: "minmax(0, 1fr)" };
const ROLE_COLUMNS: ResizableColumnDef[] = [
  { key: "roles", width: 280 },
  { key: "menu", width: 540 },
  { key: "preview", width: 860 },
];

export default function CommPermBenchPage() {
  const api = useMemo(() => (USE_MOCK ? createMockPermBenchApi({ latencyMs: 0 }) : createPermBenchApi()), []);
  const { sel, data, actions, edit, canEdit, canLink } = useBenchState(api);
  const { bench, benchLoading, error, menuTrees, rolePerms, explains, reload, retry, hasFailed } = data;
  const rzRef = useRef<ResizableColumnsHandle>(null);

  // 3단계(f4): 원래 프로그램에서 돌아오면 다시 읽는다
  useReloadOnReturn(reload);

  const buttons = useMemo<PageButton[]>(() => [{ id: "reload", label: "다시 읽기", type: "primary", onClick: reload }], [reload]);
  const ctx = useMemo<BenchCtx | null>(() => (bench ? { bench, canLink } : null), [bench, canLink]);

  const { by, userId, groupId, roleId, objectId, menuId } = sel;
  const roleTree = roleId ? menuTrees.get(roleTreeKey(roleId)) : undefined;
  const userTree = by === "person" && userId ? menuTrees.get(userTreeKey(userId)) : undefined;
  const rolePerm = roleId ? rolePerms.get(roleId) : undefined;
  const probeUserId = bench?.users[0]?.USER_ID ?? "";
  const explain = objectId ? explains.get(explainKey(by === "person" && userId ? userId : probeUserId, objectId)) : undefined;

  // 읽기 실패: 메뉴 칸 = 이 역할의 메뉴 트리·퍼미션, 미리보기 = 미리보기 메뉴 트리·판정(explain). 「다시 읽기」는 실패한 키만 다시 요청한다
  const menuFailed = !!roleId && (hasFailed("t", roleTreeKey(roleId)) || hasFailed("p", roleId));
  const previewFailed =
    (by === "person" && !!userId && hasFailed("t", userTreeKey(userId))) ||
    (by === "role" && !!roleId && hasFailed("t", roleTreeKey(roleId))) ||
    (!!objectId && hasFailed("e", explainKey(by === "person" && userId ? userId : probeUserId, objectId)));

  // 「오브젝트 사용 안 함」 모음 — 내용이 같으면 같은 Set 을 넘겨 메뉴 칸을 다시 펴지 않는다
  const unusedKey = useMemo(() => {
    const s = unusedObjectsOf(menuTrees.values());
    for (const [k, ex] of explains) {
      if (ex.buttons.some((b) => b.ALLOWED === "Y" && b.REASON === "OBJ_UNUSED")) s.add(k.slice(k.indexOf("|") + 1));
    }
    return [...s].sort().join(",");
  }, [menuTrees, explains]);
  const unusedObjs = useMemo<ReadonlySet<string>>(() => new Set(unusedKey ? unusedKey.split(",") : []), [unusedKey]);

  const crumb = useMemo(() => {
    if (!bench) return null;
    const t = roleTree ?? userTree;
    const objName = (objectId && t && screenRowOf(t, objectId, menuId)?.MENU_NM) || objectId || "화면 없음";
    const roleNm = roleId ? bench.roleById.get(roleId)?.ROLE_NM ?? roleId : "역할 없음";
    if (by === "role") {
      return (
        <>
          <b>역할 기준</b>
          <i>›</i>
          {roleNm}
          <i>›</i>
          {objName}
        </>
      );
    }
    return (
      <>
        <b>{(userId && bench.userById.get(userId)?.USER_NM) || "사람 없음"}</b>
        <i>›</i>
        {groupId ? bench.groupById.get(groupId)?.ROLE_GROUP_NM ?? groupId : "그룹 없음"}
        <i>›</i>
        {roleNm}
        <i>›</i>
        {objName}
      </>
    );
  }, [bench, by, userId, groupId, roleId, objectId, menuId, roleTree, userTree]);

  const menuCol = (
    <MenuCol
      roleId={roleId}
      objectId={objectId}
      menuId={menuId}
      tree={roleTree}
      rolePerm={rolePerm}
      failed={menuFailed}
      open={sel.open}
      mfilter={sel.mfilter}
      unusedObjs={unusedObjs}
      canEdit={canEdit}
      onSelectObject={actions.selectObject}
      onToggleOpen={actions.toggleOpen}
      onExpandAll={actions.expandAll}
      onCollapseAll={actions.collapseAll}
      onFilter={actions.setFilter}
      onToggleRegister={edit.toggleRegister}
      onRetry={retry}
    />
  );
  const preview = (
    <Preview
      by={by}
      userId={userId}
      roleId={roleId}
      objectId={objectId}
      menuId={menuId}
      nav={sel.nav}
      tree={by === "person" ? userTree : roleTree}
      explain={explain}
      failed={previewFailed}
      rolePerms={rolePerms}
      unusedObjs={unusedObjs}
      canEdit={canEdit}
      onSetBy={actions.setBy}
      onSelectObject={actions.selectObject}
      onToggleNav={actions.toggleNav}
      onGoRole={actions.goRole}
      onRetry={retry}
      onSetPerm={edit.setPermValues}
    />
  );

  return (
    <PageLayout
      title="권한 작업대"
      breadcrumb="공통관리 > 시스템관리 > 권한 작업대"
      screenId={SCREEN_ID}
      buttons={buttons}
    >
      <style href={PERM_BENCH_STYLE_HREF} precedence="default">
        {PERM_BENCH_CSS}
      </style>
      <div className="pb-root">
        <div className="pb-bar">
          <span className="pb-bar__tag">작업대</span>
          <span className="pb-phase">{sel.phase === 1 ? "1단계 · 보기만" : `${sel.phase}단계`}</span>
          {crumb && <span className="pb-crumb pb-small">{crumb}</span>}
          {sel.flash && (
            <span className="pb-flash" role="status">
              {sel.flash}
            </span>
          )}
          {error && (
            <span className="pb-err" role="alert">
              {error}
            </span>
          )}
          <span className="pb-sp" />
          {/* 2단계(f3): 초안 막대(바꾼 것·영향·초안 버리기·초안 적용) 자리 */}
          <span className="pb-small pb-muted">칸 사이 경계를 끌면 폭이 바뀝니다 · ← → 키로도</span>
          <Button size="mini" onClick={() => rzRef.current?.resetAll()}>
            모든 칸 폭 처음대로
          </Button>
        </div>
        <div className="pb-work">
          {!ctx ? (
            <div className="pb-cantopen">{benchLoading ? "작업대 자료를 읽는 중입니다." : error ?? "자료가 없습니다."}</div>
          ) : (
            <BenchContext.Provider value={ctx}>
              {by === "person" ? (
                <ResizableColumns key="person" ref={rzRef} columns={PERSON_COLUMNS} storageKey={`${SCREEN_ID}:work-person`} style={WORK_STYLE} testId="pb-work">
                  <PeopleCol userId={userId} onSelect={actions.selectUser} />
                  <GroupCol userId={userId} groupId={groupId} canEdit={canEdit} onSelect={actions.selectGroup} onToggleMember={edit.toggleMember} />
                  <RoleCol groupId={groupId} roleId={roleId} canEdit={canEdit} onSelect={actions.selectRole} onToggleGroupRole={edit.toggleGroupRole} />
                  {menuCol}
                  {preview}
                </ResizableColumns>
              ) : (
                <ResizableColumns key="role" ref={rzRef} columns={ROLE_COLUMNS} storageKey={`${SCREEN_ID}:work-role`} style={WORK_STYLE} testId="pb-work">
                  <RoleAllCol roleId={roleId} onSelect={actions.selectRoleAny} />
                  {menuCol}
                  {preview}
                </ResizableColumns>
              )}
            </BenchContext.Provider>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
