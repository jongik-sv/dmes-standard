package com.dongkuk.dmes.mdm.dmd.dataCateEdit;

import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.OPEN;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.T0;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateSaveRequest;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateSearchRequest;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateViewRequest;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.service.DataCateEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import jakarta.persistence.EntityManagerFactory;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

/**
 * 카테고리 편집 서버 부하 가드 — TABLE 소속 일괄 저장({@code save})과 목록·상세({@code search}·{@code view})가 내는 SQL 문 수
 * (Hibernate {@code prepareStatementCount})를 센다. 서비스가 자기 트랜잭션을 열므로 트랜잭션 밖에서 부른다.
 *
 * <p>2026-10-01 고치기 전: save(TABLE 소속 추가 n) 5+6n — 소속마다 잠금(UPDATE+SELECT)·소속 행·항목 행·카테고리 행 조회.
 * search 4+r·REGEX view 3(r = 열린 REGEX 카테고리 수, BASE 포함) — REGEX 카테고리마다 키별 마지막 항목 행을 다시 읽었다.
 * 고친 뒤: save 추가 10+n·해제 8+n(해제는 예전 5+5n), search 4·REGEX view 2.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class DataCateEditQueryCountTest extends AbstractMdmSharedDbTest {

    static final LocalDateTime FROM = T0.minusDays(10);

    @Autowired
    DataCateEditService service;
    @Autowired
    DataSource dataSource;
    @Autowired
    EntityManagerFactory emf;

    JdbcTemplate jdbc;
    Statistics stats;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        DmdSegmentTestSupport.clear(jdbc);
        AuditHolder.remove();
        UserContextHolder.clear();
        stats = emf.unwrap(SessionFactory.class).getStatistics();
        stats.setStatisticsEnabled(true);
    }

    @AfterEach
    void tearDown() {
        stats.clear();
        stats.setStatisticsEnabled(false);
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    // ── 건수에 따른 SQL 문 수 ─────────────────────────────────────────────

    @Test
    void save_TABLE_소속_SQL_문_수는_소속마다_INSERT_만_는다() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (int n : new int[] {5, 20}) {
            DmdSegmentTestSupport.clear(jdbc);
            seedVolume(200, 0);
            List<Map<String, Object>> add = new ArrayList<>();
            List<Map<String, Object>> remove = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                add.add(code(String.format("I%04d", 100 + i)));
                remove.add(code(String.format("I%04d", i)));
            }
            counts.put("add" + n, count("count-add" + n, () -> service.save(save("T0"), add, List.of())));
            counts.put("remove" + n, count("count-remove" + n, () -> service.save(save("T0"), List.of(), remove)));
        }
        // 고친 뒤: 추가 10+n, 해제 8+n — 잠금·소속 행·항목 행·카테고리 행은 한 번이고 소속마다 INSERT(또는 UPDATE) 1문만 는다.
        assertEquals(15, counts.get("add20") - counts.get("add5"), "추가: 소속마다 INSERT 1문");
        assertEquals(15, counts.get("remove20") - counts.get("remove5"), "해제: 소속마다 UPDATE 1문");
        assertTrue(counts.get("add5") <= 15 && counts.get("remove5") <= 13, counts::toString);
    }

    @Test
    void search_view_SQL_문_수는_REGEX_카테고리_수와_무관하다() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (int rc : new int[] {1, 4}) {
            DmdSegmentTestSupport.clear(jdbc);
            seedVolume(200, rc);
            CateSearchRequest s = new CateSearchRequest();
            s.setMaruDataId("MD1");
            counts.put("search" + rc, count("count-search" + rc, () -> service.search(s)));
            counts.put("viewRegex" + rc, count("count-view-regex" + rc, () -> service.view(view("R0"))));
            counts.put("viewTable" + rc, count("count-view-table" + rc, () -> service.view(view("T0"))));
        }
        // 고친 뒤: search 4·REGEX view 2·TABLE view 4 — REGEX 카테고리 수와 무관(항목 행은 요청마다 한 번).
        assertEquals(counts.get("search1"), counts.get("search4"), "search 는 REGEX 카테고리 수와 무관");
        assertEquals(counts.get("viewRegex1"), counts.get("viewRegex4"));
        assertTrue(counts.get("search4") <= 4 && counts.get("viewRegex4") <= 2 && counts.get("viewTable4") <= 4,
                counts::toString);
    }

    /** IN 목록이 {@code IN_CHUNK}(500)를 넘으면 나눠 읽는다 — 600건은 두 묶음이라 소속·항목 읽기가 1문씩 는다. */
    @Test
    void save_TABLE_소속_600건은_IN_을_나눠_읽고_모두_쓴다() {
        seedVolume(700, 0);
        List<Map<String, Object>> add = new ArrayList<>();
        for (int i = 0; i < 600; i++) {
            add.add(code(String.format("I%04d", 100 + i)));
        }
        long n = count("count-add600", () -> service.save(save("T0"), add, List.of()));
        assertEquals(30 + 600, (int) jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DATA_CATE_ITEM WHERE MARU_DATA_ID = 'MD1' "
                + "AND CATE_ID = 'T0' AND VALID_TO = ?", Integer.class, DmdSegmentTestSupport.ts(OPEN)));
        assertEquals(10 + 600 + 2, n, "두 번째 IN 묶음 — 소속 행·항목 행 SELECT 1문씩");
    }

    // ── 시드 ────────────────────────────────────────────────────────────

    /** 건수 측정용 — items 개 열린 항목, REGEX regexCates 개(+BASE), TABLE T0(앞 30개 소속). */
    private void seedVolume(int items, int regexCates) {
        DmdSegmentTestSupport.insertMdm(jdbc, "MD1", 2);
        DmdSegmentTestSupport.insertCateRow(jdbc, "MD1", "BASE", "REGEX", ".*", "KEY", FROM, OPEN);
        for (int i = 0; i < items; i++) {
            DmdSegmentTestSupport.insertItemRow(jdbc, "MD1", String.format("I%04d", i), "이름" + i, FROM, OPEN, 0,
                    List.of("G" + (i % 5)), List.of());
        }
        for (int c = 0; c < regexCates; c++) {
            DmdSegmentTestSupport.insertCateRow(jdbc, "MD1", "R" + c, "REGEX", "^I00.*", "KEY", FROM, OPEN);
        }
        DmdSegmentTestSupport.insertCateRow(jdbc, "MD1", "T0", "TABLE", null, null, FROM, OPEN);
        for (int i = 0; i < 30; i++) {
            DmdSegmentTestSupport.insertMemberRow(jdbc, "MD1", "T0", String.format("I%04d", i), FROM, OPEN);
        }
    }

    private static CateSaveRequest save(String cateId) {
        CateSaveRequest r = new CateSaveRequest();
        r.setMaruDataId("MD1");
        r.setCateId(cateId);
        return r;
    }

    private static CateViewRequest view(String cateId) {
        CateViewRequest r = new CateViewRequest();
        r.setMaruDataId("MD1");
        r.setCateId(cateId);
        return r;
    }

    private static Map<String, Object> code(String code) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", code);
        return m;
    }

    // ── 측정·기록 ───────────────────────────────────────────────────────

    private long count(String name, Supplier<Object> call) {
        stats.clear();
        invoke(call);
        long n = stats.getPrepareStatementCount();
        System.out.println("[query-count] dataCateEdit " + name + " = " + n);
        return n;
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
