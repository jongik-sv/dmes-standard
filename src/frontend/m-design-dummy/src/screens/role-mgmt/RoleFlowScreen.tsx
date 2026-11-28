/**
 * 역할 관리 — 시안 B 「권한 흐름도」(창의형, 표본 데이터만 사용).
 *
 * 생각: 권한은 「사람 → 역할 그룹 → 역할 → 화면」 으로 흘러간다. 표 다섯 개로 나누어 보이지 않고 한 장의 흐름으로 그린다.
 *   - 무엇이든 누르면 그와 이어진 길만 밝아지고 나머지는 흐려진다.
 *     사람을 누르면 → 그 사람이 거치는 그룹·역할·쓸 수 있는 화면, 화면을 누르면 → 그 화면을 여는 역할·그룹·사람.
 *   - 역할 → 화면 선의 굵기·색이 권한 수준이다(셀수록 짙고 굵다).
 *   - 오른쪽 설명판이 지금 고른 것을 문장으로 풀어 준다. 역할을 고르면 설명판에서 화면 칩을 눌러 수준을 바로 바꾼다.
 *   - 마우스를 올리면 미리 보고(흐림), 누르면 고정한다. 빈 곳을 누르면 풀린다.
 */
import { useMemo, useState } from "react";
import { ContentBody, ContentPanel, PageLayout } from "@dk-oasis/shared/layout";
import { Badge } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import {
  MENU_GROUPS,
  NONE,
  PERM_LEVELS,
  PERM_LEVEL_BY_ID,
  ROLE_GROUPS,
  ROLES,
  SCREENS,
  SCREEN_BY_ID,
  USERS,
} from "../../data/role-mgmt-mock";
import { LevelChip, LevelLegend } from "./LevelChip";
import {
  LEVEL_LABELS,
  changeKind,
  effectiveGrants,
  groupsOfRole,
  levelOf,
  nextLevel,
  roleName,
  rolesOfUser,
  useGrantDraft,
  usersOfRole,
} from "./role-model";

type Col = "u" | "g" | "r" | "s";

interface FlowNode {
  id: string;
  col: Col;
  label: string;
  sub?: string;
  x: number;
  y: number;
  dim?: boolean;
}

interface FlowEdge {
  from: string;
  to: string;
  level?: string;
}

const COL_X: Record<Col, number> = { u: 0, g: 250, r: 500, s: 750 };
const NODE_W = 170;
const NODE_H = 30;
const GAP = 8;
const HEADER_H = 22;
const TOP = 8;

const COL_TITLE: Record<Col, string> = { u: "사람", g: "역할 그룹", r: "역할", s: "화면" };

const STROKE: Record<number, number> = { 1: 1.5, 2: 2.5, 3: 3.5, 4: 4.5 };

/** 열마다 노드를 위에서부터 쌓는다. 그룹·사람은 이어지는 역할 순서로 줄을 세워 선이 덜 엇갈리게 한다. */
function buildLayout() {
  const nodes: FlowNode[] = [];
  const place = (col: Col, items: { id: string; label: string; sub?: string; dim?: boolean }[], gaps?: Set<number>) => {
    let y = TOP;
    items.forEach((it, i) => {
      if (gaps?.has(i)) y += HEADER_H;
      nodes.push({ ...it, col, x: COL_X[col], y });
      y += NODE_H + GAP;
    });
    return y;
  };
  const roleOrder = ROLES.map((r) => r.roleId);
  const groupOrder = [...ROLE_GROUPS].sort(
    (a, b) => roleOrder.indexOf(a.roleIds[0]) - roleOrder.indexOf(b.roleIds[0]),
  );
  const userOrder = [...USERS].sort(
    (a, b) => groupOrder.findIndex((g) => a.groupIds.includes(g.id)) - groupOrder.findIndex((g) => b.groupIds.includes(g.id)),
  );
  const hU = place("u", userOrder.map((u) => ({ id: `u:${u.userId}`, label: u.name, sub: u.dept })));
  const hG = place("g", groupOrder.map((g) => ({ id: `g:${g.id}`, label: g.name })));
  const hR = place(
    "r",
    ROLES.map((r) => ({ id: `r:${r.roleId}`, label: r.name, sub: r.useYn === "N" ? "사용 안 함" : undefined, dim: r.useYn === "N" })),
  );
  // 화면: 메뉴 머리말을 사이에 끼운다.
  const screens = SCREENS;
  const gaps = new Set<number>();
  const heads: { label: string; y: number }[] = [];
  let prev = "";
  screens.forEach((s, i) => {
    if (s.group !== prev) {
      gaps.add(i);
      prev = s.group;
    }
  });
  const hS = place("s", screens.map((s) => ({ id: `s:${s.id}`, label: s.name })), gaps);
  // 메뉴 머리말은 그 메뉴 첫 화면 바로 위에 둔다.
  for (const g of MENU_GROUPS) {
    const first = nodes.find((n) => n.id === `s:${screens.filter((s) => s.group === g.id)[0]?.id}`);
    if (first) heads.push({ label: g.label, y: first.y - HEADER_H + 4 });
  }
  return { nodes, heads, height: Math.max(hU, hG, hR, hS) + TOP };
}

