package com.dongkuk.dmes.mcm.db;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * mcm 앱이 주인인 Oracle 스키마 4개를 Flyway 로 마이그레이션한다 (oracle-1007 a1, 2026-10-07).
 *
 * <p>스키마 소유표(docs/oracle-1007/schema-owners.md)에서 MCMAPUSER·MCM_SOURCE·MCM_BACKUP·MCAAPUSER 의 Flyway 주인은
 * mcm-core 이고, 그 V 파일({@code classpath:db/migration/oracle/<스키마 소문자>})을 이 앱이 적용한다.
 * Spring Boot 의 {@code spring.flyway} 는 접속 하나만 지원하므로 꺼 두고, 스키마마다 Flyway 를 하나씩 만든다.
 *
 * <ul>
 *   <li>접속 사용자 = 그 스키마의 주인. V1 끝의 {@code GRANT … TO ${app_user}} 는 표 주인만 줄 수 있어, 앱 사용자(MCMAPUSER)로
 *       돌리면 ORA-01749 로 실패한다.</li>
 *   <li>{@code locations} 는 스키마 폴더 하나로 좁힌다 — 다른 스키마 폴더가 같은 이력에 섞이지 않게 한다.</li>
 *   <li>자리표시자 {@code app_user} = 앱 접속 사용자(로컬·운영 MCMAPUSER).</li>
 *   <li>이력 표는 각 스키마의 {@code flyway_schema_history} 다. 스키마(사용자)는 PDB 도구·DBA 가 미리 만든다(만들지 않는다).</li>
 * </ul>
 *
 * <p>운영(WildFly)은 이 마이그레이션을 끄고 DBA 가 같은 V 파일을 적용한다. 시험은 {@link #migrate} 를 직접 부른다.
 */
public final class McmSchemaMigrator {

    private static final Logger log = LoggerFactory.getLogger(McmSchemaMigrator.class);

    /** 적용 순서. 서로의 표를 참조하지 않으므로 순서는 의미가 없지만 로그를 읽기 쉽게 고정한다. */
    public static final List<String> SCHEMAS = List.of("MCMAPUSER", "MCM_SOURCE", "MCM_BACKUP", "MCAAPUSER");

    /** 앱 접속 사용자 기본값(자리표시자 app_user). */
    public static final String DEFAULT_APP_USER = "MCMAPUSER";

    private McmSchemaMigrator() {
    }

    /** 스키마 폴더 위치 — mcm-core {@code src/main/resources/db/migration/oracle/<스키마 소문자>}. */
    public static String location(String schema) {
        return "classpath:db/migration/oracle/" + schema.toLowerCase(Locale.ROOT);
    }

    /**
     * 네 스키마를 차례로 마이그레이션한다. 각 스키마는 같은 이름의 사용자(주인)로 접속한다.
     *
     * @param url      JDBC URL(PDB 서비스) — 예: {@code jdbc:oracle:thin:@//localhost:1521/L_ORA_MCM_APP}
     * @param password 스키마 주인 비밀번호(로컬은 모든 사용자가 같다)
     * @param appUser  자리표시자 app_user 값(앱 접속 사용자)
     * @return 스키마별로 이번에 적용한 마이그레이션 수
     */
    public static Map<String, Integer> migrate(String url, String password, String appUser) {
        Map<String, Integer> applied = new LinkedHashMap<>();
        for (String schema : SCHEMAS) {
            applied.put(schema, migrate(url, schema, password, appUser));
        }
        return applied;
    }

    /** 스키마 하나를 그 주인으로 접속해 마이그레이션한다. */
    public static int migrate(String url, String schema, String password, String appUser) {
        Flyway flyway = Flyway.configure()
                .dataSource(url, schema, password)
                .schemas(schema)
                .defaultSchema(schema)
                .createSchemas(false)
                .locations(location(schema))
                .placeholders(Map.of("app_user", appUser))
                .load();
        MigrateResult result = flyway.migrate();
        log.info("[McmSchemaMigrator] {} — 적용 {}건, 현재 버전 {}", schema, result.migrationsExecuted, result.targetSchemaVersion);
        return result.migrationsExecuted;
    }
}
