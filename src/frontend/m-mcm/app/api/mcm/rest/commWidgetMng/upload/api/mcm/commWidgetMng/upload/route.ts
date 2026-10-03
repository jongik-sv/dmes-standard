/**
 * 미디어 위젯 올리기 전용 BFF 라우트 — POST `/api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/upload`
 * (widget-types/media/upload.ts MEDIA_UPLOAD_URL, 스펙 2026-10-02-widget-admin-generic §4.3·§5.2·§16.3).
 *
 * 이 경로 하나만 proxy.ts matcher 에서 빠져 있다. proxy 를 거치면 Next 가 본문을 proxyClientMaxBodySize(전역 10MB)까지
 * 메모리에 복제하고 넘는 부분을 잘라 버리기 때문이다(lib/http/body-limit.ts). 대신 여기서
 *  1) proxy 와 같은 인증·권한 판정(guardApiRequest — 권한키 mcm/commwidgetmng/upload)을 먼저 하고,
 *  2) 본문 상한 101MB 를 Content-Length 와 실제 바이트 수로 지키며,
 *  3) 본문을 복제하지 않고 BE `/api/mcm/commWidgetMng/upload` 로 흘려보낸다(일반 rest 라우트와 같은 전달).
 */
import { NextRequest, NextResponse } from "next/server";
import { forwardToBackend } from "@/lib/http/be-proxy";
import {
  declaredBodyExceeds,
  limitBodyStream,
  MEDIA_UPLOAD_BODY_MAX_BYTES,
} from "@/lib/http/body-limit";
import { guardApiRequest } from "@/proxy";

const BACKEND_PATH = "/api/mcm/commWidgetMng/upload";
/** 서버(WidgetMediaStorage)·화면(upload.ts)과 같은 문구. */
const TOO_BIG_MESSAGE = "이미지는 10MB, 동영상은 100MB 까지 올릴 수 있습니다";

function payloadTooLarge(): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: "PAYLOAD_TOO_LARGE", message: TOO_BIG_MESSAGE } },
    { status: 413 },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = await guardApiRequest(req);
  if (denied) return denied;

  if (declaredBodyExceeds(req.headers, MEDIA_UPLOAD_BODY_MAX_BYTES)) {
    return payloadTooLarge();
  }

  // Content-Length 없이(chunked) 오는 본문도 상한을 넘는 순간 끊는다. 끊기면 BE 전달이 실패하므로 413 으로 바꿔 답한다.
  let exceeded = false;
  const body = req.body
    ? limitBodyStream(req.body, MEDIA_UPLOAD_BODY_MAX_BYTES, () => {
        exceeded = true;
      })
    : null;
  const res = await forwardToBackend(req, "mcm", BACKEND_PATH, { body });
  if (exceeded) {
    await res.body?.cancel().catch(() => undefined);
    return payloadTooLarge();
  }
  return res;
}
