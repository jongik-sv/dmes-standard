"use client";

/**
 * 오른쪽 「퍼미션 한 건」 패널 — 시안 v16 lgPermNext 의 one.
 *
 * 값 입력은 shared TokenChipInput(입력 중 글자는 부품 안에만 있다 — R12, 허용 밖 코드는 부품이 거절하고 알린다).
 * 칩·「모두」·「조회만」 은 shared ToggleChipGroup(PermChips 감싸개).
 * 루트에서 받는 것은 보기 줄(row)·searchPermOne 결과(one)·고정 동작 묶음(actions)뿐이다.
 */
import { memo, useMemo } from "react";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Button } from "@dk-oasis/shared/form";
import type { ToggleChipPreset } from "@dk-oasis/shared/toggle-chip-group";
import { TokenChipInput } from "@dk-oasis/shared/token-chip-input";
import { PermChips } from "./PermChips";
import { effective, permKey, presetMatch, shortSummary, type PermKind, type PermViewRow } from "./perm-chips";
import type { PermOtherRow, PermRoleGroupRow } from "./types";

/** 화면 루트가 한 번 만들어 넘기는 동작 묶음(참조가 바뀌지 않는다). */
export interface PermActions {
  select: (key: string) => void;
  /** 켜진 허용 값 목록으로 바꾼다(칩·「모두」·「조회만」·값 입력 모두 이 길). */
  set: (key: string, kind: PermKind, next: string[]) => void;
  make: (key: string, level: "read" | "all") => void;
  remove: (key: string) => void;
  undo: (key: string) => void;
}

export interface PermOneInfo {
  key: string;
  others: PermOtherRow[];
  groups: PermRoleGroupRow[];
  USER_CNT: number;
}

interface PermOnePaneProps {
  row: PermViewRow | null;
  /** searchPermOne 결과. 고른 줄과 key 가 다르면 읽는 중이다. */
  one: PermOneInfo | null;
  /** 지금 목록에 있는 줄 키(같은 화면 다른 퍼미션을 눌러 고를 수 있는지). */
  loadedKeys: ReadonlySet<string>;
  actions: PermActions;
  busy: boolean;
}

const TOKEN_MESSAGES = {
  outside: "오브젝트 값에 없어 뺐습니다",
  duplicate: "이미 있는 값입니다",
  pattern: "코드는 영문으로 시작하는 영문 · 숫자 · _ 입니다",
};

