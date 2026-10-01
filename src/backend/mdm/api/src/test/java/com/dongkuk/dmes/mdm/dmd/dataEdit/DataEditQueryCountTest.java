package com.dongkuk.dmes.mdm.dmd.dataEdit;

import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.OPEN;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.T0;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dmd.dataEdit.dto.DataEditViewRequest;
import com.dongkuk.dmes.mdm.dmd.dataEdit.service.DataEditService;
import jakarta.persistence.EntityManagerFactory;
import java.time.LocalDateTime;
import java.util.List;
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
 * 마루 데이터 편집 보기({@code dataEdit.view}) 서버 부하 가드 — 카테고리 요약 카드가 내는 SQL 문 수(Hibernate
 * {@code prepareStatementCount})가 REGEX 카테고리 수에 따라 늘지 않는지 본다.
 *
 * <p>2026-10-01 고치기 전: 4+r(r = 열린 REGEX 카테고리 수, BASE 포함) — 카테고리마다 키별 마지막 항목 행을 다시 읽었다.
 * 고친 뒤: 5 고정.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class DataEditQueryCountTest extends AbstractMdmSharedDbTest {

    static final LocalDateTime FROM = T0.minusDays(10);

    @Autowired
    DataEditService service;
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
        stats = emf.unwrap(SessionFactory.class).getStatistics();
        stats.setStatisticsEnabled(true);
    }

    @AfterEach
    void tearDown() {
        stats.clear();
        stats.setStatisticsEnabled(false);
    }

    @Test
    void view_SQL_문_수는_REGEX_카테고리_수와_무관하다() {
        long[] counts = new long[2];
        int[] sizes = {1, 4};
        for (int k = 0; k < sizes.length; k++) {
            DmdSegmentTestSupport.clear(jdbc);
            seed(sizes[k]);
            stats.clear();
            service.view(request());
            counts[k] = stats.getPrepareStatementCount();
            System.out.println("[query-count] dataEdit view regexCates=" + sizes[k] + " = " + counts[k]);
        }
        // 고친 뒤: 5(마루 데이터·카테고리·TABLE 소속 1·항목 행 1·열린 항목 수) — REGEX 카테고리 수와 무관.
        assertEquals(counts[0], counts[1], "view 는 REGEX 카테고리 수와 무관");
        assertTrue(counts[1] <= 5, "view = " + counts[1]);
    }

    private void seed(int regexCates) {
        DmdSegmentTestSupport.insertMdm(jdbc, "MD1", 2);
        DmdSegmentTestSupport.insertCateRow(jdbc, "MD1", "BASE", "REGEX", ".*", "KEY", FROM, OPEN);
        for (int i = 0; i < 200; i++) {
            DmdSegmentTestSupport.insertItemRow(jdbc, "MD1", String.format("I%04d", i), "이름" + i, FROM, OPEN, 0,
                    List.of("G" + (i % 5)), List.of());
        }
        for (int c = 0; c < regexCates; c++) {
            DmdSegmentTestSupport.insertCateRow(jdbc, "MD1", "R" + c, "REGEX", "^I00.*", "KEY", FROM, OPEN);
        }
        DmdSegmentTestSupport.insertCateRow(jdbc, "MD1", "T0", "TABLE", null, null, FROM, OPEN);
        for (int i = 0; i < 10; i++) {
            DmdSegmentTestSupport.insertMemberRow(jdbc, "MD1", "T0", String.format("I%04d", i), FROM, OPEN);
        }
    }

    private static DataEditViewRequest request() {
        DataEditViewRequest r = new DataEditViewRequest();
        r.setMaruDataId("MD1");
        return r;
    }
}
