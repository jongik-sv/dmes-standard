package com.dongkuk.dmes.mdm.common.version;

/**
 * 버전 테이블과 부모 테이블의 이름 명세(TSK-01-03 B10, D1). 공통 서비스는 이 명세로만 SQL 의 이름을 만든다.
 *
 * <p>{@code auditCounterColumn} 만 null 을 허용한다 — null 이면 네이티브 쓰기에서 감사 카운터를 올리지 않는다(D2:
 * 감사 VER 와 업무 VER 의 이름 충돌 F25 가 풀릴 때까지의 잠정값). 나머지는 모두 {@code ^[A-Z][A-Z0-9_]*$} 여야 한다.
 */
public record VersionTableSpec(String versionTable, String objectIdColumn, String versionColumn,
                               String parentTable, String parentObjectIdColumn, String auditCounterColumn) {
}
