"use client";

/**
 * [정의] 탭 — 쿼리 정의 입력 폼. 입력 state 는 이 컴포넌트에만 둔다(화면 성능 가이드 R12): 화면 루트는 ref 핸들(load·getForm)로 대화한다.
 * 기본 정보: 쿼리 ID(신규 때만 입력), 이름, 분류, 담당 부서(DeptPicker), 설명, 최대 행, 사용 여부.
 * SQL: 위젯 SqlEditor(+runPreview 로 userQueryMng/previewQuery) + [SQL 검증]. 입력 정의: ParamsEditor. 출력 정의: ColumnsEditor.
 * 미리보기 성공 → 결과 열 중 출력 정의에 없는 것만 덧붙인다(있는 열은 지우지 않는다). 미리보기 그리드는 출력 정의대로 그린다.
 */
import { memo, useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import { Button, Input, Radio, Select, Textarea } from "@dk-oasis/shared/form";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { previewUserQuery, validateUserQuery } from "../../_userq/api";
import type { UserQueryDef } from "../../_userq/types";
import type { UsrqCategoryOption } from "../../_userq/use-usrq-categories";
import { ColumnsEditor } from "../../../widget-types/_query/ColumnsEditor";
import { appendMissingFields, appendUndeclaredParams, type QueryParam, type QueryResult } from "../../../widget-types/_query/format";
import { ParamsEditor } from "../../../widget-types/_query/ParamsEditor";
import { QueryStyle } from "../../../widget-types/_query/parts";
import { SqlEditor } from "../../../widget-types/_query/SqlEditor";
import { DeptPicker } from "./DeptPicker";

import { DEFAULT_MAX_ROW, MAX_ROW_LIMIT, USE_YN_OPTIONS, isDefDirty } from "./form-model";
import { PreviewGrid } from "./PreviewGrid";

/** [쿼리 시험] 을 userQueryMng/previewQuery 로 보낸다(SqlEditor 기본은 위젯 관리 commWidgetMng/previewQuery). */
const runPreview = (sql: string, params?: QueryParam[]) => previewUserQuery(sql, params);

/** 폼이 비었을 때 자식에 내려주는 빈 값 — 매 렌더 새 배열이면 memo 자식(그리드)이 글자마다 다시 그려진다(R12). */
const EMPTY_PARAMS: QueryParam[] = [];
const EMPTY_COLUMNS: UserQueryDef["columns"] = [];
const EMPTY_FIELDS: readonly string[] = [];

export interface DefTabHandle {
  /**
   * 폼을 채우고 그 값을 기준값(저장된 값)으로 삼는다. null 이면 선택 없음(모든 칸 비활성).
   * keepView 가 true 면 SQL 칸·시험 결과를 그대로 둔다(저장 뒤 같은 쿼리를 다시 열 때 — 기준값과 ver 만 갱신).
   */
  load(def: UserQueryDef | null, keepView?: boolean): void;
  /** 지금 폼 값. 선택이 없으면 null. */
  getForm(): UserQueryDef | null;
}

export interface DefTabProps {
  ref: Ref<DefTabHandle>;
  /** 신규(저장 전)인가 — 쿼리 ID 를 입력할 수 있다. */
  isNew: boolean;
  /** 처리 중이거나 저장 권한이 없을 때 칸을 잠근다. */
  disabled: boolean;
  categoryOptions: readonly UsrqCategoryOption[];
  /** 저장하지 않은 고침 여부가 바뀔 때만 부른다. */
  onDirtyChange: (dirty: boolean) => void;
}

export const DefTab = memo(function DefTab({ ref, isNew, disabled, categoryOptions, onDirtyChange }: DefTabProps) {
  const [form, setForm] = useState<UserQueryDef | null>(null);
  const [baseline, setBaseline] = useState<UserQueryDef | null>(null);
  const [deptOpen, setDeptOpen] = useState(false);
  /** 마지막 [쿼리 시험] 결과 — 저장하지 않는 화면 전용 값. 다른 쿼리를 열면 비운다. */
  const [preview, setPreview] = useState<QueryResult | null>(null);
  const [validating, setValidating] = useState(false);
  /** load() 마다 올린다 — 이전 쿼리의 [쿼리 시험] 이 늦게 끝나도 새 폼에 결과를 얹지 않고, SqlEditor 의 오류·처리 중 상태를 새로 시작한다. */
  const [loadSeq, setLoadSeq] = useState(0);
  const loadSeqRef = useRef(0);
  const { showMessage } = useMessage();
  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useImperativeHandle(
    ref,
    () => ({
      load: (def, keepView) => {
        formRef.current = def;
        if (!keepView) {
          loadSeqRef.current += 1;
          setLoadSeq(loadSeqRef.current);
          setPreview(null);
        }
        setForm(def);
        setBaseline(def);
      },
      getForm: () => formRef.current,
    }),
    []
  );

  const dirty = isDefDirty(baseline, form);
  const lastDirty = useRef(false);
  useEffect(() => {
    if (lastDirty.current === dirty) return;
    lastDirty.current = dirty;
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const patch = useCallback((p: Partial<UserQueryDef>) => setForm((prev) => (prev ? { ...prev, ...p } : prev)), []);

  const off = disabled || !form;

  const handleSqlChange = useCallback((sql: string) => patch({ sqlText: sql }), [patch]);
  const handleParamsChange = useCallback((params: QueryParam[]) => patch({ params }), [patch]);
  const handleColumnsChange = useCallback((columns: UserQueryDef["columns"]) => patch({ columns }), [patch]);

  /** [쿼리 시험] 성공 — 결과를 보관하고 출력 정의에 없는 결과 열만 덧붙인다. 실패하면 이전 결과를 지운다. */
  const handlePreview = useCallback((result: QueryResult | null) => {
    setPreview(result);
    if (result) {
      setForm((prev) => (prev ? { ...prev, columns: appendMissingFields(prev.columns, result.columns) } : prev));
    }
  }, []);

  /** 이전 쿼리의 늦은 시험 결과를 버린다 — loadSeq 가 key 로 SqlEditor 를 새로 세우므로 이 함수는 load 마다만 바뀐다. */
  const handleSqlPreview = useCallback(
    (result: QueryResult | null) => {
      if (loadSeq === loadSeqRef.current) handlePreview(result);
    },
    [loadSeq, handlePreview]
  );

  /** [SQL 검증] — 선언 안 된 `:이름` 을 글자 형 입력 정의로 더한 뒤 서버 validate 로 바인드 이름을 확인한다. */
  const handleValidate = useCallback(async () => {
    const cur = formRef.current;
    if (!cur) return;
    if (cur.sqlText.trim() === "") {
      showMessage({ message: "SQL을 입력하세요.", alertType: "warning" });
      return;
    }
    setValidating(true);
    try {
      const params = appendUndeclaredParams(cur.params, cur.sqlText);
      if (params.length !== cur.params.length) patch({ params });
      const binds = await validateUserQuery(cur.sqlText, params);
      showMessage({
        message: binds.length > 0 ? `검증되었습니다. 바인드: ${binds.join(", ")}` : "검증되었습니다. 사용자 입력 바인드가 없습니다.",
        alertType: "success",
        toast: true,
      });
    } catch (e) {
      showMessage({ title: "오류", message: e instanceof Error ? e.message : String(e), alertType: "error" });
    } finally {
      setValidating(false);
    }
  }, [patch, showMessage]);

  return (
    <>
      <QueryStyle />
      <table style={DETAIL_TABLE_STYLE} data-testid="userq-admin-def">
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>쿼리 ID{isNew ? " *" : ""}</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                value={form?.queryId ?? ""}
                maxLength={40}
                placeholder="예: DAILY_PROD"
                readOnly={!isNew}
                disabled={off || !isNew}
                aria-label="쿼리 ID"
                data-testid="userq-admin-query-id"
                onChange={(v) => patch({ queryId: v.toUpperCase() })}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>이름 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                value={form?.queryNm ?? ""}
                maxLength={100}
                disabled={off}
                aria-label="쿼리 이름"
                data-testid="userq-admin-query-nm"
                onChange={(v) => patch({ queryNm: v })}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>분류</th>
            <td style={DETAIL_VALUE_CELL}>
              <Select
                value={form?.categoryCd ?? ""}
                options={[{ value: "", label: "없음" }, ...categoryOptions]}
                disabled={off}
                aria-label="분류"
                data-testid="userq-admin-category"
                onChange={(v) => patch({ categoryCd: v || null })}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>담당 부서</th>
            <td style={DETAIL_VALUE_CELL}>
              <div style={{ display: "flex", gap: "var(--spacing-xs)" }}>
                <Input
                  value={form?.ownerDeptCd ? `${form.ownerDeptNm ?? ""} (${form.ownerDeptCd})`.trim() : ""}
                  readOnly
                  disabled={off}
                  placeholder="부서를 선택하세요"
                  aria-label="담당 부서"
                  data-testid="userq-admin-owner-dept"
                />
                <Button size="sm" disabled={off} onClick={() => setDeptOpen(true)} data-testid="userq-admin-dept-pick">
                  선택
                </Button>
                <Button
                  size="sm"
                  disabled={off || !form?.ownerDeptCd}
                  onClick={() => patch({ ownerDeptCd: null, ownerDeptNm: null })}
                  data-testid="userq-admin-dept-clear"
                >
                  지움
                </Button>
              </div>
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>설명</th>
            <td style={DETAIL_VALUE_CELL}>
              <Textarea
                rows={2}
                value={form?.queryDesc ?? ""}
                maxLength={500}
                disabled={off}
                aria-label="설명"
                onChange={(v) => patch({ queryDesc: v === "" ? null : v })}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>최대 행 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                type="number"
                min={1}
                max={MAX_ROW_LIMIT}
                value={String(form?.maxRowCnt ?? DEFAULT_MAX_ROW)}
                disabled={off}
                aria-label="최대 행"
                data-testid="userq-admin-max-row"
                onChange={(v) => patch({ maxRowCnt: v === "" ? 0 : Number(v) })}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>사용 여부</th>
            <td style={DETAIL_VALUE_CELL}>
              <Radio
                name="userq-use-yn"
                options={USE_YN_OPTIONS}
                value={form?.useYn ?? "Y"}
                disabled={off}
                onChange={(v) => patch({ useYn: v === "N" ? "N" : "Y" })}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>SQL *</th>
            <td style={DETAIL_VALUE_CELL}>
              <SqlEditor
                key={loadSeq}
                sql={form?.sqlText ?? ""}
                params={form?.params}
                preview={preview}
                onSqlChange={handleSqlChange}
                onPreview={handleSqlPreview}
                runPreview={runPreview}
              />
              <Button
                size="sm"
                disabled={off || validating}
                onClick={() => void handleValidate()}
                data-testid="userq-admin-validate"
              >
                {validating ? "검증 중…" : "SQL 검증"}
              </Button>
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>입력 정의</th>
            <td style={DETAIL_VALUE_CELL}>
              <ParamsEditor sql={form?.sqlText ?? ""} params={form?.params ?? EMPTY_PARAMS} onChange={handleParamsChange} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>출력 정의</th>
            <td style={DETAIL_VALUE_CELL}>
              <ColumnsEditor
                columns={form?.columns ?? EMPTY_COLUMNS}
                fields={preview?.columns ?? EMPTY_FIELDS}
                title="출력 정의"
                idPrefix="userq-col"
                testId="userq-columns"
                onChange={handleColumnsChange}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>미리보기</th>
            <td style={DETAIL_VALUE_CELL}>
              <PreviewGrid result={preview} columns={form?.columns ?? EMPTY_COLUMNS} />
            </td>
          </tr>
        </tbody>
      </table>
      {deptOpen ? (
        <DeptPicker
          open
          onClose={() => setDeptOpen(false)}
          onPick={(d) => {
            patch({ ownerDeptCd: d.deptCd, ownerDeptNm: d.deptNm });
            setDeptOpen(false);
          }}
        />
      ) : null}
    </>
  );
});
