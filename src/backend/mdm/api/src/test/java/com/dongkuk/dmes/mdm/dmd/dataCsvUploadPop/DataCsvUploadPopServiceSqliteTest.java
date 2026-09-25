package com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop;

import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.T0;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.count;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertItemRow;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertMdm;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.itemRows;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.text;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.dto.DataCsvRow;
import com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.dto.DataCsvSaveRequest;
import com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.dto.DataCsvSaveResult;
import com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.dto.DataCsvValidateRequest;
import com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.dto.DataCsvValidateResult;
import com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.service.DataCsvUploadPopService;
import com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.service.Rfc4180Csv;
import com.dongkuk.oasis.audit.AuditHolder;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-07-04 design.md B2 — {@code dataCsvUploadPop} 화면 경로(검사 1~7 은 {@code DataItemChecksSqliteTest} 와 같은
 * {@link com.dongkuk.dmes.mdm.common.segment.DataItemSaveCore} 를 돈다, I1). I2·I3·I4·I7 대상 테스트.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class DataCsvUploadPopServiceSqliteTest extends AbstractMdmSharedDbTest {

    private static final String MD = "PORT";

    @Autowired
    DataCsvUploadPopService service;
    @Autowired
    MutableClock clock;
    @Autowired
    DataSource dataSource;

    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        DmdSegmentTestSupport.clear(jdbc);
        insertMdm(jdbc, MD, 1, "구분"); // lvlCnt=1, attr01 라벨 "구분"(그 밖은 라벨 없음)
        clock.setLocal(T0);
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @AfterEach
    void clearThreadLocals() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    /** 20 고정 컬럼 수만큼 뒤를 빈 칸으로 채운 데이터 행(콤마 수 실수를 막으려고 손으로 세지 않는다). */
    private static String dataLine(String... firstFields) {
        List<String> fields = new ArrayList<>(List.of(firstFields));
        while (fields.size() < Rfc4180Csv.HEADER.size()) {
            fields.add("");
        }
        return String.join(",", fields);
    }

    private static String header() {
        return String.join(",", Rfc4180Csv.HEADER);
    }

    private static String csv(String... dataLines) {
        StringBuilder sb = new StringBuilder(header());
        for (String line : dataLines) {
            sb.append("\r\n").append(line);
        }
        return sb.toString();
    }

    // ── validate ────────────────────────────────────────────────────────────

    @Test
    void 오류_없는_CSV_는_검증에서_행별_동작이_입력_순서와_1대1이다() {
        String text = csv(dataLine("KR", "대한민국"), dataLine("US", "미국"));
        DataCsvValidateResult result = service.validate(new Request(MD, text).toValidate());

        assertEquals(0, result.errorCount());
        assertEquals(2, result.insertCount());
        assertEquals(0, result.updateCount());
        assertEquals(0, result.noneCount());
        assertEquals(2, result.rows().size());
        assertEquals(2, result.rows().get(0).lineNo());
        assertEquals("KR", result.rows().get(0).code());
        assertEquals("INSERT", result.rows().get(0).action());
        assertEquals(3, result.rows().get(1).lineNo());
        assertEquals("US", result.rows().get(1).code());
        assertEquals("INSERT", result.rows().get(1).action());
        assertEquals(0, count(jdbc, "TB_MDM_DATA_ITEM")); // dryRun — 아무 것도 쓰지 않는다
    }

    @Test
    void 오류_있는_CSV_는_검증에서_errorCount_가_0보다_크고_아무_것도_쓰지_않는다() {
        String text = csv(dataLine("KR", "대한민국"), "KR,이름없이,,,,"); // 2번째 행: 20열 미만(파서 오류)
        DataCsvValidateResult result = service.validate(new Request(MD, text).toValidate());

        assertTrue(result.errorCount() > 0);
        assertEquals(0, count(jdbc, "TB_MDM_DATA_ITEM"));

        DataCsvRow bad = result.rows().stream().filter(r -> r.lineNo() == 3).findFirst().orElseThrow();
        assertEquals("-", bad.action());
        assertFalse(bad.issues().isEmpty());
    }

    /** I1 — 20열은 맞지만(파서 오류 아님) 이름이 빈 행은 CSV 전용 검증이 아니라 DataItemChecks(검사 4)가 잡는다. */
    @Test
    void 이름_없는_행은_열은_맞아도_검사4로_오류다() {
        String text = csv(dataLine("XY", ""));
        DataCsvValidateResult result = service.validate(new Request(MD, text).toValidate());

        assertEquals(1, result.errorCount());
        DataCsvRow row = result.rows().get(0);
        assertEquals(2, row.lineNo());
        assertTrue(row.issues().stream().anyMatch(m -> m.contains("이름")));
    }

    // ── save ────────────────────────────────────────────────────────────────

    @Test
    void 오류_0건_CSV_저장은_한_저장_시각으로_행_수만큼_반영된다() {
        String text = csv(dataLine("KR", "대한민국"), dataLine("US", "미국"));
        DataCsvSaveResult result = service.save(new Request(MD, text).toSave());

        assertEquals(2, result.insertCount());
        assertEquals(0, result.updateCount());
        assertEquals(0, result.noneCount());
        assertEquals(text(T0), result.at());
        assertEquals(2, count(jdbc, "TB_MDM_DATA_ITEM"));
    }

    @Test
    void 오류_있는_CSV_저장_시도는_전부_미저장이다() {
        String text = csv(dataLine("KR", "대한민국"), "KR,이름없이,,,,"); // 파서 오류 행 포함
        assertThrows(BusinessException.class, () -> service.save(new Request(MD, text).toSave()));
        assertEquals(0, count(jdbc, "TB_MDM_DATA_ITEM"));
    }

    /** I2 — 파서 오류가 아니라 검사 4(이름 필수) 이슈여도 저장은 전부 거부된다. */
    @Test
    void 검사_이슈가_있는_CSV_저장_시도도_전부_미저장이다() {
        String text = csv(dataLine("KR", "대한민국"), dataLine("XY", ""));
        assertThrows(BusinessException.class, () -> service.save(new Request(MD, text).toSave()));
        assertEquals(0, count(jdbc, "TB_MDM_DATA_ITEM"));
    }

    @Test
    void 같은_파일_재업로드는_전부_NONE_이고_새_선분이_없다() {
        String text = csv(dataLine("KR", "대한민국"), dataLine("US", "미국"));
        service.save(new Request(MD, text).toSave());
        int rowsAfterFirst = count(jdbc, "TB_MDM_DATA_ITEM");

        DataCsvSaveResult second = service.save(new Request(MD, text).toSave());

        assertEquals(0, second.insertCount());
        assertEquals(0, second.updateCount());
        assertEquals(2, second.noneCount());
        assertEquals(rowsAfterFirst, count(jdbc, "TB_MDM_DATA_ITEM")); // 새 선분 없음
    }

    @Test
    void 값_하나만_바꿔_재업로드하면_그_키만_새_선분이_생긴다() {
        String text = csv(dataLine("KR", "대한민국"), dataLine("US", "미국"));
        service.save(new Request(MD, text).toSave());
        assertEquals(1, itemRows(jdbc, MD, "KR").size());
        assertEquals(1, itemRows(jdbc, MD, "US").size());

        clock.setLocal(T0.plusDays(1));
        String changed = csv(dataLine("KR", "대한민국(개정)"), dataLine("US", "미국"));
        DataCsvSaveResult second = service.save(new Request(MD, changed).toSave());

        assertEquals(0, second.insertCount());
        assertEquals(1, second.updateCount());
        assertEquals(1, second.noneCount());
        assertEquals(2, itemRows(jdbc, MD, "KR").size()); // KR 만 새 선분
        assertEquals(1, itemRows(jdbc, MD, "US").size());
    }

    @Test
    void 닫힌_키가_든_CSV_는_거부되고_close_액션은_생기지_않는다() {
        insertItemRow(jdbc, MD, "OLD", "옛 항목", T0.minusDays(10), "2026-08-01 00:00:00", 0, null, null);
        String text = csv(dataLine("OLD", "옛 항목 갱신"));

        DataCsvValidateResult result = service.validate(new Request(MD, text).toValidate());
        assertEquals(1, result.errorCount());
        assertEquals("NONE", result.rows().get(0).action());

        assertThrows(BusinessException.class, () -> service.save(new Request(MD, text).toSave()));
        assertEquals(1, itemRows(jdbc, MD, "OLD").size()); // 닫힌 행 그대로, 새 행 없음
        assertEquals("2026-08-01 00:00:00", itemRows(jdbc, MD, "OLD").get(0).get("VALID_TO")); // 여전히 닫힘
    }

    /** 요청 DTO 조립(테스트 편의). */
    private record Request(String maruDataId, String csvText) {
        DataCsvValidateRequest toValidate() {
            DataCsvValidateRequest r = new DataCsvValidateRequest();
            r.setMaruDataId(maruDataId);
            r.setCsvText(csvText);
            return r;
        }

        DataCsvSaveRequest toSave() {
            DataCsvSaveRequest r = new DataCsvSaveRequest();
            r.setMaruDataId(maruDataId);
            r.setCsvText(csvText);
            return r;
        }
    }
}
