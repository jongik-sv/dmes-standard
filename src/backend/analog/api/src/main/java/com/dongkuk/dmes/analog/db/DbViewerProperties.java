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

    /** 「더보기」로 한 결과에 이어 붙일 수 있는 전체 행 수 상한(첫 화면 {@link #maxRows} 건 포함). */
    private int maxRowsAll = 30000;

    /** 「더보기」 한 번(요청 하나)에 읽는 묶음 크기. 요청이 이보다 크게 지정해도 이 값으로 줄인다. */
    private int moreChunk = 5000;

    /** 응답 하나가 담을 수 있는 행 데이터의 대략적인 바이트 상한(UTF-8). 넘기 직전 행에서 끊고 「더 있음」으로 돌려준다. */
    private int maxResponseBytes = DEFAULT_RESPONSE_BYTES;

    /** 일반 칸(VARCHAR·LONG 등) 값 하나의 표시 길이 상한(글자). 넘으면 자르고 {@code …(전체 N자)} 를 붙인다. */
    private int maxCellChars = DEFAULT_CELL_CHARS;

    public static final int DEFAULT_RESPONSE_BYTES = 8 * 1024 * 1024;
    public static final int MIN_RESPONSE_BYTES = 1024 * 1024;
    public static final int MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
    public static final int DEFAULT_CELL_CHARS = 4000;
    public static final int MIN_CELL_CHARS = 100;
    public static final int MAX_CELL_CHARS = 100_000;

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

    public int getMaxRowsAll() {
        return maxRowsAll;
    }

    public void setMaxRowsAll(int maxRowsAll) {
        this.maxRowsAll = maxRowsAll;
    }

    public int getMoreChunk() {
        return moreChunk;
    }

    public void setMoreChunk(int moreChunk) {
        this.moreChunk = moreChunk;
    }

    public int getMaxResponseBytes() {
        return maxResponseBytes;
    }

    public void setMaxResponseBytes(int maxResponseBytes) {
        this.maxResponseBytes = maxResponseBytes;
    }

    public int getMaxCellChars() {
        return maxCellChars;
    }

    public void setMaxCellChars(int maxCellChars) {
        this.maxCellChars = maxCellChars;
    }

    /**
     * 실제로 쓰는 응답 바이트 상한. 설정이 0 이하이거나 범위를 벗어나면 작은 쪽으로 맞춘다(실패 시 닫는 방향).
     */
    public int effectiveMaxResponseBytes() {
        if (maxResponseBytes <= 0) {
            return MIN_RESPONSE_BYTES;
        }
        return Math.min(MAX_RESPONSE_BYTES, Math.max(MIN_RESPONSE_BYTES, maxResponseBytes));
    }

    /** 실제로 쓰는 칸 길이 상한. 0 이하이거나 범위를 벗어나면 작은 쪽으로 맞춘다. */
    public int effectiveMaxCellChars() {
        if (maxCellChars <= 0) {
            return MIN_CELL_CHARS;
        }
        return Math.min(MAX_CELL_CHARS, Math.max(MIN_CELL_CHARS, maxCellChars));
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
