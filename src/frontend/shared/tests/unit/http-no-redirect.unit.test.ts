/**
 * `postJsonNoRedirect()` — 실패 응답(!ok)의 본문을 버린다.
 *
 * 본문을 읽지도 취소하지도 않고 던지면 브라우저(Chrome)는 그 요청을 끝난 것으로 치지 않아 연결을 잡고, 페이지의 networkidle 이
 * 오지 않는다(MDM 화면 메타 공급자가 엔드포인트 없는 모듈의 404 를 받을 때 — mdm-user e2e 가 waitIdle 마다 30초씩 걸렸다).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpError, postJsonNoRedirect } from "../../src/http";

function streamResponse(status: number, onCancel: () => void): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"meta":{"code":"E404"}}'));
      // close 하지 않는다 — 소비자가 읽거나 취소하기 전까지 열린 본문(실제 네트워크 응답과 같다).
    },
    cancel() {
      onCancel();
    },
  });
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postJsonNoRedirect 실패 응답 본문", () => {
  it("404 면 HttpError 를 던지기 전에 본문을 취소해 요청을 끝낸다", async () => {
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse(404, cancel)));

    await expect(postJsonNoRedirect("/api/mdm/mdmMeta/columns", { names: ["A"] })).rejects.toBeInstanceOf(HttpError);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("던지는 HttpError 의 상태는 그대로다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse(503, () => undefined)));

    await expect(postJsonNoRedirect("/x", {})).rejects.toMatchObject({ status: 503 });
  });
});
