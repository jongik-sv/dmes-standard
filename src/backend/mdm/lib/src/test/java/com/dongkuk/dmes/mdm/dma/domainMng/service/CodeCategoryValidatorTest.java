package com.dongkuk.dmes.mdm.dma.domainMng.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.common.engine.MdmCodeLookupAvailability;
import com.dongkuk.dmes.mdm.dma.domainMng.service.CodeCategoryValidator.Verdict;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import org.junit.jupiter.api.Test;

/** design.md §4.1 U6 — R10 카테고리 유효성(RELEASED 버전 V 에서 from_ver <= V < to_ver). */
class CodeCategoryValidatorTest {

    private static BigDecimal v(String s) {
        return new BigDecimal(s).setScale(3);
    }

    private static final LocalDateTime OPEN = LocalDateTime.of(9999, 12, 31, 0, 0);

    static final CodeLookup LOOKUP = id -> !"PROC_CD".equals(id) ? Optional.empty() : Optional.of(new CodeRows(
            new CodeHeader("PROC_CD", "INUSE"),
            List.of(new CodeVersionRow(v("1"), "RELEASED", LocalDateTime.of(2020, 1, 1, 0, 0), LocalDateTime.of(2099, 1, 1, 0, 0)),
                    new CodeVersionRow(v("2"), "RELEASED", LocalDateTime.of(2099, 1, 1, 0, 0), OPEN),
                    new CodeVersionRow(v("3"), "CANCELLED", null, null),
                    new CodeVersionRow(v("4"), "DRAFT", null, null)),
            List.of(),
            List.of(new CodeCateRow("ACTIVE", v("1"), v("2"), "REGEX", ".*", "CODE"),
                    new CodeCateRow("FUTURE", v("2"), v("9999"), "REGEX", ".*", "CODE"),
                    new CodeCateRow("CANCELLED_ONLY", v("3"), v("4"), "REGEX", ".*", "CODE"),
                    new CodeCateRow("DRAFT_ONLY", v("4"), v("9999"), "REGEX", ".*", "CODE"),
                    new CodeCateRow("CLOSED", v("0.5"), v("1"), "REGEX", ".*", "CODE")),
            List.of()));

    private final CodeCategoryValidator validator = new CodeCategoryValidator(MdmCodeLookupAvailability.of(LOOKUP));

    @Test
    void RELEASED_버전에서_유효한_카테고리만_통과한다() {
        assertEquals(Verdict.VALID, validator.check("PROC_CD", "ACTIVE"));
        assertEquals(Verdict.VALID, validator.check("PROC_CD", "FUTURE"), "적용 전 RELEASED 도 포함");
        assertEquals(Verdict.INVALID, validator.check("PROC_CD", "CANCELLED_ONLY"));
        assertEquals(Verdict.INVALID, validator.check("PROC_CD", "DRAFT_ONLY"));
        assertEquals(Verdict.INVALID, validator.check("PROC_CD", "CLOSED"), "to_ver 는 배타");
        assertEquals(Verdict.INVALID, validator.check("PROC_CD", "NONE"));
    }

    @Test
    void BASE_는_RELEASED_버전이_있으면_유효하고_없는_코드는_무효() {
        assertEquals(Verdict.VALID, validator.check("PROC_CD", "BASE"));
        assertEquals(Verdict.VALID, validator.check("PROC_CD", null));
        assertEquals(Verdict.INVALID, validator.check("NO_CODE", "BASE"));
    }

    @Test
    void 코드_원장이_없으면_판정_불가다() {
        assertEquals(Verdict.UNAVAILABLE,
                new CodeCategoryValidator(MdmCodeLookupAvailability.of(null)).check("PROC_CD", "ACTIVE"));
    }
}
