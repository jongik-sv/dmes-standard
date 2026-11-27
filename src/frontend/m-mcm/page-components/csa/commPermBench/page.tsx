"use client";

/**
 * commPermBench 화면 — 권한 작업대(시안 docs/perm-bench/mock-v16.html 「권한 작업대」 본문).
 *
 * 1단계(f2, 보기만): 사람 → 역할 그룹 → 역할 → 메뉴 칸, 사람 기준·역할 기준 미리보기, 버튼 아래 켠 역할과 잠긴 이유, 퍼미션 칩·이 메뉴를 연 역할.
 * 2단계(f3, 편집·초안): 모든 체크·칩 편집 → 화면 초안(자동 저장) → 초안 막대(바꾼 것·영향·이력·버리기·적용), 미리보기 「현재/초안」 비교,
 *   초안 영향(타일·바꾼 것 되돌리기·영향받는 사람), 잃는 사람 확인, 충돌 안내.
 * 3단계(f4): 칸 머리 ↗·폴더 연필 = 원래 프로그램 링크(nav.ts), 돌아오면 다시 읽기.
 *
 * 칸 폭: 칸 사이 경계를 끌거나 ← → 키. 사람 기준·역할 기준 칸 폭은 따로 저장한다.
 */
import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { PageLayout, type PageButton } from "@dk-oasis/shared/layout";
import { Button } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { ResizableColumns, type ResizableColumnDef, type ResizableColumnsHandle } from "@dk-oasis/shared/resizable-columns";
import { createMockPermBenchApi } from "./mock";
import { createPermBenchApi } from "./api";
import { useReloadOnReturn } from "./nav";
import { fmtNum, screenRowOf, unusedObjectsOf } from "./model";
import { PermApplyError, type YN } from "./types";
import { benchErrorText, scopeNames } from "./draft";
import { BenchContext, type BenchCtx } from "./parts";
import { PeopleCol } from "./PeopleCol";
import { GroupCol } from "./GroupCol";
import { RoleAllCol, RoleCol } from "./RoleCol";
import { MenuCol } from "./MenuCol";
import { Preview } from "./Preview";
import { DraftBar, ImpactBlock } from "./DraftParts";
import { ApplyModal, HistoryModal, type ApplyOutcome } from "./DraftModals";
import { PERM_BENCH_CSS, PERM_BENCH_STYLE_HREF } from "./styles";
import { useBenchState } from "./useBenchState";
import { DraftSaveError } from "./useBenchDraft";
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

const PHASE_TEXT = { 1: "1단계 · 보기만", 2: "2단계 · 편집과 시뮬레이션", 3: "3단계 · 편집 · 원래 프로그램 링크" } as const;

