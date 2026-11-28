/**
 * 역할 관리 — 시안 D 「그 사람 눈으로 보기」(창의형, 표본 데이터만 사용).
 *
 * 생각: 관리자가 정말 알고 싶은 것은 「그래서 이 사람 화면에는 무엇이 보이나」 다. 설정이 아니라 결과를 먼저 보인다.
 *   - 사람을 고르면 그 사람이 로그인했을 때의 메뉴와, 고른 화면의 상단 버튼이 그대로 그려진다(쓸 수 없는 버튼은 잠김).
 *   - 가운데에서 역할을 켜고 끄면(「이 역할을 빼면? 더하면?」) 메뉴·버튼이 바로 바뀌고, 실제와 다른 곳에 「새로 보임」·「사라짐」 이 붙는다.
 *   - 버튼에 마우스를 올리면 그 버튼을 어느 역할이 주는지 알려 준다.
 *   - 미리 보기만 한다. 실제로 사람에게 역할을 주는 일은 역할 그룹 관리가 맡는다.
 */
import { useMemo, useState } from "react";
import { ContentBody, ContentPanel, PageLayout } from "@dk-oasis/shared/layout";
import { Badge, Checkbox, Input } from "@dk-oasis/shared/form";
import { MutedText } from "@dk-oasis/shared/card";
import { IconLock } from "@tabler/icons-react";
import {
  INITIAL_GRANTS,
  MENU_GROUPS,
  NONE,
  PERM_LEVEL_BY_ID,
  ROLE_GROUPS,
  ROLES,
  SCREENS,
  SCREEN_BY_ID,
  USERS,
} from "../../data/role-mgmt-mock";
import { LevelChip } from "./LevelChip";
import { LEVEL_LABELS, effectiveGrants, levelOf, roleName, rolesOfUser } from "./role-model";

const DEFAULT_BUTTONS = ["조회", "엑셀", "등록", "저장", "삭제", "복사", "확정", "확정 취소"];
const SCREEN_BUTTONS: Record<string, string[]> = { userQuery: ["목록", "실행"] };

const canPress = (levelId: string, button: string) => {
  const actions = PERM_LEVEL_BY_ID.get(levelId)?.actions ?? [];
  return actions.includes("모든 버튼") || actions.includes(button);
};

