"use client";

/**
 * 표 아래 줄 — 왼쪽 안내 글(행 수 등)과 오른쪽 [엑셀] 단추.
 * 쿼리 표(query-table)와 홈 기본 표 위젯(작업 지시·출하)이 같은 모습·같은 data-testid(wq-excel)로 쓴다.
 * 스타일은 QueryStyle 의 .wq-foot 규칙이다(React 19 `<style href>` 라 여러 번 그려도 한 번만 실린다).
 */
import { IconDownload } from "@tabler/icons-react";
import { Button } from "@dk-oasis/shared/form";

import { QueryStyle } from "./parts";

export interface ExcelFootProps {
  /** 왼쪽 안내 글 — 「3행」「N건」「상위 500행만 표시합니다」 등. */
  note: string;
  /** [엑셀] 을 눌렀을 때. */
  onExcel: () => void;
  /** 내려받을 행이 없을 때 단추를 비활성으로 둔다. */
  disabled?: boolean;
}

export function ExcelFoot({ note, onExcel, disabled }: ExcelFootProps) {
  return (
    <>
      <QueryStyle />
      <div className="wq-foot">
        <span className="wq-foot__note">{note}</span>
        <Button
          size="mini"
          onClick={onExcel}
          disabled={disabled}
          title="보이는 행을 엑셀로 내려받기"
          data-testid="wq-excel"
        >
          <IconDownload size={12} aria-hidden="true" style={{ marginRight: 2 }} />
          엑셀
        </Button>
      </div>
    </>
  );
}
