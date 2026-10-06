"use client";

/**
 * 위젯 틀 머리의 「?」 도움말 단추 — meta.help 가 있는 위젯에만 그려지고, 누르면 도움말 문서를 모달로 연다.
 * 모달(문서 보기·마크다운)은 처음 누를 때 지연 로딩한다. 닫으면 모달이 초점을 이 단추로 돌려준다.
 */
import { lazy, Suspense, useState } from "react";

import type { WidgetHelp } from "./types";

const WidgetHelpModal = lazy(() => import("./WidgetHelpModal"));

export function WidgetHelpButton({ help }: { help: WidgetHelp }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="cm-widget__btn"
        data-action="help"
        title="도움말"
        aria-label="도움말"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open && (
        <Suspense fallback={null}>
          <WidgetHelpModal help={help} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
