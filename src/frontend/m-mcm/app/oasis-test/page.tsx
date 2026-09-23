"use client";

import { useState, useCallback } from "react";
import {
  useOasisAuth,
  useOasisService,
  getAccessToken,
  clearTokens,
} from "@dk-oasis/shared/oasis";
import type { OasisServiceResponse } from "@dk-oasis/shared/oasis";

export default function OasisTestPage() {
  // --- Auth ---
  const { login, loading: authLoading, error: authError } = useOasisAuth();
  const [email, setEmail] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [loggedIn, setLoggedIn] = useState(false);
  const [userName, setUserName] = useState("");

  // --- Service ---
  const { execute, loading: svcLoading, error: svcError } = useOasisService();
  const [serviceUrl, setServiceUrl] = useState("csa::CommUserMng");
  const [action, setAction] = useState("searchCmUser");
  const [paramsJson, setParamsJson] = useState('{"p_USER_ID": ""}');
  const [datasetsJson, setDatasetsJson] = useState("");
  const [result, setResult] = useState<OasisServiceResponse | null>(null);

  // --- Handlers ---
  const handleLogin = useCallback(async () => {
    const data = await login({ email, password });
    if (data) {
      setLoggedIn(true);
      setUserName(email);
    }
  }, [login, email, password]);

  const handleLogout = useCallback(() => {
    clearTokens();
    setLoggedIn(false);
    setUserName("");
    setResult(null);
  }, []);

  const handleExecute = useCallback(async () => {
    setResult(null);
    let params: Record<string, string | number | boolean | null> | undefined;
    let datasets: Record<string, Record<string, unknown>[]> | undefined;

    try {
      if (paramsJson.trim()) params = JSON.parse(paramsJson);
    } catch {
      alert("params JSON 파싱 오류");
      return;
    }
    try {
      if (datasetsJson.trim()) datasets = JSON.parse(datasetsJson);
    } catch {
      alert("datasets JSON 파싱 오류");
      return;
    }

    const res = await execute(action, serviceUrl, { params, datasets });
    if (res) setResult(res);
  }, [execute, action, serviceUrl, paramsJson, datasetsJson]);

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 24 }}>OASIS Service Test</h1>

      {/* ===== Auth Section ===== */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>1. 인증 (dmes-backend JWT)</h2>
        {!loggedIn ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              style={inputStyle}
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              style={inputStyle}
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button style={btnStyle} onClick={handleLogin} disabled={authLoading}>
              {authLoading ? "로그인 중..." : "로그인"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ color: "#28a745", fontWeight: 600 }}>
              {userName} ({email}) 로그인됨
            </span>
            <button style={{ ...btnStyle, background: "#dc3545" }} onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        )}
        {authError && <p style={errStyle}>{authError}</p>}
        {loggedIn && (
          <details style={{ marginTop: 8, fontSize: 12, color: "#888" }}>
            <summary>JWT 토큰 보기</summary>
            <pre style={preStyle}>{getAccessToken()}</pre>
          </details>
        )}
      </section>

      {/* ===== Service Call Section ===== */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>2. 서비스 호출</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <label style={labelStyle}>
            serviceUrl (group::id)
            <input
              style={inputStyle}
              value={serviceUrl}
              onChange={(e) => setServiceUrl(e.target.value)}
              placeholder="csa::CommUserMng"
            />
          </label>
          <label style={labelStyle}>
            action
            <input
              style={inputStyle}
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="searchUser"
            />
          </label>
        </div>
        <label style={labelStyle}>
          params (JSON)
          <textarea
            style={{ ...inputStyle, height: 50, fontFamily: "monospace", fontSize: 13 }}
            value={paramsJson}
            onChange={(e) => setParamsJson(e.target.value)}
            placeholder='{"p_USER_ID": ""}'
          />
        </label>
        <label style={labelStyle}>
          datasets (JSON, 선택)
          <textarea
            style={{ ...inputStyle, height: 50, fontFamily: "monospace", fontSize: 13 }}
            value={datasetsJson}
            onChange={(e) => setDatasetsJson(e.target.value)}
            placeholder='{"ds_list": [{"COL1": "val1"}]}'
          />
        </label>
        <button
          style={{ ...btnStyle, marginTop: 8, width: "100%" }}
          onClick={handleExecute}
          disabled={svcLoading || !loggedIn}
        >
          {svcLoading ? "실행 중..." : !loggedIn ? "로그인 필요" : "실행"}
        </button>
        {svcError && <p style={errStyle}>{svcError}</p>}
      </section>

      {/* ===== Result Section ===== */}
      {result && (
        <section style={sectionStyle}>
          <h2 style={h2Style}>3. 결과</h2>
          <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
            <span
              style={{
                padding: "2px 10px",
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 600,
                background: result.statusMap.ErrorCode === 0 ? "#d4edda" : "#f8d7da",
                color: result.statusMap.ErrorCode === 0 ? "#155724" : "#721c24",
              }}
            >
              {result.code}
            </span>
            <span style={{ fontSize: 13, color: "#666" }}>
              ErrorCode: {result.statusMap.ErrorCode}
            </span>
            {result.statusMap.ErrorMsg && (
              <span style={{ fontSize: 13, color: "#dc3545" }}>
                {result.statusMap.ErrorMsg}
              </span>
            )}
          </div>
          {result.path.length > 0 && (
            <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
              경로: {result.path.join(" → ")}
            </div>
          )}
          <pre style={preStyle}>{JSON.stringify(result.data, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}

// --- Styles ---
const sectionStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
  background: "#fafafa",
};
const h2Style: React.CSSProperties = { fontSize: 15, margin: "0 0 12px", color: "#333" };
const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid #ccc",
  borderRadius: 4,
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};
const btnStyle: React.CSSProperties = {
  padding: "8px 20px",
  border: "none",
  borderRadius: 4,
  background: "var(--color-primary, #0b62d6)",
  color: "#fff",
  fontSize: 14,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  color: "#555",
  marginBottom: 4,
};
const errStyle: React.CSSProperties = { color: "#dc3545", fontSize: 13, marginTop: 8 };
const preStyle: React.CSSProperties = {
  background: "#1e1e1e",
  color: "#d4d4d4",
  padding: 12,
  borderRadius: 4,
  fontSize: 12,
  overflow: "auto",
  maxHeight: 300,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
};
