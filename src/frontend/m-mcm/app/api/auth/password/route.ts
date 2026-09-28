import { NextRequest, NextResponse } from "next/server";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://localhost:8080";
const BACKEND_CLIENT_KEY = process.env.BACKEND_CLIENT_KEY;

/** PATCH /api/auth/password → 백엔드 PATCH /api/auth/change-password */
export async function PATCH(req: NextRequest) {
  return proxyToBackend(req, "/api/auth/change-password", "PATCH");
}

/** POST /api/auth/password → 백엔드 POST /api/auth/reset-password */
export async function POST(req: NextRequest) {
  return proxyToBackend(req, "/api/auth/reset-password", "POST");
}

async function proxyToBackend(req: NextRequest, path: string, method: string) {
  try {
    const body = await req.json();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (BACKEND_CLIENT_KEY) {
      headers["X-Client-Key"] = BACKEND_CLIENT_KEY;
    }

    const res = await fetch(`${BACKEND_API_URL}${path}`, {
      method,
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json();
    // BE ApiResponse 는 실패 사유를 최상위 message/errorCode 에 두지만 화면은 data.error.message 를
    // 읽는다. 그대로 통과시키면 실제 사유가 사라지고 "비밀번호 변경에 실패했습니다" 만 찍힌다.
    // BFF 응답 규약(be-proxy.ts)과 같은 error 중첩으로 변환한다.
    if (data && typeof data === "object" && data.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: data.error?.code ?? data.errorCode ?? "SERVER_ERROR",
            message: data.error?.message ?? data.message ?? "비밀번호 변경에 실패했습니다.",
          },
        },
        { status: res.status },
      );
    }
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "서버 연결에 실패했습니다." } },
      { status: 500 }
    );
  }
}