export default function CommPermBenchPage() {
  const api = useMemo(() => (USE_MOCK ? createMockPermBenchApi({ latencyMs: 0 }) : createPermBenchApi()), []);
  const { showMessage } = useMessage();
  const onError = useCallback(
    (e: unknown) => {
      // 충돌·잃는 사람 확인은 적용 창이 따로 다룬다
      if (e instanceof PermApplyError && (e.code === "PERM_CONFLICT" || e.code === "PERM_NEED_CONFIRM")) return;
      const t = benchErrorText(e);
      // 잠금 충돌(같은 초안 저장 중·잠금 대기 넘음)은 잠시 뒤 다시 하면 되므로 경고 토스트로
      const busy = e instanceof PermApplyError && (e.code === "PERM_DRAFT_BUSY" || e.code === "PERM_BUSY");
      showMessage({ message: t.message, alertType: busy ? "warning" : "error", toast: busy });
    },
    [showMessage],
  );
  const { sel, data, view, draft, actions, edit, look, canEdit, canLink, isSysadmin } = useBenchState(api, { onError });
  const { bench: base, benchLoading, error, menuTrees, rolePerms, explains, draftTrees, draftExplains, reload, retry, hasFailed } = data;
  const bench = view.bench;
  const rzRef = useRef<ResizableColumnsHandle>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conflict, setConflict] = useState<string[] | null>(null);

  // 3단계(f4): 원래 프로그램에서 돌아오면 다시 읽는다
  useReloadOnReturn(reload);

  const buttons = useMemo<PageButton[]>(() => [{ id: "reload", label: "다시 읽기", type: "primary", onClick: reload }], [reload]);
  const ctx = useMemo<BenchCtx | null>(() => (bench && base ? { bench, base, canLink, isSysadmin } : null), [bench, base, canLink, isSysadmin]);

  const { by, userId, groupId, roleId, objectId, menuId } = sel;
  const cmp = look === "DRAFT";
  const roleTree = roleId ? menuTrees.get(roleTreeKey(roleId)) : undefined;
  const userTree = by === "person" && userId ? menuTrees.get(userTreeKey(userId)) : undefined;
  const curPreviewTree = by === "person" ? userTree : roleTree;
  const draftPreviewTree = cmp ? draftTrees.get(by === "person" && userId ? userTreeKey(userId) : roleTreeKey(roleId ?? "")) : undefined;
  const probeUserId = base?.users[0]?.USER_ID ?? "";
  const exKey = objectId ? explainKey(by === "person" && userId ? userId : probeUserId, objectId) : "";
  const curExplain = exKey ? explains.get(exKey) : undefined;
  // 역할 기준 explain 은 허용 값·사용 여부만 쓰므로 현재 값으로 충분하다
  const lookExplain = cmp && by === "person" ? (exKey ? draftExplains.get(exKey) : undefined) : curExplain;

  // 읽기 실패: 메뉴 칸 = 이 역할의 메뉴 트리·퍼미션, 미리보기 = 미리보기 메뉴 트리·판정(explain). 「다시 읽기」는 실패한 키만 다시 요청한다
  const menuFailed = !!roleId && (hasFailed("t", roleTreeKey(roleId)) || hasFailed("p", roleId));
  const previewTreeKey = by === "person" && userId ? userTreeKey(userId) : roleId ? roleTreeKey(roleId) : "";
  const previewFailed =
    (!!previewTreeKey && (hasFailed("t", previewTreeKey) || (cmp && hasFailed("t", previewTreeKey, "DRAFT")))) ||
    (!!exKey && (hasFailed("e", exKey) || (cmp && by === "person" && hasFailed("e", exKey, "DRAFT"))));

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

  // ── 초안 막대·적용 ────────────────────────────────────────
  const { flush, discard, apply } = draft;
  const onDiscard = useCallback(() => {
    showMessage({
      alertType: "confirm",
      message: draft.status === "corrupt" ? "깨진 초안을 버립니다. 버린 초안은 되살릴 수 없습니다." : `초안 ${fmtNum(draft.draft.size)}건을 버립니다. 버린 초안은 되살릴 수 없습니다.`,
      onConfirm: () => {
        // 버렸을 때만 안내하고 충돌 안내도 지운다(실패는 onError 가 알렸다, f3 리뷰 2·12)
        void discard().then((ok) => {
          if (!ok) return;
          setConflict(null);
          actions.setFlash("초안을 버렸습니다");
        });
      },
    });
  }, [showMessage, discard, draft.status, draft.draft.size, actions]);
  const onRetrySave = useCallback(() => void flush(), [flush]);
  const onReloadCur = useCallback(() => {
    setConflict(null);
    reload();
  }, [reload]);
  const onApplyOpen = useCallback(() => {
    // 영향·적용은 저장한 초안으로 센다 — 남은 저장을 먼저 끝낸다
    void flush().then((ok) => {
      if (ok) setApplyOpen(true);
    });
  }, [flush]);
  const onApplyClose = useCallback(() => setApplyOpen(false), []);
  const onApply = useCallback(
    async (memo: string, confirmLoss: YN): Promise<ApplyOutcome> => {
      try {
        const r = await apply(memo, confirmLoss);
        const row = r.result[0];
        setConflict(null);
        reload();
        showMessage({ message: `초안 ${fmtNum(row?.CHANGE_CNT ?? 0)}건을 적용했습니다.${row?.APPLY_ID ? ` (${row.APPLY_ID})` : ""}`, alertType: "success" });
        return { kind: "done" };
      } catch (e) {
        if (e instanceof PermApplyError && e.code === "PERM_NEED_CONFIRM") return { kind: "confirm", message: e.message };
        if (e instanceof PermApplyError && e.code === "PERM_CONFLICT") {
          setConflict(base ? scopeNames(e.scopes, base) : e.scopes);
          return { kind: "done" };
        }
        // 적용 전 저장 실패는 저장 쪽이 이미 알렸다(f3 리뷰 6)
        if (e instanceof DraftSaveError) return { kind: "error" };
        const t = benchErrorText(e);
        showMessage({ message: t.message, alertType: "error" });
        return { kind: "error" };
      }
    },
    [apply, reload, showMessage, base],
  );
  const onHistory = useCallback(() => setHistoryOpen(true), []);
  const onHistoryClose = useCallback(() => setHistoryOpen(false), []);

  const pending = draft.dirty || draft.saving;
  const footer = useMemo(
    () =>
      sel.phase >= 2 ? (
        <ImpactBlock
          changes={draft.draft}
          impact={draft.impact}
          impactLoading={draft.impactLoading}
          pending={pending}
          canEdit={canEdit}
          basePerms={rolePerms}
          userId={by === "person" ? userId : null}
          onRevert={edit.revert}
          onSelectUser={actions.selectUser}
        />
      ) : null,
    [sel.phase, draft.draft, draft.impact, draft.impactLoading, pending, canEdit, rolePerms, by, userId, edit.revert, actions.selectUser],
  );

  const menuCol = (
    <MenuCol
      roleId={roleId}
      objectId={objectId}
      menuId={menuId}
      tree={roleTree}
      rolePerm={view.menuRolePerm}
      basePerm={roleId ? rolePerms.get(roleId) : undefined}
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
      look={look}
      source={sel.source}
      showLook={sel.phase >= 2}
      pending={pending}
      tree={cmp ? draftPreviewTree : curPreviewTree}
      baseTree={cmp ? curPreviewTree : undefined}
      explain={lookExplain}
      baseExplain={cmp ? curExplain : undefined}
      failed={previewFailed}
      rolePerms={view.rolePerms}
      basePerms={rolePerms}
      unusedObjs={unusedObjs}
      canEdit={canEdit}
      footer={footer}
      onSetBy={actions.setBy}
      onSetSource={actions.setSource}
      onSelectObject={actions.selectObject}
      onToggleNav={actions.toggleNav}
      onGoRole={actions.goRole}
      onRetry={retry}
      onSetPerm={edit.setPermValues}
      onResetPerm={edit.resetPerm}
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
          <span className="pb-phase">{PHASE_TEXT[sel.phase]}</span>
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
          <span className="pb-small pb-muted">칸 사이 경계를 끌면 폭이 바뀝니다 · ← → 키로도</span>
          <Button size="mini" onClick={() => rzRef.current?.resetAll()}>
            모든 칸 폭 처음대로
          </Button>
        </div>
        {sel.phase >= 2 && (
          <DraftBar
            status={draft.status}
            count={draft.draft.size}
            savedAt={draft.savedAt}
            dirty={draft.dirty}
            saving={draft.saving}
            saveError={draft.saveError}
            impact={draft.impact}
            impactLoading={draft.impactLoading}
            conflict={conflict}
            onDiscard={onDiscard}
            onApply={onApplyOpen}
            onHistory={onHistory}
            onRetrySave={onRetrySave}
            onReloadDraft={draft.reloadDraft}
            onReloadCur={onReloadCur}
          />
        )}
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
              {applyOpen && <ApplyModal count={draft.draft.size} impact={draft.impact} impactLoading={draft.impactLoading || pending} onClose={onApplyClose} onApply={onApply} />}
              {historyOpen && base && <HistoryModal api={api} base={base} onClose={onHistoryClose} />}
            </BenchContext.Provider>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
