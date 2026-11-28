"use client";

/**
 * commObjMng 상세 폼 — 선택한 OBJECT 의 전체 칸(옛 15칸) + 새 허용 값 3칸(BTN_PERM·POPUP_PERM·DATA_PERM).
 *
 * 성능(화면 성능 가이드 R12): 입력 초안은 이 컴포넌트 안(useDetailDraft)에만 있고, 화면 루트에는 blur·저장·행 전환
 * 때만 `onCommit` 으로 알린다. 루트는 ref 핸들(`getDraft`·`isDirty`·`commit`)로 대화한다.
 *
 * 허용 값 편집기 = shared TokenChipInput(칩 안에 숫자를 넣는 칸이 없어 값별 퍼미션 수는 칩 아래 요약 줄로 보인다).
 * 값을 빼면 그 값을 켠 퍼미션 수·사람 수를 저장 전에 바로 안내한다(searchObjPerm 행으로 계산, 사람 수는 최대치).
 */
import { memo, useCallback, useImperativeHandle, type Ref } from "react";
import { DETAIL_TABLE_STYLE, DETAIL_LABEL_CELL, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Input, Select, Radio, DatePicker, ComboBox, useDetailDraft, type DetailDraftHandle } from "@dk-oasis/shared/form";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { TokenChipInput, joinTokens, parseTokens } from "@dk-oasis/shared/token-chip-input";
import { countByToken, removalImpacts, removalMessage, type PermKind } from "./perm-impact";
import { PAGE_REGISTRY_KEYS, resolveRegistryPath } from "@/lib/generated/page-registry";
import { getRowKey, toCount, withField, type ObjRow } from "./row-model";
import type { ObjPermRow } from "./types";

/**
 * FORM URL 고르기 목록 (2026-11-26) — 포털이 열 수 있는 화면 코드 경로(page-components 등의 page.tsx, 빌드 때 생성).
 * FORM URL 은 오브젝트의 값이다. 메뉴 폴더로 계산하지 않는다 — 메뉴는 오브젝트를 가리킬 뿐이고, 한 오브젝트가 여러 메뉴 셋·폴더에 들어간다.
 */
const FORM_URL_OPTIONS = [...PAGE_REGISTRY_KEYS].sort().map((k) => ({ value: k, label: k }));

/** S-003 / D-013 / G-009 — Y/N (LV-002 정적 — 분석 §3.8 DS-005). */
const USE_TP_OPTIONS: { value: string; label: string }[] = [
  { value: "Y", label: "Yes" },
  { value: "N", label: "No" },
];

/**
 * D-010 / G-015 — 접속 경로. 2026-06-03 사용자 명시 변경 — As-Is 3 enum → To-Be 2 enum ("내부" / "외부").
 * value = label 동일.
 */
const ACCESS_TP_OPTIONS: { value: string; label: string }[] = [
  { value: "내부", label: "내부" },
  { value: "외부", label: "외부" },
];

/** 허용 값 칸 정의 — 최대 글자 수는 BE(PERM_TOO_LONG)와 같다. */
const PERM_FIELDS: {
  field: "BTN_PERM" | "POPUP_PERM" | "DATA_PERM";
  kind: PermKind | null;
  label: string;
  hint: string;
  max: number;
}[] = [
  { field: "BTN_PERM", kind: "BTN", label: "버튼 권한", hint: "오브젝트마다 직접 적는 코드", max: 500 },
  { field: "POPUP_PERM", kind: "POPUP", label: "팝업 권한", hint: "오브젝트마다 직접 적는 코드", max: 1000 },
  { field: "DATA_PERM", kind: null, label: "데이터 권한", hint: "지금은 칸만 둠 · 나중에 정함", max: 1000 },
];

/** 이 오브젝트의 퍼미션 조회 결과 — 값별 사용 수·USE_TP 확인·영향 안내의 근거. */
export interface ObjPermInfo {
  /** 이 결과가 어느 오브젝트 것인지(선택이 바뀐 직후 낡은 결과를 걸러 낸다). */
  objectId: string | null;
  rows: ObjPermRow[];
  /** 이 오브젝트를 쓰는 사람 수(역할 겹침을 뺀 distinct). */
  userCnt: number;
  /** 퍼미션 조회가 실패했다(rows 가 비어 있어도 「퍼미션 없음」이 아니다). */
  failed: boolean;
}

