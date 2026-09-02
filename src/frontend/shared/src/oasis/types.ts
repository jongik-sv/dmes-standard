/** OASIS 서비스 요청 */
export interface OasisServiceRequest {
  params?: Record<string, string | number | boolean | null>;
  datasets?: Record<string, Record<string, unknown>[]>;
}

/** OASIS 서비스 응답 */
export interface OasisServiceResponse<T = Record<string, unknown>> {
  success: boolean;
  code: "SUCCESS" | "USER_ERROR" | "SYSTEM_ERROR";
  data: T;
  statusMap: {
    ErrorCode: number;
    ErrorMsg: string;
  };
  path: string[];
  messages: unknown[];
}

/** 로그인 요청 (백엔드 LoginRequest: email + password) */
export interface OasisLoginRequest {
  email: string;
  password: string;
}

/** 로그인 응답 (ApiResponse<AuthResponse> 구조) */
export interface OasisLoginApiResponse {
  success: boolean;
  data: OasisLoginData;
  error?: { code: string; message: string } | null;
  timestamp?: string;
}

/** 로그인 데이터 (백엔드 AuthResponse) */
export interface OasisLoginData {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

/** API 클라이언트 옵션 */
export interface OasisApiClientOptions {
  baseUrl: string;
  onUnauthorized?: () => void;
}
