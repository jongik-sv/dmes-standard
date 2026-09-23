package com.dongkuk.dmes.mdm.common.version;

/**
 * 버전 테이블과 부모 테이블의 이름 명세(TSK-01-03 B10, D1). 공통 서비스는 이 명세로만 SQL 의 이름을 만든다.
 *
 * <p>감사 카운터 칼럼은 테이블마다 따로 둔다. 버전 테이블은 업무 버전 칼럼 {@code VER} 와 이름이 겹쳐 감사 카운터가
 * {@code AUD_VER} 이고, 부모 테이블은 규칙표 §2 그대로 {@code VER} 다(decisions D-034). 감사 카운터 두 칸만 null 을
 * 허용한다 — null 이면 그 테이블의 네이티브 쓰기에서 카운터를 올리지 않는다. 나머지는 모두 {@code ^[A-Z][A-Z0-9_]*$} 여야 한다.
 */
public record VersionTableSpec(String versionTable, String objectIdColumn, String versionColumn,
                               String parentTable, String parentObjectIdColumn,
                               String auditCounterColumn, String parentAuditCounterColumn) {
}