export interface ObjDetailFormProps {
  ref?: Ref<DetailDraftHandle<ObjRow>>;
  row: ObjRow | null;
  /** 초안을 목록 행에 반영 — 호출하는 쪽은 안정된 함수를 넘긴다. */
  onCommit: (draft: ObjRow) => void;
  systemOptions: { value: string; label: string }[];
  perm: ObjPermInfo;
  /** 저장 중 — 입력을 잠가 응답 뒤에 입력이 사라지지 않게 한다. */
  disabled?: boolean;
}

/**
 * 상세 정보 폼 — As-Is OBJECT 관리 스크린샷 정합 (2026-06-01 shared 컴포넌트 교체).
 *   - 2026-11-26: MENU ID(PARENT_MENU_ID) 칸을 뺐다 — 오브젝트는 메뉴 정보를 갖지 않는다.
 *     FORM URL 은 화면 코드 경로 ComboBox 로 고른다(메뉴 폴더로 계산하지 않는다). OBJECT ID 를 넣었는데 비어 있으면 같은 이름의 화면 코드 경로를 채운다.
 *   - 외부 접속 주소는 접속 경로가 "외부" 일 때만 활성.
 */
export const ObjDetailForm = memo(function ObjDetailForm({ ref, row, onCommit, systemOptions, perm, disabled = false }: ObjDetailFormProps) {
  const { showMessage } = useMessage();
  const { draft, setDraft, containerProps, handle } = useDetailDraft<ObjRow>(row, {
    onCommit: (d) => onCommit(d),
    rowKey: getRowKey,
  });
  useImperativeHandle(ref, () => handle, [handle]);

  /** 한 칸 바꾸기 — 항상 최신 초안 위에서 계산한다(연속 입력에도 낡은 값을 쓰지 않는다). */
  const update = useCallback(
    (field: string, value: unknown) => {
      const cur = handle.getDraft();
      if (cur) setDraft(withField(cur, field, value, resolveRegistryPath));
    },
    [handle, setDraft],
  );

  /** 사용 여부 Y→N — 이 오브젝트의 퍼미션이 있으면 영향(퍼미션 수·받은 사람 수)을 보이고 확인을 받는다. */
  const changeUseTp = useCallback(
    (v: string) => {
      const cur = handle.getDraft();
      if (!cur) return;
      // 서버는 조회 시점이 Y 인 행을 N 으로 바꿀 때만 영향을 센다 — 기준은 조회 시점 값(__orig)이다.
      if (v === "N" && cur.__orig?.USE_TP === "Y" && cur.nativeeditor_status !== "inserted") {
        // 퍼미션 조회가 아직 안 끝났거나 실패했으면 목록의 PERM_CNT 로 대신한다(사람 수는 모른다).
        const known = perm.objectId !== null && perm.objectId === cur.OBJECT_ID && !perm.failed;
        const permCnt = known ? perm.rows.length : toCount(cur.PERM_CNT);
        if (permCnt > 0) {
          showMessage({
            alertType: "confirm",
            title: "사용 안 함 확인",
            message: known
              ? `「${cur.OBJECT_ID}」을(를) 사용 안 함으로 바꾸면 퍼미션 ${permCnt}건이 멈추고 ` +
                `사람 ${perm.userCnt}명이 이 화면을 못 씁니다. 바꿀까요?`
              : `「${cur.OBJECT_ID}」을(를) 사용 안 함으로 바꾸면 퍼미션 ${permCnt}건이 멈추고 ` +
                "그 역할을 받은 사람이 이 화면을 못 씁니다. 바꿀까요?",
            onConfirm: () => update("USE_TP", "N"),
          });
          return;
        }
      }
      update("USE_TP", v);
    },
    [handle, perm, showMessage, update],
  );

  if (!draft) {
    return <div style={{ padding: "var(--spacing-md)", color: "var(--color-text-muted)" }}>행을 선택하거나 행을 추가하세요.</div>;
  }

  const outAccessIpDisabled = draft.ACCESS_TP !== "외부";
  // FORM URL 목록에 없는 옛 값(외부 URL 등)도 보이게 지금 값을 목록에 더한다.
  const formUrl = String(draft.FORM_URL ?? "");
  const formUrlOptions = formUrl && !FORM_URL_OPTIONS.some((o) => o.value === formUrl)
    ? [{ value: formUrl, label: `${formUrl} (화면 코드 없음)` }, ...FORM_URL_OPTIONS]
    : FORM_URL_OPTIONS;
  const isDeleted = draft.nativeeditor_status === "deleted";
  const permRows = perm.objectId && perm.objectId === draft.OBJECT_ID ? perm.rows : [];
  const orig = draft.__orig;
  const warnings: string[] = [];
  if (orig) {
    for (const k of ["BTN", "POPUP"] as const) {
      const f = k === "BTN" ? "BTN_PERM" : "POPUP_PERM";
      for (const i of removalImpacts(permRows, k, orig[f], parseTokens(String(draft[f] ?? "")))) warnings.push(removalMessage(i));
    }
  }

  return (
    <div {...containerProps}>
      {isDeleted && (
        <div role="status" style={WARN_STYLE}>
          삭제 표시된 행입니다. 고치려면 행취소로 되돌리세요.
        </div>
      )}
      {/* 저장 중·삭제 표시 행은 입력을 잠근다(응답 뒤 입력 유실·삭제 행 되살림 방지). */}
      <fieldset disabled={disabled || isDeleted} style={FIELDSET_STYLE}>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          {/* D-001 OBJECT ID — 신규 행 (inserted) 만 편집 가능 (PK). 기존 행 readOnly. */}
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="OBJECT_ID" label="OBJECT ID" required /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                aria-label="OBJECT ID"
                value={String(draft.OBJECT_ID ?? "")}
                maxLength={100}
                readOnly={draft.nativeeditor_status !== "inserted"}
                onChange={(v: string) => update("OBJECT_ID", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="SYSTEM_CODE" label="SYSTEM" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Select
                aria-label="SYSTEM"
                value={String(draft.SYSTEM_CODE ?? "")}
                options={systemOptions}
                placeholder="(선택)"
                onChange={(v: string) => update("SYSTEM_CODE", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="ID" meta={false} label="ID" required /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Input aria-label="ID" value={String(draft.ID ?? "")} maxLength={100} onChange={(v: string) => update("ID", v)} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="OBJECT_NM" label="OBJECT명" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Input aria-label="OBJECT명" value={String(draft.OBJECT_NM ?? "")} maxLength={100} onChange={(v: string) => update("OBJECT_NM", v)} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="PROGRAM_DESC" label="프로그램 설명" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Input aria-label="프로그램 설명" value={String(draft.PROGRAM_DESC ?? "")} maxLength={300} onChange={(v: string) => update("PROGRAM_DESC", v)} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="OBJECT_TYPE" label="OBJECT TYPE" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Input aria-label="OBJECT TYPE" value={String(draft.OBJECT_TYPE ?? "")} maxLength={90} onChange={(v: string) => update("OBJECT_TYPE", v)} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="SERVICE" meta={false} label="SERVICE" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Input aria-label="SERVICE" value={String(draft.SERVICE ?? "")} maxLength={100} onChange={(v: string) => update("SERVICE", v)} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="ACCESS_TP" label="접속 경로" required /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Select
                aria-label="접속 경로"
                value={String(draft.ACCESS_TP ?? "")}
                options={ACCESS_TP_OPTIONS}
                placeholder="(선택)"
                onChange={(v: string) => update("ACCESS_TP", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="FORM_URL" label="FORM URL" /></th>
            <td style={DETAIL_VALUE_CELL}>
              {/* 2026-11-26 — 화면 코드 경로 고르기. 포털은 메뉴가 가리키는 이 값으로 화면을 연다(메뉴 폴더와 상관없다). */}
              <ComboBox
                aria-label="FORM URL"
                data={formUrlOptions}
                valueField="value"
                labelField="label"
                value={formUrl}
                onChange={(v: string) => update("FORM_URL", v)}
                placeholder="화면 코드 경로 (예: csa/commMenuMng)"
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="OUT_ACCESS_IP" label="외부 접속 주소" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                aria-label="외부 접속 주소"
                value={String(draft.OUT_ACCESS_IP ?? "")}
                maxLength={150}
                disabled={outAccessIpDisabled}
                onChange={(v: string) => update("OUT_ACCESS_IP", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="USE_TP" label="사용 여부" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Radio name="USE_TP" aria-label="사용 여부" value={String(draft.USE_TP ?? "Y")} options={USE_TP_OPTIONS} onChange={changeUseTp} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="PARAM" meta={false} label="파라메터" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Input aria-label="파라메터" value={String(draft.PARAM ?? "")} maxLength={150} onChange={(v: string) => update("PARAM", v)} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="START_ACTIVE_DATE" label="유효 개시일" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <DatePicker aria-label="유효 개시일" value={toDateInputValue(draft.START_ACTIVE_DATE)} onChange={(v) => update("START_ACTIVE_DATE", v)} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="END_ACTIVE_DATE" label="유효 기한일" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <DatePicker aria-label="유효 기한일" value={toDateInputValue(draft.END_ACTIVE_DATE)} onChange={(v) => update("END_ACTIVE_DATE", v)} />
            </td>
          </tr>
          {/* 퍼미션 모델 v2 — 새 칼럼 3개. 퍼미션은 이 안에서만 고른다. */}
          <tr>
            <th style={DETAIL_LABEL_CELL} colSpan={2}>허용 값 · 콤마로 잇는 값 · 퍼미션은 이 안에서만 고른다</th>
          </tr>
          {PERM_FIELDS.map((p) => {
            const tokens = parseTokens(String(draft[p.field] ?? ""));
            const counts = p.kind ? countByToken(permRows, p.kind, tokens).filter((c) => c.count > 0) : [];
            return (
              <tr key={p.field}>
                <th style={DETAIL_LABEL_CELL}>
                  {p.label}
                  <div style={HINT_STYLE}>{p.field} · 최대 {p.max}자</div>
                </th>
                <td style={DETAIL_VALUE_CELL}>
                  <TokenChipInput
                    key={`${getRowKey(draft)}-${p.field}`}
                    aria-label={p.label}
                    testId={`obj-${p.field}`}
                    placeholder="코드를 쓰고 Enter"
                    value={tokens}
                    maxLength={p.max}
                    onChange={(next) => update(p.field, joinTokens(next))}
                  />
                  <div style={HINT_STYLE}>
                    {p.kind
                      ? counts.length
                        ? `값을 켠 퍼미션 수 · ${counts.map((c) => `${c.token} ${c.count}`).join(" · ")}`
                        : `${p.hint} · 쓰는 퍼미션 없음`
                      : p.hint}
                  </div>
                </td>
              </tr>
            );
          })}
          {warnings.length > 0 && (
            <tr>
              <td colSpan={2} style={DETAIL_VALUE_CELL}>
                <div role="status" style={WARN_STYLE} data-testid="obj-perm-warning">
                  {warnings.map((w) => (
                    <div key={w}>{w}</div>
                  ))}
                  <div style={HINT_STYLE}>저장해도 퍼미션 행은 그대로 두고, 저장 뒤 영향 건수를 알려 줍니다.</div>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </fieldset>
    </div>
  );
});

const FIELDSET_STYLE = { border: 0, margin: 0, padding: 0, minWidth: 0 } as const;

const HINT_STYLE = {
  marginTop: "var(--spacing-xs)",
  fontSize: "var(--font-size-xs)",
  fontWeight: 400,
  color: "var(--color-text-muted)",
} as const;

const WARN_STYLE = {
  padding: "var(--spacing-xs) var(--spacing-sm)",
  background: "var(--color-warning-soft)",
  color: "var(--color-warning)",
  fontSize: "var(--font-size-sm)",
} as const;

/**
 * BE LocalDateTime ISO / "yyyyMMdd" 8자 / "yyyy-MM-dd" / null → DatePicker 가 받는 "yyyy-MM-dd". invalid → "".
 * As-Is xfdl Calendar dateformat="yyyy-MM-dd" (xfdl:106 / 111) 정합.
 */
export function toDateInputValue(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s || s === "null") return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  if (/^\d{8}$/.test(s)) return `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
  return "";
}