export function RoleFlowScreen() {
  const { showMessage } = useMessage();
  const { grants, setLevel, changes, commit, reset, saved } = useGrantDraft();
  const [pinned, setPinned] = useState<string | null>("u:u3001");
  const [hover, setHover] = useState<string | null>(null);
  const focus = hover ?? pinned;

  const layout = useMemo(() => buildLayout(), []);
  const nodeById = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);

  const edges = useMemo(() => {
    const out: FlowEdge[] = [];
    for (const u of USERS) for (const gid of u.groupIds) out.push({ from: `u:${u.userId}`, to: `g:${gid}` });
    for (const g of ROLE_GROUPS) for (const rid of g.roleIds) out.push({ from: `g:${g.id}`, to: `r:${rid}` });
    for (const r of ROLES)
      for (const s of SCREENS) {
        const level = levelOf(grants, r.roleId, s.id);
        if (level !== NONE) out.push({ from: `r:${r.roleId}`, to: `s:${s.id}`, level });
      }
    return out;
  }, [grants]);

  /** 고른 것과 이어진 노드(앞으로·뒤로 따라감). 시스템 관리자처럼 모든 화면을 주는 선은 사람을 고를 때만 펼친다. */
  const active = useMemo(() => {
    if (!focus) return null;
    const set = new Set<string>([focus]);
    const walk = (start: string, dir: "down" | "up") => {
      const stack = [start];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const e of edges) {
          const [a, b] = dir === "down" ? [e.from, e.to] : [e.to, e.from];
          if (a === cur && !set.has(b)) {
            set.add(b);
            stack.push(b);
          }
        }
      }
    };
    walk(focus, "down");
    walk(focus, "up");
    return set;
  }, [focus, edges]);

  const edgeActive = (e: FlowEdge) => {
    if (!active || !focus) return false;
    if (!active.has(e.from) || !active.has(e.to)) return false;
    // 화면을 고르면 그 화면으로 가는 선만, 역할을 고르면 그 역할에서 나가는 선만 화면 열에 그린다.
    if (focus.startsWith("s:") && e.from.startsWith("r:")) return e.to === focus;
    if (focus.startsWith("r:") && e.from.startsWith("r:")) return e.from === focus;
    return true;
  };

  // ── 설명판 ──
  const panel = (() => {
    if (!pinned) {
      return (
        <div className="role-flow-explain">
          <p>사람·역할 그룹·역할·화면 중 하나를 누르면 이어진 길만 밝아지고, 여기에 쉬운 말로 풀어 줍니다.</p>
          <p className="role-muted">마우스를 올리면 미리 보기, 누르면 고정, 빈 곳을 누르면 풀림.</p>
        </div>
      );
    }
    const [kind, id] = pinned.split(":") as [Col, string];
    if (kind === "u") {
      const user = USERS.find((u) => u.userId === id)!;
      const groups = ROLE_GROUPS.filter((g) => user.groupIds.includes(g.id));
      const roleIds = rolesOfUser(id);
      const eff = effectiveGrants(grants, roleIds);
      return (
        <div className="role-flow-explain">
          <h3>
            {user.name} <span className="role-muted">{user.dept}</span>
          </h3>
          <p>
            역할 그룹 <strong>{groups.map((g) => g.name).join(", ")}</strong>에 들어 있어 역할 <strong>{roleIds.length}개</strong>를
            받습니다. 그래서 화면 <strong>{eff.length}개</strong>를 쓸 수 있습니다.
          </p>
          <div className="role-chip-wrap">
            {eff.map((g) => (
              <LevelChip key={g.screenId} label={SCREEN_BY_ID.get(g.screenId)?.name} level={g.level} />
            ))}
          </div>
          <p className="role-muted">한 화면을 여러 역할이 주면 가장 센 수준을 씁니다.</p>
        </div>
      );
    }
    if (kind === "g") {
      const g = ROLE_GROUPS.find((x) => x.id === id)!;
      const people = USERS.filter((u) => u.groupIds.includes(id));
      return (
        <div className="role-flow-explain">
          <h3>{g.name}</h3>
          <p>
            이 그룹에 든 <strong>{people.length}명</strong>은 역할 <strong>{g.roleIds.map(roleName).join(", ")}</strong>을(를) 함께
            받습니다.
          </p>
          <div className="role-chip-wrap">
            {people.map((p) => (
              <Badge key={p.userId} label={`${p.name} · ${p.dept}`} />
            ))}
          </div>
        </div>
      );
    }
    if (kind === "r") {
      const role = ROLES.find((r) => r.roleId === id)!;
      const people = usersOfRole(id);
      const locked = id === "SYSADMIN";
      return (
        <div className="role-flow-explain">
          <h3>
            {role.name} {role.useYn === "N" ? <Badge label="사용 안 함" /> : null}
          </h3>
          <p>{role.description}</p>
          <p>
            역할 그룹 <strong>{groupsOfRole(id).length}개</strong>를 거쳐 <strong>{people.length}명</strong>이 받습니다.
          </p>
          {locked ? (
            <p className="role-muted">시스템 관리자는 모든 화면을 자동으로 받아 바꿀 수 없습니다.</p>
          ) : (
            <p className="role-muted">아래 칩을 누르면 권한 수준이 바뀌고 흐름도 선도 바로 바뀝니다.</p>
          )}
          {MENU_GROUPS.map((m) => (
            <div key={m.id} className="role-flow-menu">
              <div className="role-flow-menu__title">{m.label}</div>
              <div className="role-chip-wrap">
                {SCREENS.filter((s) => s.group === m.id).map((s) => {
                  const level = levelOf(grants, id, s.id);
                  const before = levelOf(saved, id, s.id);
                  return (
                    <LevelChip
                      key={s.id}
                      label={s.name}
                      level={level}
                      before={before}
                      kind={changeKind(before, level)}
                      onClick={locked ? undefined : () => setLevel(id, s.id, nextLevel(s.id, level))}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
    }
    const screen = SCREEN_BY_ID.get(id)!;
    const givers = ROLES.filter((r) => levelOf(grants, r.roleId, id) !== NONE);
    const people = new Set(givers.filter((r) => r.useYn === "Y").flatMap((r) => usersOfRole(r.roleId).map((u) => u.userId)));
    return (
      <div className="role-flow-explain">
        <h3>{screen.name}</h3>
        <p>
          역할 <strong>{givers.length}개</strong>가 이 화면을 줍니다. 그래서 <strong>{people.size}명</strong>이 이 화면을 열 수 있습니다.
        </p>
        <div className="role-flow-menu">
          {givers.map((r) => (
            <div key={r.roleId} className="role-flow-giver">
              <span>{r.name}</span>
              <LevelChip level={levelOf(grants, r.roleId, id)} compact />
            </div>
          ))}
        </div>
        <div className="role-chip-wrap">
          {USERS.filter((u) => people.has(u.userId)).map((u) => (
            <Badge key={u.userId} label={u.name} />
          ))}
        </div>
      </div>
    );
  })();

  const width = COL_X.s + NODE_W + 8;

  return (
    <PageLayout
      title="역할 관리 — 시안 B 권한 흐름도"
      breadcrumb="역할 관리 시안 > B. 권한 흐름도"
      screenId="ROLE-DRAFT-B"
      buttons={[
        {
          id: "undo",
          label: "변경 되돌리기",
          action: "cancel",
          disabled: changes.length === 0,
          onClick: reset,
        },
        {
          id: "save",
          label: changes.length ? `저장 (${changes.length}건)` : "저장",
          type: "save",
          action: "save",
          onClick: () => {
            if (!changes.length) {
              showMessage({ message: "바꾼 내용이 없습니다.", alertType: "warning" });
              return;
            }
            commit();
            showMessage({ message: `${changes.length}건을 저장했습니다.`, alertType: "success", toast: true });
          },
        },
      ]}
    >
      <div className="role-toolbar">
        <span className="role-muted">선 굵기·색 = 권한 수준</span>
        <LevelLegend levels={PERM_LEVELS.filter((l) => l.id !== NONE).map((l) => l.id)} />
      </div>
      <ContentBody root resizable storageKey="design-dummy.roleDraft.flow">
        <ContentPanel scrollY>
          <div className="role-flow" style={{ width, height: layout.height + 28 }} onClick={() => setPinned(null)}>
            <div className="role-flow__cols">
              {(Object.keys(COL_X) as Col[]).map((c) => (
                <div key={c} className="role-flow__col-title" style={{ left: COL_X[c], width: NODE_W }}>
                  {COL_TITLE[c]}
                </div>
              ))}
            </div>
            <div className="role-flow__canvas" style={{ height: layout.height }}>
              <svg className="role-flow__svg" width={width} height={layout.height} aria-hidden>
                {edges.map((e) => {
                  const a = nodeById.get(e.from);
                  const b = nodeById.get(e.to);
                  if (!a || !b) return null;
                  const x1 = a.x + NODE_W;
                  const y1 = a.y + NODE_H / 2;
                  const x2 = b.x;
                  const y2 = b.y + NODE_H / 2;
                  const on = edgeActive(e);
                  const rank = e.level ? (PERM_LEVEL_BY_ID.get(e.level)?.rank ?? 1) : 0;
                  const cls = [
                    "role-flow__edge",
                    e.level ? `role-flow__edge--lv${rank >= 99 ? "x" : rank}` : "",
                    active ? (on ? "role-flow__edge--on" : "role-flow__edge--off") : "",
                  ].join(" ");
                  return (
                    <path
                      key={`${e.from}>${e.to}`}
                      className={cls}
                      strokeWidth={e.level ? (STROKE[rank] ?? 2) : 1.5}
                      d={`M${x1},${y1} C${x1 + 40},${y1} ${x2 - 40},${y2} ${x2},${y2}`}
                    />
                  );
                })}
              </svg>
              {layout.heads.map((h) => (
                <div key={h.label} className="role-flow__head" style={{ left: COL_X.s, top: h.y, width: NODE_W }}>
                  {h.label}
                </div>
              ))}
              {layout.nodes.map((n) => {
                const on = !active || active.has(n.id);
                const isFocus = focus === n.id;
                const sid = n.id.slice(2);
                const changed = n.col === "s" && changes.some((c) => c.screenId === sid && (!pinned || pinned === `r:${c.roleId}`));
                return (
                  <button
                    type="button"
                    key={n.id}
                    className={[
                      "role-flow__node",
                      `role-flow__node--${n.col}`,
                      on ? "" : "role-flow__node--off",
                      isFocus ? "role-flow__node--focus" : "",
                      n.dim ? "role-flow__node--dim" : "",
                      changed ? "role-flow__node--changed" : "",
                    ].join(" ")}
                    style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
                    onMouseEnter={() => setHover(n.id)}
                    onMouseLeave={() => setHover(null)}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setPinned((p) => (p === n.id ? null : n.id));
                    }}
                    title={n.sub ? `${n.label} · ${n.sub}` : n.label}
                  >
                    <span className="role-flow__label">{n.label}</span>
                    {n.sub ? <span className="role-flow__sub">{n.sub}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </ContentPanel>
        <ContentPanel width={380} scrollY>
          {panel}
          {changes.length ? (
            <div className="role-flow-explain role-flow-changes">
              <h4>저장하면 이렇게 바뀝니다</h4>
              {changes.map((c) => (
                <div key={`${c.roleId}:${c.screenId}`} className="role-flow-change">
                  <Badge
                    label={c.kind === "추가" ? "새로 줌" : c.kind === "회수" ? "빼앗음" : "바꿈"}
                    tone={c.kind === "추가" ? "success" : c.kind === "회수" ? "danger" : "warning"}
                  />
                  <span>
                    {roleName(c.roleId)} · {SCREEN_BY_ID.get(c.screenId)?.name}: {LEVEL_LABELS[c.before]} → {LEVEL_LABELS[c.after]}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
