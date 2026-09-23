import type { ErrorCode } from "../contract/engine-contract.generated";

/** 판정 오류 — 서버가 같은 입력에서 내는 오류 코드를 싣는다. */
export class EvalexError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? code);
    this.name = "EvalexError";
    this.code = code;
  }
}

/** 화면이 서버와 같은 값을 낸다고 보장할 수 없는 자리 — 서버 미리보기로 폴백한다(design D4). */
export class FallbackSignal extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "FallbackSignal";
    this.reason = reason;
  }
}
