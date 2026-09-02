package com.dongkuk.dmes.mcm.config;

import org.hibernate.community.dialect.SQLiteDialect;

/**
 * SQLite 의 {@code CREATE TABLE} 에 {@code IF NOT EXISTS} 자동 부착하는 dialect.
 *
 * <p>v4 §결정 #19 — caravan EMF (caravan-hub 호스트) + cactus secondary EMF (mcm 호스트) 가 동일 테이블
 * ({@code TB_MCM_MOM_KAFKA_TOPICS}) 매핑하는 패턴에서 mcm 부팅 시 Hibernate 의 schema migration 이
 * 이미 존재하는 테이블에 {@code CREATE TABLE} 던져 {@code SQLITE_ERROR: already exists} WARN 발생.
 *
 * <p>본 dialect 는 {@link #getCreateTableString()} 만 override 해서 {@code "create table if not exists"}
 * 반환. SQLite 가 IF NOT EXISTS 표준 지원하므로 이미 있는 테이블은 silent skip. 운영(MSSQL) 환경은
 * 본 dialect 사용 안 함 — 영향 0.
 *
 * <p>2026-05-13 신설.
 */
public class CactusSqliteIfNotExistsDialect extends SQLiteDialect {

    @Override
    public String getCreateTableString() {
        return "create table if not exists";
    }
}
