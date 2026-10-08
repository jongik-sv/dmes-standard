"use client";

/**
 * DB 뷰어 — LOB 칸 상세 창.
 * 결과 그리드의 「보기」 단추가 열고, 그 한 칸만 `POST /db/lob` 으로 다시 읽어 보인다.
 *  - text: JSON 객체·배열이면 JsonView 트리(20만 자 초과는 그냥 글), 아니면 줄바꿈을 살린 고정폭 글
 *  - image: <img> (창 폭에 맞춤)
 *  - binary: 16진수 덤프(한 줄 16바이트)
 * 창을 닫거나 다른 칸을 열면(부모가 key 를 바꿔 다시 마운트) AbortController 로 진행 중 요청을 취소한다.
 */

import { useEffect, useMemo, useState } from "react";
import { Button, Spinner } from "@dk-oasis/shared/form";
import { JsonView } from "@dk-oasis/shared/json-view";
import { Modal } from "@dk-oasis/shared/modal";
import { fetchLob } from "./db-viewer-api";
import {
  hexDump,
  isImageMime,
  JSON_VIEW_MAX_CHARS,
  lobModalTitle,
  parseJsonContainer,
  truncationNotice,
} from "./lob-format";
import type { DbLobRequest, DbLobResult } from "./types";

/** 상세 창이 읽을 칸 — 요청 값에 제목용 데이터 형식을 더한 것. */
export interface LobTarget extends DbLobRequest {
  dataType: string;
}

type LobState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; lob: DbLobResult };

function errText(err: unknown): string {
  return err instanceof Error ? err.message : "요청이 실패했습니다.";
}

function LobContent({ lob }: { lob: DbLobResult }) {
  const json = useMemo(
    () =>
      lob.kind === "text" &&
      lob.text != null &&
      lob.text.length <= JSON_VIEW_MAX_CHARS
        ? parseJsonContainer(lob.text)
        : null,
    [lob],
  );
  const dump = useMemo(
    () => (lob.kind === "binary" && lob.hex != null ? hexDump(lob.hex) : ""),
    [lob],
  );

  if (lob.kind === "text") {
    if (lob.text == null || lob.text === "") {
      return <div className="anl-db-lob-empty">내용이 없습니다.</div>;
    }
    if (json) {
      return (
        <JsonView
          value={json.value}
          fill
          defaultExpandDepth={2}
          testId="db-lob-json"
        />
      );
    }
    return (
      <pre className="anl-db-lob-text" data-testid="db-lob-text">
        {lob.text}
      </pre>
    );
  }

  if (lob.kind === "image" && isImageMime(lob.mime) && lob.base64) {
    return (
      <div className="anl-db-lob-image-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URI 라 최적화 대상이 아니다 */}
        <img
          className="anl-db-lob-image"
          src={`data:${lob.mime};base64,${lob.base64}`}
          alt={lob.column}
          data-testid="db-lob-image"
        />
      </div>
    );
  }

  if (lob.hex) {
    return (
      <pre className="anl-db-lob-text anl-db-lob-hex" data-testid="db-lob-hex">
        {dump}
      </pre>
    );
  }
  return <div className="anl-db-lob-empty">내용이 없습니다.</div>;
}

export function LobViewerModal({
  target,
  onClose,
}: {
  target: LobTarget;
  onClose: () => void;
}) {
  const [state, setState] = useState<LobState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    const { schema, table, column, rowid } = target;
    fetchLob({ schema, table, column, rowid }, controller.signal).then(
      (lob) => {
        if (!controller.signal.aborted) setState({ status: "done", lob });
      },
      (err: unknown) => {
        // 창을 닫아 취소한 요청의 오류는 화면에 보이지 않는다.
        if (controller.signal.aborted) return;
        setState({ status: "error", message: errText(err) });
      },
    );
    return () => controller.abort();
  }, [target]);

  const lob = state.status === "done" ? state.lob : null;
  const title = lob
    ? lobModalTitle(target.column, lob.dataType || target.dataType, lob.length, lob.lengthKnown)
    : lobModalTitle(target.column, target.dataType);
  const notice = lob ? truncationNotice(lob) : null;

  return (
    <Modal
      open
      title={title}
      size="xl"
      onClose={onClose}
      footer={<Button onClick={onClose}>닫기</Button>}
    >
      <div className="anl-db-lob-body" data-testid="db-lob-modal">
        {notice && (
          <div className="anl-db-lob-notice" role="status">
            {notice}
          </div>
        )}
        {lob?.note && (
          <div className="anl-db-lob-notice" role="status">
            {lob.note}
          </div>
        )}
        {state.status === "loading" && (
          <div className="anl-db-lob-state" data-testid="db-lob-loading">
            <Spinner />
          </div>
        )}
        {state.status === "error" && (
          <div className="anl-db-lob-state anl-db-error-text" role="alert">
            {state.message}
          </div>
        )}
        {state.status === "done" && <LobContent lob={state.lob} />}
      </div>
    </Modal>
  );
}
