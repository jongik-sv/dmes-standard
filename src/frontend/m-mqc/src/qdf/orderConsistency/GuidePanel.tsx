"use client";

/**
 * 「룰 등록 안내」 탭 — 시제품의 3단계 신규 등록(대상 항목 → 조건 → 결과)이 Maru 룰 표의 어느 칸이 되는지 보인다.
 * 등록·수정은 Maru 룰 편집 화면에서 하고(새 버전 → 확정), 이 화면은 [조회] 로 다시 읽어 룰 목록·시뮬레이션에서 확인한다.
 */
import { memo, type CSSProperties } from "react";

import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";
import { Button } from "@dk-oasis/shared/form";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";

import { CATEGORY_ORDER } from "./model";

const OP_COLUMNS: GridColumn[] = [
  { key: "op", header: "연산자", width: 90, align: "center", meta: false },
  { key: "words", header: "화면 문장", width: 160, align: "left", meta: false },
  { key: "cell", header: "Maru 셀", width: 160, align: "left", meta: false },
  {
    key: "note",
    header: "쓸 수 있는 항목",
    width: 160,
    align: "left",
    meta: false,
  },
];

const OP_ROWS = [
  { op: "EQ", words: "~임 / ~이고", cell: "= 값", note: "모든 항목" },
  { op: "NE", words: "~이 아님", cell: "<> 값", note: "모든 항목" },
  { op: "IN", words: "a·b·c 중 하나", cell: "IN (a, b, c)", note: "모든 항목" },
  {
    op: "NOT_IN",
    words: "a·b·c 외의 값",
    cell: "NOT IN (a, b, c)",
    note: "모든 항목",
  },
  { op: "GT·GE", words: "초과·이상", cell: "> 값 · >= 값", note: "숫자 항목" },
  { op: "LT·LE", words: "미만·이하", cell: "< 값 · <= 값", note: "숫자 항목" },
  {
    op: "BETWEEN",
    words: "x 이상 ~ y 이하(미만)",
    cell: "x <= 변수 <= y",
    note: "숫자 항목",
  },
  { op: "IS_NULL", words: "입력 없음", cell: "IS NULL", note: "모든 항목" },
  {
    op: "NOT_NULL",
    words: "입력 있음",
    cell: "IS NOT NULL",
    note: "모든 항목",
  },
];

const STEP: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  padding: "8px 10px",
};

export const GuidePanel = memo(function GuidePanel({
  screenId,
  ruleId,
  onEdit,
}: {
  screenId: string;
  ruleId: string;
  onEdit: () => void;
}) {
  return (
    <ContentBody root>
      <ContentPanel scrollY>
        <CardFrame
          title="신규 룰 등록은 Maru 에서 합니다"
          testId={`${screenId}-guide`}
          right={
            <Button
              variant="primary"
              size="sm"
              data-testid={`${screenId}-guide-edit`}
              onClick={onEdit}
            >
              Maru에서 편집
            </Button>
          }
        >
          <div style={{ display: "grid", gap: 8 }}>
            <MutedText>
              주문정합성 룰은 Maru 룰 {ruleId}(적중 행 모두 적용 · COLLECT) 한
              표에 있습니다. 한 행이 룰 하나이고, 조건 칸이 모두 맞으면 그 행의
              에러가 발생합니다. 아래 3단계가 Maru 표의 칸이 됩니다.
            </MutedText>
            <div style={STEP}>
              <b>① 대상 항목</b>
              <div>
                에러가 가리키는 주문 항목 코드를 결과 칸 「대상
                항목」(TARGET_ITEM)에 적습니다. 그 항목의 조건 칸에는 대상
                조건을 둡니다(누락이면 IS NULL, 선택 오류면 = 값 등).
              </div>
            </div>
            <div style={STEP}>
              <b>② 조건</b>
              <div>
                주문 항목 66개가 조건 칸입니다. 보는 항목에만 연산자와 값을 넣고
                나머지 칸은 비워 둡니다(보지 않음). 순서
                비교(초과·이상·미만·이하·범위)는 숫자 항목에만 씁니다. 값이
                하나인 IN·NOT IN 은 = · &lt;&gt; 로 씁니다.
              </div>
            </div>
            <div style={STEP}>
              <b>③ 결과</b>
              <div>
                룰 ID(RULE_KEY, 직접 등록은 R-Unnn) · 에러코드 · 에러 메시지 ·
                분류 · 심각도(error) · 경고 후보 · 담당 부서 · 조치 주체 ·
                출처를 적습니다.
              </div>
              <div>
                분류는 메시지 끝말로 정합니다: {CATEGORY_ORDER.join(" · ")}(누락
                → 누락, 불필요 → 불필요, 불가 → 사용불가, 한도·준수·제한·Max·Min
                → 한도위반, 그 밖 → 선택오류). 메시지에 협의·문의·확인이 있으면
                경고 후보를 Y 로 둡니다.
              </div>
            </div>
            <div style={STEP}>
              <b>확정과 확인</b>
              <div>
                Maru 에서 새 버전을 만들어 저장·확정하면 적용 시작 시각부터
                판정에 쓰입니다. 이 화면에서 [조회] 를 누르고 룰 목록의 문장,
                「주문 시뮬레이션」의 발화([시뮬레이션에서 확인]), 「변경
                이력」의 행 차이를 확인합니다.
              </div>
            </div>
          </div>
        </CardFrame>
        <CardFrame title="연산자와 화면 문장">
          <AgDataGrid
            gridId="operators"
            title="연산자 대응"
            rowKey="op"
            columns={OP_COLUMNS}
            data={OP_ROWS}
            columnSizing="fit"
            height="auto"
            settingsMenu={false}
            personalize={false}
          />
        </CardFrame>
      </ContentPanel>
    </ContentBody>
  );
});
