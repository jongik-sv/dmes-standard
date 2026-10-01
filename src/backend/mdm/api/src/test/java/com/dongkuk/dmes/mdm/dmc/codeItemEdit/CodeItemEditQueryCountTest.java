package com.dongkuk.dmes.mdm.dmc.codeItemEdit;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeTestConfig;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemSaveRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.service.CodeItemEditService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 코드 편집 저장({@code codeItemEdit.save}) 서버 부하 가드 — 행 수에 따라 SQL 문 수(Hibernate {@code prepareStatementCount})가
 * 어떻게 느는지 본다.
 *
 * <p>운영과 같게 트랜잭션 안에서 부르고 롤백한다(OASIS {@code cactus.oasis.transactional: true}).
 *
 * <p>2026-10-01 고치기 전: 변경 8+5n, 추가 8+4n, 삭제 n=5 29·n=20 94 — 행마다 버전 조회·코드 행 전체 재조회를 했다.
 * 고친 뒤: 변경 10+3n, 추가 10+2n, 삭제 11+n+소속 연쇄(n=5 17·n=20 37).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(MasterCodeTestConfig.class)
class CodeItemEditQueryCountTest extends AbstractMdmSharedDbTest {

    static final long RV = 3L;

    @Autowired
    CodeItemEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager tm;
    @Autowired
    EntityManager em;
    @Autowired
    EntityManagerFactory emf;

    MasterCodeFixtures fx;
    JdbcTemplate jdbc;
    Statistics stats;

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        fx = new MasterCodeFixtures(jdbc);
        fx.clear();
        currentUser.set("kim", Set.of(MdmRoles.STEWARD));
        stats = emf.unwrap(SessionFactory.class).getStatistics();
        stats.setStatisticsEnabled(true);
    }

    @AfterEach
    void stopStatistics() {
        stats.clear();
        stats.setStatisticsEnabled(false);
    }

    // ── 건수에 따른 SQL 문 수 ─────────────────────────────────────────────

    @Test
    void save_SQL_문_수는_행마다_쓰기_문만_는다() {
        seedM(200);
        Map<String, Long> counts = new LinkedHashMap<>();
        for (int n : new int[] {5, 20}) {
            List<Map<String, Object>> changed = new ArrayList<>();
            List<Map<String, Object>> added = new ArrayList<>();
            List<Map<String, Object>> deleted = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                changed.add(row("CHANGED", String.format("C%04d", i), "새이름" + i, i, "G" + (i % 5)));
                added.add(row("ADDED", String.format("N%04d", i), "신규" + i, 1000 + i, "G1"));
                deleted.add(row("DELETED", String.format("C%04d", 100 + i), null, null));
            }
            counts.put("changed" + n, inTx("count-changed" + n, () -> service.save(req(), changed, List.of(), List.of())));
            counts.put("added" + n, inTx("count-added" + n, () -> service.save(req(), added, List.of(), List.of())));
            counts.put("deleted" + n, inTx("count-deleted" + n, () -> service.save(req(), deleted, List.of(), List.of())));
        }
        // 고친 뒤: 변경 10+3n(merge 확인 SELECT·닫기 UPDATE·새 구간 INSERT), 추가 10+2n(merge 확인 SELECT·INSERT),
        // 삭제 11+n+소속 연쇄(닫기 UPDATE, 그 코드의 열린 소속마다 UPDATE 1). 행마다 버전·코드 행 재조회가 없다.
        assertEquals(3 * 15, counts.get("changed20") - counts.get("changed5"), "변경: 행마다 3문");
        assertEquals(2 * 15, counts.get("added20") - counts.get("added5"), "추가: 행마다 2문");
        assertEquals(15 + 5, counts.get("deleted20") - counts.get("deleted5"), "삭제: 행마다 1문 + 소속 연쇄 5건");
        assertTrue(counts.get("changed5") <= 25 && counts.get("added5") <= 20 && counts.get("deleted5") <= 17, counts::toString);
    }

    // ── 시드 ────────────────────────────────────────────────────────────

    /** 코드 M: 1.000 RELEASED(items 건) + 1.001 DRAFT(소유자 kim, rv 3). */
    private void seedM(int items) {
        fx.seedCode("M", "시험 코드", "MDM", 2, "라벨1");
        fx.seedVersion("M", "1.000", "RELEASED", "kim", "2026-01-01 00:00:00", "9999-12-31 00:00:00", 0);
        fx.seedVersion("M", "1.001", "DRAFT", "kim", null, null, RV);
        fx.seedCate("M", "BASE", "1.000", OPEN, "전체", "REGEX", ".*", "CODE");
        fx.seedCate("M", "G1", "1.000", OPEN, "그룹1", "REGEX", "^C0.*", "CODE");
        fx.seedCate("M", "T1", "1.000", OPEN, "표", "TABLE", null, null);
        for (int i = 0; i < items; i++) {
            String code = String.format("C%04d", i);
            fx.seedItem("M", code, "1.000", OPEN, "이름" + i, null, i, "a" + i, "G" + (i % 5));
            if (i % 3 == 0) {
                fx.seedCateItem("M", "T1", code, "1.000", OPEN);
            }
        }
    }

    private static Map<String, Object> row(String status, String code, String name, Integer seq, String... lvls) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowStatus", status);
        m.put("code", code);
        if (name != null) {
            m.put("name", name);
            m.put("seq", seq);
        }
        for (int i = 0; i < lvls.length; i++) {
            m.put("lvl" + (i + 1), lvls[i]);
        }
        return m;
    }

    private static CodeItemSaveRequest req() {
        CodeItemSaveRequest r = new CodeItemSaveRequest();
        r.setMaruCodeId("M");
        r.setVer("1.001");
        r.setRowVersion(RV);
        return r;
    }

    // ── 측정·기록 ───────────────────────────────────────────────────────

    /** 운영처럼 트랜잭션 안에서 부르고, SQL 문 수를 센 뒤 롤백한다. */
    private long inTx(String name, Supplier<Object> call) {
        long[] n = new long[1];
        new TransactionTemplate(tm).executeWithoutResult(st -> {
            stats.clear();
            invoke(call);
            em.flush();
            n[0] = stats.getPrepareStatementCount();
            st.setRollbackOnly();
        });
        System.out.println("[query-count] codeItemEdit " + name + " = " + n[0]);
        return n[0];
    }

    private static Object invoke(Supplier<Object> call) {
        try {
            return call.get();
        } catch (BusinessException e) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("error", e.getErrorCode().getCode());
            m.put("message", String.valueOf(e.getMessage()));
            m.put("errors", e.getErrors().stream().map(Object::toString).toList());
            return m;
        } catch (RuntimeException e) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("error", e.getClass().getName());
            m.put("message", String.valueOf(e.getMessage()));
            return m;
        }
    }
}
