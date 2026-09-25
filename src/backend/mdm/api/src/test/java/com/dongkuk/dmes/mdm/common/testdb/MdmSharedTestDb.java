package com.dongkuk.dmes.mdm.common.testdb;

import com.dongkuk.dmes.mdm.dma.termMng.TermRecommendationCache;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationContext;

/**
 * {@link AbstractMdmSharedDbTest} 가 쓰는 JVM 수명의 SQLite 테스트 DB 한 벌.
 *
 * <p>{@code @TempDir} 를 쓰지 않는다 — JUnit 이 첫 클래스가 끝날 때 지우면 캐시된 컨텍스트가 지워진 파일을 가리킨다.
 * 대신 {@link Files#createTempFile} + {@code deleteOnExit} 로 JVM 이 끝날 때 지운다.
 */
public final class MdmSharedTestDb {

    private static final Logger log = LoggerFactory.getLogger(MdmSharedTestDb.class);

    private static Path file;
    /** 어떤 테스트 클래스가 이 DB 를 한 번이라도 썼는가. false 면 방금 만든 파일에 컨텍스트가 막 마이그레이션한 상태다. */
    private static boolean used;

    private MdmSharedTestDb() {
    }

    static synchronized String url() {
        if (file == null) {
            try {
                file = Files.createTempFile("mdm-shared-test-", ".db");
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
            file.toFile().deleteOnExit();
        }
        return "jdbc:sqlite:" + file;
    }

    /**
     * 테스트 클래스 시작 시 DB 와 테스트 가짜 빈을 "새 컨텍스트를 막 띄운 상태" 로 되돌린다.
     *
     * <ul>
     *   <li>DB: 뷰·트리거·테이블(Flyway 이력 포함)을 모두 지우고 컨텍스트의 Flyway 로 다시 migrate 한다. 스키마·시드·
     *       AUTOINCREMENT 가 새 파일과 같아진다(앞 클래스가 만든 트리거·행도 사라진다). 방금 만든 파일의 첫 사용이면
     *       이미 그 상태라 건너뛴다. Flyway {@code clean()} 은 이 SQLite 에서 아무것도 지우지 않아(실측) 직접 지운다.</li>
     *   <li>{@link SharedContextResettable} 빈(테스트 가짜 사용자·시계·명부 등): 생성 직후 값으로.</li>
     *   <li>{@link TermRecommendationCache}: 부팅 때({@code ApplicationReadyEvent}) 하던 전체 적재를 다시 한다.</li>
     * </ul>
     */
    static synchronized void resetForTestClass(ApplicationContext context) {
        if (!used) {
            used = true;
            return;
        }
        long start = System.nanoTime();
        dropAll(context.getBean(DataSource.class));
        context.getBean(Flyway.class).migrate();
        context.getBeansOfType(SharedContextResettable.class).values().forEach(SharedContextResettable::resetForTestClass);
        context.getBeanProvider(TermRecommendationCache.class).ifAvailable(TermRecommendationCache::reloadAll);
        log.info("[MdmSharedTestDb] 공유 테스트 DB 초기화 {}ms", (System.nanoTime() - start) / 1_000_000);
    }

    /** 한 연결에서 외래키 강제를 끄고(풀 연결은 켜져 있다) 뷰 → 트리거 → 테이블 순으로 지운 뒤 다시 켠다. */
    private static void dropAll(DataSource dataSource) {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("PRAGMA foreign_keys = OFF");
            try {
                List<String> drops = new ArrayList<>();
                try (ResultSet rs = statement.executeQuery(
                        "SELECT type, name FROM sqlite_master WHERE type IN ('view', 'trigger', 'table')"
                                + " AND name NOT LIKE 'sqlite_%'"
                                + " ORDER BY CASE type WHEN 'view' THEN 0 WHEN 'trigger' THEN 1 ELSE 2 END")) {
                    while (rs.next()) {
                        drops.add("DROP " + rs.getString(1).toUpperCase() + " IF EXISTS \"" + rs.getString(2) + "\"");
                    }
                }
                for (String drop : drops) {
                    statement.execute(drop);
                }
            } finally {
                statement.execute("PRAGMA foreign_keys = ON");
            }
        } catch (SQLException e) {
            throw new IllegalStateException("공유 테스트 DB 초기화 실패", e);
        }
    }
}
