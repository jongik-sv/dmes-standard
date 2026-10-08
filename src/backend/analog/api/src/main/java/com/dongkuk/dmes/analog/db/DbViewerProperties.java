package com.dongkuk.dmes.analog.db;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * DB 뷰어 설정 (ADR-0002 D2·D4).
 *
 * <p>DB 미설정({@code analog.db.url} 없음) 시 analog 기동은 정상이며,
 * DB 뷰어 API는 503 + 안내를 반환한다 (D5).
 */
@ConfigurationProperties(prefix = "analog.db")
public class DbViewerProperties {

    /** 허용 스키마 — 초기값 MCM 4개 + MDM. 추가는 DBA SELECT grant 확인 + ADR 개정으로만 한다. */
    private List<String> allowedSchemas = List.of(
            "MCMAPUSER", "MCM_SOURCE", "MCM_BACKUP", "MCAAPUSER", "MDMAPUSER");

    /**
     * 코드에 박힌 차단 표 — 자격증명·감사·대화 기록 표. 설정으로 줄일 수 없다.
     * 모든 허용 스키마에서 표 이름만 비교한다.
     */
    public static final List<String> BUILT_IN_DENIED_TABLES = List.of(
            "TB_SEC_KEY_STORE", "TB_SEC_AUDIT_LOG",
            "TB_MCM_SEC_USER_WIDGET_CHAT", "TB_MCM_SEC_USER_WIDGET_MEMO");

    /** 추가 차단 표 — {@link #BUILT_IN_DENIED_TABLES} 에 더해진다(합집합). 기본값은 비어 있다. */
    private List<String> deniedTables = List.of();

    /** 최대 반환 건수 — 요청값은 이 상한으로 clamp 한다. */
    private int maxRows = 200;

    /** 쿼리 타임아웃(초). */
    private int queryTimeoutSeconds = 10;

    /** 읽기전용 DB 접속 — 모두 env override 가능. 미설정 시 뷰어 비활성. */
    private String url;
    private String username;
    private String password;

    public List<String> getAllowedSchemas() {
        return allowedSchemas;
    }

    public void setAllowedSchemas(List<String> allowedSchemas) {
        this.allowedSchemas = allowedSchemas;
    }

    public List<String> getDeniedTables() {
        return deniedTables;
    }

    public void setDeniedTables(List<String> deniedTables) {
        this.deniedTables = deniedTables == null ? List.of() : deniedTables;
    }

    public int getMaxRows() {
        return maxRows;
    }

    public void setMaxRows(int maxRows) {
        this.maxRows = maxRows;
    }

    public int getQueryTimeoutSeconds() {
        return queryTimeoutSeconds;
    }

    public void setQueryTimeoutSeconds(int queryTimeoutSeconds) {
        this.queryTimeoutSeconds = queryTimeoutSeconds;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }
}
