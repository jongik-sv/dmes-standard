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
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "서버 연결에 실패했습니다." } },
      { status: 500 }
    );
  }
}
