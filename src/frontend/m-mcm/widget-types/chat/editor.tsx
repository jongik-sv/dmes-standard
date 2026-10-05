"use client";

/**
 * AI 챗봇 편집기 — 위젯관리 화면 상세 영역에 들어가는 유형 설정 칸(스펙 2026-10-02-widget-admin-generic §6·§9, 계획 Task 14).
 * 시스템 프롬프트·첫 인사·「포털 화면 안내」·「데이터 질의에 쓸 쿼리 위젯」(commWidgetMng/search 결과 중 query- 유형·사용 중).
 * 늘 정규화한 전체 설정을 onChange 로 올리고, 검사 결과(저장 막기용 오류 목록)를 onValidate 로 알린다.
 * 쿼리 위젯 목록을 못 불러와도 기존 선택은 그대로 둔다(안내만 보이고 저장은 막지 않는다).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Checkbox, Input, MultiSelectComboBox, Textarea } from "@dk-oasis/shared/form";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { MdmFieldLabel, MdmMetaProvider } from "@dk-oasis/shared/mdm-meta";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { searchQueryWidgetDefs } from "./api";
import {
  buildQueryWidgetOptions,
  CHAT_SYSTEM_PROMPT_NOTE,
  normalizeChatConfig,
  queryWidgetIds,
  validateChatConfig,
  type ChatConfig,
} from "./chat-model";

// 긴 라벨(「데이터 질의에 쓸 쿼리 위젯」)은 줄을 바꿔 130px 폭을 지킨다. 위·아래 정렬은 배치 값이라 인라인으로 둔다.
const LABEL: CSSProperties = { ...DETAIL_LABEL_CELL, whiteSpace: "normal" };
const LABEL_TOP: CSSProperties = { ...LABEL, verticalAlign: "top" };
const NOTE: CSSProperties = { margin: "var(--spacing-xs) 0 0", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" };
const NOTE_ERROR: CSSProperties = { ...NOTE, color: "var(--color-danger)" };

export default function ChatEditor({ value, onChange, onValidate }: WidgetTypeEditorProps) {
  const cfg = useMemo(() => normalizeChatConfig(value), [value]);
  const [defs, setDefs] = useState<unknown[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    searchQueryWidgetDefs().then(
      (rows) => {
        if (alive) setDefs(rows);
      },
      () => {
        if (alive) setLoadFailed(true);
      }
    );
    return () => {
      alive = false;
    };
  }, []);

  // defs 가 null(불러오는 중·실패)이면 고른 ID 를 그대로 보인다 — 「사용할 수 없음」 표시는 목록을 읽은 뒤에만.
  const options = useMemo(() => buildQueryWidgetOptions(defs, cfg.dataQueryDefIds), [defs, cfg.dataQueryDefIds]);
  const availableIds = useMemo(() => (defs ? queryWidgetIds(defs) : null), [defs]);
  const errors = useMemo(() => validateChatConfig(cfg, availableIds), [cfg, availableIds]);

  // 부모가 렌더마다 새 함수를 넘겨도 검사 알림이 되풀이되지 않게 — 오류 내용이 바뀔 때(와 처음)만 알린다.
  const onValidateRef = useRef(onValidate);
  useEffect(() => {
    onValidateRef.current = onValidate;
  }, [onValidate]);
  const errorsKey = JSON.stringify(errors);
  useEffect(() => {
    onValidateRef.current?.(JSON.parse(errorsKey) as string[]);
  }, [errorsKey]);

  const patch = (p: Partial<ChatConfig>) => onChange({ ...cfg, ...p });

  return (
    <MdmMetaProvider disabled>
      <div data-testid="chat-editor">
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={LABEL_TOP}>
                <MdmFieldLabel name="systemPrompt" label="시스템 프롬프트" />
              </th>
              <td style={DETAIL_VALUE_CELL}>
                <Textarea
                  value={cfg.systemPrompt}
                  rows={6}
                  placeholder="예: 생산·품질 담당자에게 간결한 존댓말로 답한다."
                  aria-label="시스템 프롬프트"
                  onChange={(v) => patch({ systemPrompt: v })}
                />
                <p style={NOTE}>{CHAT_SYSTEM_PROMPT_NOTE}</p>
              </td>
            </tr>
            <tr>
              <th style={LABEL}>
                <MdmFieldLabel name="welcome" label="첫 인사" />
              </th>
              <td style={DETAIL_VALUE_CELL}>
                <Input
                  value={cfg.welcome}
                  placeholder="무엇을 도와드릴까요?"
                  aria-label="첫 인사"
                  onChange={(v) => patch({ welcome: v })}
                />
                <p style={NOTE}>대화 기록이 없을 때 도우미 말풍선으로 보입니다. 비우면 인사를 보이지 않습니다.</p>
              </td>
            </tr>
            <tr>
              <th style={LABEL}>
                <MdmFieldLabel name="pageGuide" label="포털 화면 안내" />
              </th>
              <td style={DETAIL_VALUE_CELL}>
                <Checkbox
                  label="사용자가 볼 수 있는 화면을 찾아 안내"
                  checked={cfg.pageGuide}
                  onChange={(checked) => patch({ pageGuide: checked })}
                />
              </td>
            </tr>
            <tr>
              <th style={LABEL_TOP}>
                <MdmFieldLabel name="dataQueryDefIds" label="데이터 질의에 쓸 쿼리 위젯" />
              </th>
              <td style={DETAIL_VALUE_CELL}>
                <MultiSelectComboBox
                  data={options}
                  value={cfg.dataQueryDefIds}
                  placeholder="쿼리 위젯 선택"
                  aria-label="데이터 질의에 쓸 쿼리 위젯"
                  onChange={(ids) => patch({ dataQueryDefIds: ids })}
                />
                <p style={NOTE}>고른 쿼리 위젯의 결과만 도우미가 조회할 수 있습니다. 도우미가 SQL 을 직접 만들어 실행하지는 않습니다.</p>
                {loadFailed && (
                  <p style={NOTE_ERROR} role="alert">
                    쿼리 위젯 목록을 불러오지 못했습니다. 지금 선택한 값은 그대로 저장됩니다.
                  </p>
                )}
              </td>
            </tr>
          </tbody>
        </table>
        <p style={NOTE}>AI 연결(공급자·키)은 서버 설정(dmes.widget.llm.*)에서 정합니다.</p>
      </div>
    </MdmMetaProvider>
  );
}
