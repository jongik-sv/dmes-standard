/**
 * BFF 요청 본문 상한(스펙 2026-10-02-widget-admin-generic §16.3 「BFF 본문 상한 전역 확대」 해결).
 *
 * Next 16 은 proxy.ts 가 도는 요청의 본문을 `experimental.proxyClientMaxBodySize` 까지 메모리에 복제해 두었다가
 * 라우트로 넘기고, 넘는 부분은 버린다(잘린 본문이 라우트로 간다 — next/dist/server/body-streams.js `cloneBodyStream`,
 * next-server.js `runMiddleware` 의 `finalize()` 가 업로드 끝까지 기다린다). 값은 전역 하나뿐이라 경로별로 줄 수 없다.
 * 그래서 일반 API 는 Next 기본값 10MB 를 그대로 두고, 미디어 올리기 한 경로만 proxy matcher 에서 빼서
 * 전용 라우트(app/api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/upload/route.ts)가 같은 인증·권한 검사 뒤
 * 본문을 복제 없이 BE 로 흘려보낸다. 그 라우트의 상한은 아래 MEDIA_UPLOAD_BODY_MAX_BYTES 로 직접 지킨다.
 */

/** 일반 API 본문 상한 — Next 16 기본값(next/dist/server/config-shared.js `proxyClientMaxBodySize: 10485760`)과 같다. */
export const API_BODY_MAX_BYTES = 10 * 1024 * 1024;

/**
 * 미디어 올리기 본문 상한 — 동영상 100MB(§4.3) + multipart 머리말 여유 1MB.
 * BE spring.servlet.multipart.max-request-size 와 같은 값.
 */
export const MEDIA_UPLOAD_BODY_MAX_BYTES = 101 * 1024 * 1024;

/** Content-Length 가 상한을 넘는지. 헤더가 없거나 숫자가 아니면 false(본문을 세어 보는 쪽에 맡긴다). */
export function declaredBodyExceeds(headers: Headers, maxBytes: number): boolean {
  const raw = headers.get("content-length");
  if (!raw || !/^\d+$/.test(raw.trim())) return false;
  return Number(raw.trim()) > maxBytes;
}

/**
 * 본문을 흘려보내며 바이트를 센다. 상한을 넘으면 onExceeded 를 부르고 스트림을 오류로 끝낸다
 * (Content-Length 없이 chunked 로 오는 요청 대비 — 메모리에 쌓지 않는다).
 */
export function limitBodyStream(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  onExceeded: () => void,
): ReadableStream<Uint8Array> {
  let total = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > maxBytes) {
          onExceeded();
          controller.error(new Error(`요청 본문이 상한 ${maxBytes} 바이트를 넘었습니다.`));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}
