package com.dongkuk.dmes.mdm.dmc.codeCateEdit;

import static com.dongkuk.dmes.mdm.dmc.codeCateEdit.CodeCateEditRequests.memberRow;
import static com.dongkuk.dmes.mdm.dmc.codeCateEdit.CodeCateEditRequests.save;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeTestConfig;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.service.CodeCateEditService;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-06-04 design.md §4 수용 기준 4·§5 불변 규칙 17(저장 쪽) — {@code TermRecommendPerformanceTest} 패턴대로(워밍업 1회 후
 * 중앙값 측정) JDBC 배치로 {@code TB_MDM_CODE_ITEM} 1,000행을 직접 시딩한 뒤(서비스 {@code save} 경로를 타지 않는 시딩과
 * 측정 대상을 구분), {@link CodeCateEditService#save} 전체(프로젝션+검사+세그먼트 쓰기 포함, OASIS 봉투·HTTP 왕복만 제외)
 * 호출 시간을 측정한다. 예산 800ms(이동 200ms 은 FE {@code transfer.test.ts} 몫).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(MasterCodeTestConfig.class)
class CodeCateEditPerformanceSqliteTest extends AbstractMdmSharedDbTest {

    private static final int CODE_COUNT = 1_000;
    private static final long MAX_MEDIAN_MS = 800L;

    @Autowired
    CodeCateEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    DataSource dataSource;

    private Set<String> allCodes;

    @BeforeEach
    void seedThousandCodes() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        MasterCodeFixtures fx = new MasterCodeFixtures(jdbc);
        fx.clear();
        currentUser.set("kim", Set.of(MdmRoles.STEWARD));
        fx.seedCode("M", "성능 코드", "MDM", 0);
        fx.seedVersion("M", "1.000", "RELEASED", "kim", "2026-01-01 00:00:00", MasterCodeFixtures.OPEN_END, 0);
        fx.seedVersion("M", "1.001", "DRAFT", "kim", null, null, 0);
        fx.seedCate("M", "T1", "1.000", MasterCodeFixtures.OPEN, "성능 표", "TABLE", null, null);

        List<String> codes = new ArrayList<>(CODE_COUNT);
        for (int i = 0; i < CODE_COUNT; i++) {
            codes.add("P" + i);
        }
        allCodes = new LinkedHashSet<>(codes);

        jdbc.execute("PRAGMA synchronous=OFF"); // 성능 시험 전용 대량 insert 가속(테스트 DB 한정)
        jdbc.batchUpdate(
                "INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER, TO_VER, SEQ, VER) "
                        + "VALUES ('M', ?, '1.000', '9999', ?, 0)",
                new BatchPreparedStatementSetter() {
                    @Override
                    public void setValues(PreparedStatement ps, int i) throws SQLException {
                        ps.setString(1, codes.get(i));
                        ps.setInt(2, i);
                    }

                    @Override
                    public int getBatchSize() {
                        return CODE_COUNT;
                    }
                });
    }

    @Test
    void AC4_1000건_소속_이동_저장은_중앙값이_800ms_미만이다() {
        // 워밍업 1회 — 전량 추가.
        Map<String, Object> warm = service.save(save("M", "1.001", 0L), List.of(), addRows(allCodes));
        long rowVersion = ((Number) warm.get("rowVersion")).longValue();

        int trials = 5;
        long[] samplesMs = new long[trials];
        for (int i = 0; i < trials; i++) {
            boolean removing = i % 2 == 0;
            List<Map<String, Object>> members = removing ? removeRows(allCodes) : addRows(allCodes);

            long start = System.nanoTime();
            Map<String, Object> r = service.save(save("M", "1.001", rowVersion), List.of(), members);
            samplesMs[i] = (System.nanoTime() - start) / 1_000_000;

            rowVersion = ((Number) r.get("rowVersion")).longValue();
        }
        Arrays.sort(samplesMs);
        long median = samplesMs[trials / 2];
        assertTrue(median < MAX_MEDIAN_MS,
                "중앙값=" + median + "ms (기준 " + MAX_MEDIAN_MS + "ms 미만), 전체=" + Arrays.toString(samplesMs));
    }

    private static List<Map<String, Object>> addRows(Set<String> codes) {
        return codes.stream().map(c -> memberRow("ADDED", "T1", c)).toList();
    }

    private static List<Map<String, Object>> removeRows(Set<String> codes) {
        return codes.stream().map(c -> memberRow("DELETED", "T1", c)).toList();
    }
}