export function RoleViewAsScreen() {
  const [userId, setUserId] = useState("u4002");
  const [keyword, setKeyword] = useState("");
  /** 사람별로 켜고 끈 역할. 없으면 실제 역할 그대로. */
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const [screenId, setScreenId] = useState<string>("scheduleGantt");
  const [showHidden, setShowHidden] = useState(false);

  const user = USERS.find((u) => u.userId === userId)!;
  const actualRoles = useMemo(() => rolesOfUser(userId), [userId]);
  const activeRoles = overrides[userId] ?? actualRoles;
  const simulated = overrides[userId] !== undefined;

  const actual = useMemo(() => effectiveGrants(INITIAL_GRANTS, actualRoles), [actualRoles]);
  const preview = useMemo(() => effectiveGrants(INITIAL_GRANTS, activeRoles), [activeRoles]);
  const actualMap = useMemo(() => new Map(actual.map((g) => [g.screenId, g])), [actual]);
  const previewMap = useMemo(() => new Map(preview.map((g) => [g.screenId, g])), [preview]);

  const added = preview.filter((g) => !actualMap.has(g.screenId)).length;
  const removed = actual.filter((g) => !previewMap.has(g.screenId)).length;
  const changedLevel = preview.filter((g) => actualMap.has(g.screenId) && actualMap.get(g.screenId)!.level !== g.level).length;

  const toggleRole = (roleId: string, on: boolean) =>
    setOverrides((prev) => {
      const cur = prev[userId] ?? actualRoles;
      const next = on ? [...new Set([...cur, roleId])] : cur.filter((r) => r !== roleId);
      const same = next.length === actualRoles.length && next.every((r) => actualRoles.includes(r));
      const copy = { ...prev };
      if (same) delete copy[userId];
      else copy[userId] = next;
      return copy;
    });

  const viaGroups = (roleId: string) =>
    ROLE_GROUPS.filter((g) => user.groupIds.includes(g.id) && g.roleIds.includes(roleId)).map((g) => g.name);

  const people = USERS.filter((u) => !keyword.trim() || `${u.name}${u.dept}`.includes(keyword.trim()));

  const selected = previewMap.get(screenId) ?? null;
  const selectedScreen = SCREEN_BY_ID.get(screenId);
  const buttons = SCREEN_BUTTONS[screenId] ?? DEFAULT_BUTTONS;

  const giversOf = (button: string) =>
    (selected?.givers ?? []).filter((g) => canPress(g.level, button)).map((g) => roleName(g.roleId));

  return (
    <PageLayout
      title="역할 관리 — 시안 D 그 사람 눈으로 보기"
      breadcrumb="역할 관리 시안 > D. 그 사람 눈으로 보기"
      screenId="ROLE-DRAFT-D"
      buttons={[
        {
          id: "resetSim",
          label: "실제 역할로 되돌리기",
          action: "cancel",
          disabled: !simulated,
          onClick: () =>
            setOverrides((p) => {
              const c = { ...p };
              delete c[userId];
              return c;
            }),
        },
      ]}
    >
      <ContentBody root resizable storageKey="design-dummy.roleDraft.viewAs">
        <ContentPanel width={240} scrollY>
          <div className="role-viewas-people">
            <Input value={keyword} onChange={(v: string) => setKeyword(v)} placeholder="이름·부서로 찾기" />
            {people.map((u) => (
              <button
                type="button"
                key={u.userId}
                className={["role-person", u.userId === userId ? "role-person--on" : ""].join(" ")}
                onClick={() => setUserId(u.userId)}
              >
                <span className="role-person__name">{u.name}</span>
                <span className="role-person__dept">
                  {u.dept} · 역할 {rolesOfUser(u.userId).length}개{overrides[u.userId] ? " · 미리 보기 중" : ""}
                </span>
              </button>
            ))}
          </div>
        </ContentPanel>

        <ContentPanel width={330} scrollY>
          <div className="role-viewas-roles">
            <h3 className="role-section-title">
              {user.name}의 역할 <MutedText>{user.dept}</MutedText>
            </h3>
            <p className="role-muted">켜고 끄면 오른쪽 화면이 바로 바뀝니다. 미리 보기만 하고 저장하지 않습니다.</p>
            {ROLES.filter((r) => actualRoles.includes(r.roleId)).map((r) => {
              const on = activeRoles.includes(r.roleId);
              return (
                <div key={r.roleId} className={["role-toggle", on ? "" : "role-toggle--off"].join(" ")}>
                  <Checkbox checked={on} onChange={(v) => toggleRole(r.roleId, v)} label={r.name} />
                  <MutedText>
                    {viaGroups(r.roleId).map((n) => `「${n}」`).join(", ")}에서 받음{r.useYn === "N" ? " · 사용 안 함이라 효과 없음" : ""}
                  </MutedText>
                </div>
              );
            })}
            <h4 className="role-section-title">다른 역할을 더해 보기</h4>
            {ROLES.filter((r) => !actualRoles.includes(r.roleId)).map((r) => (
              <div key={r.roleId} className={["role-toggle", activeRoles.includes(r.roleId) ? "role-toggle--added" : "role-toggle--off"].join(" ")}>
                <Checkbox checked={activeRoles.includes(r.roleId)} onChange={(v) => toggleRole(r.roleId, v)} label={r.name} />
                <MutedText>{r.description}</MutedText>
              </div>
            ))}
            <div className="role-viewas-diff">
              {simulated ? (
                <>
                  <strong>실제와 다른 점</strong>
                  <span>
                    화면 {added}개가 새로 보이고, {removed}개가 사라지고, {changedLevel}개는 권한이 바뀝니다.
                  </span>
                </>
              ) : (
                <span>
                  지금은 실제 역할 그대로입니다. 메뉴 {actual.length}개를 씁니다.
                </span>
              )}
            </div>
          </div>
        </ContentPanel>

        <ContentPanel scrollY>
          <div className="role-viewas-preview">
            <div className="role-preview-bar">
              <span>
                <strong>{user.name}</strong>님이 로그인하면 이렇게 보입니다
              </span>
              <Checkbox checked={showHidden} onChange={setShowHidden} label="안 보이는 메뉴도 흐리게 보기" />
            </div>
            <div className="role-preview">
              <nav className="role-preview__menu" aria-label="미리 보기 메뉴">
                {MENU_GROUPS.map((m) => {
                  const items = SCREENS.filter((s) => s.group === m.id).filter(
                    (s) => showHidden || previewMap.has(s.id) || actualMap.has(s.id),
                  );
                  if (!items.length) return null;
                  return (
                    <div key={m.id} className="role-preview__group">
                      <div className="role-preview__group-title">{m.label}</div>
                      {items.map((s) => {
                        const now = previewMap.get(s.id);
                        const was = actualMap.get(s.id);
                        const state = now && !was ? "new" : !now && was ? "gone" : !now ? "hidden" : "";
                        return (
                          <button
                            type="button"
                            key={s.id}
                            className={[
                              "role-preview__item",
                              state ? `role-preview__item--${state}` : "",
                              s.id === screenId ? "role-preview__item--on" : "",
                            ].join(" ")}
                            onClick={() => setScreenId(s.id)}
                          >
                            <span>{s.name}</span>
                            {state === "new" ? <Badge label="새로 보임" tone="success" /> : null}
                            {state === "gone" ? <Badge label="사라짐" tone="danger" /> : null}
                            {state === "hidden" ? <IconLock size={12} aria-label="안 보임" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </nav>

              <section className="role-preview__screen">
                <div className="role-preview__screen-head">
                  <strong>{selectedScreen?.name}</strong>
                  {selected ? <LevelChip level={selected.level} compact /> : <Badge label="이 사람은 열 수 없음" tone="danger" />}
                  {actualMap.get(screenId) && selected && actualMap.get(screenId)!.level !== selected.level ? (
                    <MutedText>실제: {LEVEL_LABELS[actualMap.get(screenId)!.level]}</MutedText>
                  ) : null}
                </div>
                <div className="role-preview__buttons">
                  {buttons.map((b) => {
                    const ok = selected ? canPress(selected.level, b) : false;
                    const givers = giversOf(b);
                    return (
                      <span
                        key={b}
                        className={["role-fake-btn", ok ? "" : "role-fake-btn--locked"].join(" ")}
                        title={ok ? `「${givers.join(", ")}」 역할이 이 버튼을 줍니다.` : "이 사람의 역할로는 누를 수 없습니다."}
                      >
                        {ok ? null : <IconLock size={12} aria-hidden />}
                        {b}
                      </span>
                    );
                  })}
                </div>
                <div className="role-preview__body" aria-hidden>
                  <span className="role-skeleton role-skeleton--wide" />
                  <span className="role-skeleton" />
                  <span className="role-skeleton role-skeleton--mid" />
                  <span className="role-skeleton" />
                  <span className="role-skeleton role-skeleton--wide" />
                </div>
                <div className="role-preview__why">
                  {selected ? (
                    <>
                      <strong>왜 이렇게 보이나</strong>
                      {selected.givers.map((g) => (
                        <span key={g.roleId}>
                          「{roleName(g.roleId)}」 역할이 {LEVEL_LABELS[g.level]} 권한을 줍니다
                          {g.level === selected.level && selected.givers.length > 1 ? "(가장 센 권한이라 이것을 씀)" : ""}.
                        </span>
                      ))}
                    </>
                  ) : (
                    <>
                      <strong>왜 안 보이나</strong>
                      <span>
                        이 화면을 주는 역할({ROLES.filter((r) => levelOf(INITIAL_GRANTS, r.roleId, screenId) !== NONE).map((r) => r.name).join(", ") || "없음"}
                        ) 중 어느 것도 이 사람에게 없습니다.
                      </span>
                    </>
                  )}
                </div>
              </section>
            </div>
          </div>
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
