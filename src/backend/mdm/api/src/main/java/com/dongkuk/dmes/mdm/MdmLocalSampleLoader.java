package com.dongkuk.dmes.mdm;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.stereotype.Component;

/**
 * 로컬 화면 확인용 샘플 데이터({@code src/backend/mdm/sample/mdm-local-sample.sql})를 빈 DB 에 한 번 넣는다.
 *
 * <p>{@code mdm.sample.path} 가 있을 때만 켜진다. 이 값은 {@code be-run.sh} 가 mdm 을 띄울 때만 넘긴다 —
 * {@code application-local.yml} 에 두지 않는 이유는 그 프로필을 쓰는 자동 테스트·E2E(직접 기동)의 빈 DB 에 샘플이 섞이면
 * 안 되기 때문이다. 운영·개발 서버 배포본에는 SQL 파일이 들어가지 않는다(리소스가 아니라 파일 경로로 읽는다).
 *
 * <p>Flyway 마이그레이션이 아니다. 버전·반복 마이그레이션은 다음 V 번호나 위치 변경 때 검증을 깨고, afterMigrate 콜백은
 * 기동마다 돌아 화면에서 지운 샘플 행을 되살린다. 그래서 Flyway 가 끝난 뒤 <b>용어 사전({@code TB_MDM_TERM})이 비어 있을 때만</b>
 * 넣는다 — 이미 쓰던 DB 는 건드리지 않는다. {@code TB_MDM_SYSTEM} 은 V2 시드가 채우므로 빈 DB 판정에 쓰지 않는다.
 * 스크립트는 한 트랜잭션으로 넣어, 중간에 실패하면 아무것도 남기지 않고 다음 기동에 다시 시도한다.
 *
 * <p>샘플 파일은 사람이 {@code sqlite3} 로 직접 넣을 수도 있게 셸 전용 줄({@code .bail on} 같은 점 명령)과
 * {@code BEGIN;}·{@code COMMIT;} 을 담고 있다. JDBC 로는 실행할 수 없으므로 {@link #jdbcScript(String)} 가 걸러 낸다.
 */
@Component
@ConditionalOnProperty(name = "mdm.sample.path")
public class MdmLocalSampleLoader implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(MdmLocalSampleLoader.class);

    private final DataSource dataSource;
    private final Path samplePath;

    public MdmLocalSampleLoader(DataSource dataSource, @Value("${mdm.sample.path}") String samplePath) {
        this.dataSource = dataSource;
        this.samplePath = Path.of(samplePath).toAbsolutePath().normalize();
    }

    @Override
    public void run(ApplicationArguments args) throws SQLException, IOException {
        loadIfEmpty();
    }

    /** 빈 DB 면 샘플을 넣고 true, 이미 데이터가 있거나 파일이 없으면 false. */
    public boolean loadIfEmpty() throws SQLException, IOException {
        if (!Files.isRegularFile(samplePath)) {
            log.warn("[mdm-sample] 샘플 파일이 없어 건너뜀: {}", samplePath);
            return false;
        }
        try (Connection c = dataSource.getConnection()) {
            if (!isEmpty(c)) {
                log.info("[mdm-sample] 용어 사전에 데이터가 있어 샘플을 넣지 않음");
                return false;
            }
            boolean autoCommit = c.getAutoCommit();
            c.setAutoCommit(false);
            try {
                String script = jdbcScript(Files.readString(samplePath, StandardCharsets.UTF_8));
                ScriptUtils.executeSqlScript(c, new EncodedResource(
                        new ByteArrayResource(script.getBytes(StandardCharsets.UTF_8), samplePath.toString()), StandardCharsets.UTF_8));
                c.commit();
            } catch (RuntimeException | SQLException e) {
                c.rollback();
                throw e;
            } finally {
                c.setAutoCommit(autoCommit);
            }
        }
        log.info("[mdm-sample] 빈 DB 에 로컬 샘플 데이터를 넣음: {}", samplePath);
        return true;
    }

    /** sqlite3 셸 전용 점 명령과 스크립트 자체의 BEGIN/COMMIT 을 뺀다 — 트랜잭션은 이 적재기가 연다. */
    static String jdbcScript(String sql) {
        return sql.lines()
                .filter(line -> {
                    String t = line.strip();
                    return !t.startsWith(".") && !t.equalsIgnoreCase("BEGIN;") && !t.equalsIgnoreCase("COMMIT;");
                })
                .collect(Collectors.joining("\n"));
    }

    private static boolean isEmpty(Connection c) throws SQLException {
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery("SELECT COUNT(*) FROM TB_MDM_TERM")) {
            rs.next();
            return rs.getLong(1) == 0;
        }
    }
}