export const PermOnePane = memo(function PermOnePane({ row, one, loadedKeys, actions, busy }: PermOnePaneProps) {
  const allowedBtn = row?.__allowed.btn;
  const readBtn = row?.__allowed.read;
  const presets = useMemo<ToggleChipPreset[]>(() => {
    const list: ToggleChipPreset[] = [{ id: "all", label: "모두", pick: () => [...(allowedBtn ?? [])], title: "오브젝트 버튼 값 모두" }];
    if (readBtn && readBtn.length > 0) {
      list.push({ id: "read", label: "조회만", pick: () => [...readBtn], title: `조회 값: ${readBtn.join(",")}` });
    }
    return list;
  }, [allowedBtn, readBtn]);

  if (!row) {
    return <div className="cpm-empty">왼쪽 목록에서 퍼미션을 고르세요.</div>;
  }

  const key = row.__key;

  const has = row.__cur.has;
  const a = row.__allowed;
  const preset = presetMatch(row.__cur.btn, a);
  const btnVals = effective(row.__cur.btn, a.btn);
  const popVals = effective(row.__cur.pop, a.pop);
  const ready = one?.key === key;
  const others = ready ? one.others : [];
  const groups = ready ? one.groups : [];
  const dirty = row.__state !== "" && row.__state !== "empty";
  const onBtn = busy ? undefined : (next: string[]) => actions.set(key, "btn", next);
  const onPop = busy ? undefined : (next: string[]) => actions.set(key, "pop", next);

  return (
    <table style={DETAIL_TABLE_STYLE} data-testid="perm-one">
      <tbody>
        <tr>
          <th style={DETAIL_LABEL_CELL}>퍼미션</th>
          <td style={DETAIL_VALUE_CELL}>
            <span className="cpm-inline">
              <b>{row.ROLE_NM ?? row.ROLE_ID}</b>
              <span className="cpm-sub cpm-mono">{row.ROLE_ID}</span>
              <span className="cpm-sub">×</span>
              <b>{row.OBJECT_NM ?? row.OBJECT_ID}</b>
              <span className="cpm-sub cpm-mono">{row.OBJECT_ID}</span>
            </span>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>메뉴</th>
          <td style={DETAIL_VALUE_CELL}>
            {[row.MENU_PATH, row.MENU_NM].filter(Boolean).join(" › ") || "-"}
          </td>
        </tr>
        {!has && (
          <tr>
            <th style={DETAIL_LABEL_CELL}>만들기</th>
            <td style={DETAIL_VALUE_CELL}>
              <div className="cpm-stack">
                <span className="cpm-hint">아직 퍼미션이 없습니다. 만들면 이 역할이 이 화면을 메뉴에서 봅니다.</span>
                <span className="cpm-inline">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy || a.read.length === 0}
                    title={a.read.length === 0 ? "이 오브젝트에는 조회 값이 없습니다" : undefined}
                    onClick={() => actions.make(key, "read")}
                  >
                    조회만으로 만들기
                  </Button>
                  <Button size="sm" disabled={busy || a.btn.length === 0} onClick={() => actions.make(key, "all")}>
                    오브젝트 값 모두로 만들기
                  </Button>
                  {row.__state === "gone" && (
                    <Button size="sm" disabled={busy} onClick={() => actions.undo(key)}>
                      되돌리기
                    </Button>
                  )}
                </span>
              </div>
            </td>
          </tr>
        )}
        <tr>
          <th style={DETAIL_LABEL_CELL}>버튼 권한</th>
          <td style={DETAIL_VALUE_CELL}>
            <div className="cpm-stack">
              <PermChips
                chips={row.__btnChips}
                onChange={onBtn}
                presets={has ? presets : undefined}
                ariaLabel="퍼미션 버튼 권한"
                emptyText="오브젝트에 버튼 권한이 없습니다"
              />
              {has && (preset.all || preset.read) && (
                <span className="cpm-hint">지금 값 = {preset.all ? "모두" : "조회만"}</span>
              )}
              {row.__btnOut && <span className="cpm-warn">{row.__btnOut}</span>}
              {has && (
                <TokenChipInput
                  key={`${key}|btn`}
                  value={btnVals}
                  onChange={(next) => onBtn?.(next)}
                  allowed={a.btn}
                  disabled={busy}
                  placeholder="예: find,send"
                  aria-label="퍼미션 버튼 권한 값"
                  messages={TOKEN_MESSAGES}
                  testId="perm-one-btn-input"
                />
              )}
            </div>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>팝업 권한</th>
          <td style={DETAIL_VALUE_CELL}>
            <div className="cpm-stack">
              <PermChips
                chips={row.__popChips}
                onChange={onPop}
                ariaLabel="퍼미션 팝업 권한"
                emptyText="오브젝트에 팝업 권한이 없습니다"
              />
              {row.__popOut && <span className="cpm-warn">{row.__popOut}</span>}
              {has && a.pop.length > 0 && (
                <TokenChipInput
                  key={`${key}|pop`}
                  value={popVals}
                  onChange={(next) => onPop?.(next)}
                  allowed={a.pop}
                  disabled={busy}
                  placeholder="예: orderPop"
                  aria-label="퍼미션 팝업 권한 값"
                  messages={TOKEN_MESSAGES}
                  testId="perm-one-pop-input"
                />
              )}
            </div>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>데이터 권한</th>
          <td style={DETAIL_VALUE_CELL}>
            {/* D21 — 조회·저장 통과만, 이 화면에서 고치지 않는다. */}
            <span className="cpm-mono">{row.DATA_PERM || "-"}</span>
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>받는 사람</th>
          <td style={DETAIL_VALUE_CELL}>
            {ready ? (
              <span className="cpm-inline">
                <b>{one.USER_CNT.toLocaleString()}명</b>
                <span className="cpm-sub">
                  ({groups.map((g) => g.ROLE_GROUP_NM ?? g.ROLE_GROUP_ID).join(", ") || "그룹 없음"})
                </span>
              </span>
            ) : (
              <span className="cpm-sub">읽는 중…</span>
            )}
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>같은 화면 다른 퍼미션</th>
          <td style={DETAIL_VALUE_CELL}>
            {ready && others.length > 0 ? (
              <span className="cpm-inline">
                {others.map((o) => {
                  const k = permKey(o.ROLE_ID, row.OBJECT_ID);
                  const loaded = loadedKeys.has(k);
                  return (
                    <Button
                      key={o.ROLE_ID}
                      size="mini"
                      disabled={!loaded}
                      title={loaded ? o.ROLE_ID : `${o.ROLE_ID} — 지금 목록에 없는 줄입니다`}
                      onClick={() => actions.select(k)}
                    >
                      {`${o.ROLE_NM ?? o.ROLE_ID} · ${shortSummary(o.BTN_PERM, a)}`}
                    </Button>
                  );
                })}
              </span>
            ) : (
              <span className="cpm-sub">{ready ? "없음" : "읽는 중…"}</span>
            )}
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>작업</th>
          <td style={DETAIL_VALUE_CELL}>
            <div className="cpm-stack">
              <span className="cpm-inline">
                {has && (
                  <Button size="sm" disabled={busy} onClick={() => actions.remove(key)}>
                    이 퍼미션 빼기
                  </Button>
                )}
                {has && dirty && (
                  <Button size="sm" disabled={busy} onClick={() => actions.undo(key)}>
                    되돌리기
                  </Button>
                )}
                {/* TODO(f7): 권한 작업대(commPermBench)를 이 역할·오브젝트로 연다. 진입 규칙은 f7 이 정한다. */}
                <Button size="sm" disabled title="권한 작업대 연결은 다음 작업에서 합니다" data-hook="open-perm-bench">
                  권한 작업대에서 보기
                </Button>
              </span>
              <span className="cpm-hint">
                고를 수 있는 값은 오브젝트의 버튼 권한 · 팝업 권한에 적은 코드뿐입니다. 일부만 줘도 됩니다. 줄 그은 칩은
                오브젝트에서 빠진 값이라 계산에서 빠지고, 이 퍼미션을 바꿔 저장하면 함께 빠집니다. 버튼을 모두 끄면
                퍼미션이 빠집니다.
              </span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
});
