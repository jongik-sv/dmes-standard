"use client";

/**
 * 로그 분석 (anl/logViewer) — JSON 탭 트리 뷰.
 * 원본: analog-express-ui-plate LogViewer.js 의 react18-json-view 사용부 이식.
 *  - collapsed 규칙 원본 동일: indexOrName==='property'/'service' 펼침, depth<3 펼침, 그 외 접힘.
 *  - collapseStringsAfterLength 원본 "9999999"(문자열) → number 로 정리.
 *  - enableClipboard 원본 "false"(문자열 truthy 버그) → 비활성 의도로 보고 false 로 정리.
 */

import { memo } from "react";
import JsonView from "react18-json-view";
import "react18-json-view/src/style.css";

interface JsonTreeViewProps {
  data: unknown;
}

/** 모듈 상수 — 렌더마다 새 함수를 넘기면 트리를 통째로 다시 펼친다. */
function isCollapsed({
  indexOrName,
  depth,
}: {
  indexOrName: number | string | undefined;
  depth: number;
}): boolean {
  if (indexOrName === "property") return false;
  if (indexOrName === "service") return false;
  if (depth < 3) return false;
  return true;
}

function JsonTreeViewComponent({ data }: JsonTreeViewProps) {
  return (
    <div className="anl-json-pane">
      <JsonView
        collapsed={isCollapsed}
        theme="vscode"
        collapseStringsAfterLength={9999999}
        enableClipboard={false}
        src={data}
      />
    </div>
  );
}

/** 숨은 JSON 탭도 pane 은 마운트되어 있으므로 memo 로 data 가 바뀔 때만 다시 그린다. */
export const JsonTreeView = memo(JsonTreeViewComponent);
