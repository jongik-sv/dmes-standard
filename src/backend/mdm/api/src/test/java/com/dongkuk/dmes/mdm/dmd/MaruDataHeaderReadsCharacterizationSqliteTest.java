package com.dongkuk.dmes.mdm.dmd;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.segment.DataSegmentLock;
import com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport;
import com.dongkuk.dmes.mdm.common.segment.LockedMaruData;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateSearchRequest;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateSearchResult;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.service.DataCateEditService;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.AttrLabel;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemHeader;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.service.DataItemListQuery;
import com.dongkuk.oasis.audit.AuditHolder;
import java.util.Arrays;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * BE 리팩토링 2회차 C7 특성 시험 — {@code TB_MDM_DATA} 머리를 읽는 세 곳(잠금 뒤 재조회·항목 관리 머리·카테고리 편집 조회)의 출력을
 * 고정한다. 라벨을 다듬는 방식이 셋 다 다르다.
 *
 * <ul>
 *   <li>{@code DataSegmentLock.lock} — trim 뒤 비면 null. 10개 그대로.</li>
 *   <li>{@code DataItemListQuery.header} — {@code isBlank()} 인 라벨은 빼고 나머지는 trim. 라벨이 있는 번호만 {@code attrNN} 으로.</li>
 *   <li>{@code DataCateEditService.search} — DB 값 그대로 10개.</li>
 * </ul>
 *
 * <p>U+3000(전각 공백)은 {@code isBlank()} 로는 공백이지만 {@code trim()} 은 자르지 않는다. 그래서 항목 관리만 그 라벨을 뺀다.
 * Oracle 은 빈 문자열을 NULL 로 저장하므로 빈 문자열 대신 공백으로 픽스처를 만든다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class MaruDataHeaderReadsCharacterizationSqliteTest extends AbstractMdmSharedDbTest {

    private static final String WIDE_SPACE = "　";
    private static final String[] RAW_LABELS = {" 국가 ", "  ", WIDE_SPACE, null, "항구", null, null, " \t", null, "비고"};
    private static final String NO_DATA = "입력값이 올바르지 않습니다: 없는 마루 데이터입니다: NOPE";

    @Autowired
    DataSegmentLock lock;
    @Autowired
    DataItemListQuery listQuery;
    @Autowired
    DataCateEditService cateEdit;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager transactionManager;

    private JdbcTemplate jdbc;
    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(transactionManager);
        DmdSegmentTestSupport.clear(jdbc);
        DmdSegmentTestSupport.insertMaruData(jdbc, "PORT", "MDM", null, "INUSE", "^[A-Z]{5}$", 3, RAW_LABELS);
        DmdSegmentTestSupport.insertMaruData(jdbc, "CUST", "EXTERNAL", "ERP", "DEPRECATED",
                DmdSegmentTestSupport.DEFAULT_PATTERN, 0);
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @AfterEach
    void clearThreadLocals() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @Test
    void 잠금_뒤_재조회는_라벨을_trim_하고_비면_null_로_10개를_준다() {
        LockedMaruData port = inRollback(() -> lock.lock("PORT"));
        assertEquals(new LockedMaruData("PORT", "INUSE", "MDM", null, "^[A-Z]{5}$", 3,
                Arrays.asList("국가", null, WIDE_SPACE, null, "항구", null, null, null, null, "비고")), port);
        assertEquals("비고", port.attrName(10));
        assertThrows(UnsupportedOperationException.class, () -> port.attrNames().set(0, "x"), "라벨 목록은 바꿀 수 없다");

        LockedMaruData cust = inRollback(() -> lock.lock("CUST"));
        assertEquals(new LockedMaruData("CUST", "DEPRECATED", "EXTERNAL", "ERP", DmdSegmentTestSupport.DEFAULT_PATTERN, 0,
                Arrays.asList(new String[10])), cust);

        BusinessException e = assertThrows(BusinessException.class, () -> inRollback(() -> lock.lock("NOPE")));
        assertEquals(MdmErrorCode.INVALID_INPUT.code(), e.getErrors().get(0).code());
        assertEquals(NO_DATA, e.getMessage());
    }

    @Test
    void 항목_관리_머리는_공백_라벨을_빼고_있는_번호만_준다() {
        DataItemHeader port = inRollback(() -> listQuery.header("PORT"));
        assertEquals("PORT", port.getMaruDataId());
        assertEquals("PORT 이름", port.getMaruDataName());
        assertEquals("INUSE", port.getStatus());
        assertEquals("MDM", port.getSourceKind());
        assertNull(port.getSourceSystem());
        assertEquals(3, port.getLvlCnt());
        assertEquals(List.of("attr01=국가", "attr05=항구", "attr10=비고"), labels(port.getAttrLabels()));
        assertTrue(port.isEditable());
        assertEquals(List.of(), port.getCategories());

        DataItemHeader cust = inRollback(() -> listQuery.header("CUST"));
        assertEquals("EXTERNAL", cust.getSourceKind());
        assertEquals("ERP", cust.getSourceSystem());
        assertEquals("DEPRECATED", cust.getStatus());
        assertEquals(0, cust.getLvlCnt());
        assertEquals(List.of(), cust.getAttrLabels());
        assertFalse(cust.isEditable());

        assertNull(inRollback(() -> listQuery.header("NOPE")), "없으면 null");
    }

    @Test
    void 카테고리_편집_조회는_라벨을_DB_값_그대로_10개_준다() {
        CateSearchResult port = cateEdit.search(search("PORT"));
        assertEquals("PORT", port.getMaruDataId());
        assertEquals("PORT 이름", port.getMaruDataName());
        assertEquals(3, port.getLvlCnt());
        assertEquals(Arrays.asList(RAW_LABELS), port.getAttrLabels());

        CateSearchResult cust = cateEdit.search(search("CUST"));
        assertEquals(0, cust.getLvlCnt());
        assertEquals(Arrays.asList(new String[10]), cust.getAttrLabels());

        BusinessException e = assertThrows(BusinessException.class, () -> cateEdit.search(search("NOPE")));
        assertEquals(MdmErrorCode.INVALID_INPUT.code(), e.getErrors().get(0).code());
        assertEquals(NO_DATA, e.getMessage());
    }

    // ── 도우미 ──

    private <T> T inRollback(java.util.function.Supplier<T> call) {
        return tx.execute(status -> {
            status.setRollbackOnly();
            return call.get();
        });
    }

    private static CateSearchRequest search(String md) {
        CateSearchRequest r = new CateSearchRequest();
        r.setMaruDataId(md);
        return r;
    }

    private static List<String> labels(List<AttrLabel> labels) {
        return labels.stream().map(l -> l.getField() + "=" + l.getLabel()).toList();
    }
}
