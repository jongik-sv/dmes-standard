"use client";

/**
 * window.open(`/popup/{group}/{leaf}?...`) 로 외부 팝업창에서 띄우는 단일 페이지 렌더.
 * portal SPA 와 다른 라우트 — portal 의 탭/사이드바 없이 페이지 컴포넌트만 단독 표시.
 *
 */

import { use, useEffect, useState } from "react";
import { MessageProvider, useGfnMessage } from "@dk-oasis/shared/message-provider";
import "@dk-oasis/shared/portal-shell.css";
import "@dk-oasis/shared/grid.css";
import "@dk-oasis/shared/form.css";
import "@dk-oasis/shared/modal.css";
import { loadConfiguredModulePage } from "../../portal/module-config";

type PageComponent = (props: {
  tabId: string;
  snapshot: Record<string, unknown>;
  onSnapshotChange: (s: Record<string, unknown>) => void;
}) => React.ReactNode;

/** slug 의 첫 segment 를 group, 마지막을 leaf 로 분리. */
function findOwnerModule(slug: string[]): { moduleId: string; pageName: string } | null {
  if (slug.length === 0) return null;
  return { moduleId: "mpp", pageName: slug.join("/") };
}

function PopupBody({ slug }: { slug: string[] }) {
  const gfn_message = useGfnMessage();
  const [PageComponent, setPageComponent] = useState<PageComponent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const target = findOwnerModule(slug);
      if (!target) {
        setError("잘못된 팝업 경로입니다.");
        return;
      }
      try {
        const comp = (await loadConfiguredModulePage(target.moduleId, target.pageName)) as
          | PageComponent
          | null;
        if (!comp) {
          setError(`페이지를 찾을 수 없습니다: ${target.moduleId}/${target.pageName}`);
          return;
        }
        setPageComponent(() => comp);
      } catch (err) {
        setError(err instanceof Error ? err.message : "페이지 로딩 실패");
      }
    })();
  }, [slug]);

  const handleSnapshotChange = (s: Record<string, unknown>) => {
    if (s.action === "cancel" || s.action === "confirm" || s.action === "save") {
      window.close();
    }
  };

  if (error) {
    return (
      <div style={{ padding: 24, color: "#dc3545", fontFamily: "var(--font-family)" }}>
        {error}
      </div>
    );
  }
  if (!PageComponent) {
    return (
      <div style={{ padding: 24, color: "#666", fontFamily: "var(--font-family)" }}>
        팝업 로딩 중...
      </div>
    );
  }

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <PageComponent
        tabId="popup"
        snapshot={{}}
        onSnapshotChange={handleSnapshotChange}
      />
    </div>
  );
}

export default function PopupRoute({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = use(params);
  return (
    <MessageProvider>
      <PopupBody slug={slug} />
    </MessageProvider>
  );
}
