package com.dongkuk.dmes.mdm.common.version;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.service.RuleConfirmService;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

/**
 * 확정 화면의 적용 시작 일시 해석 특성 시험(BE 리팩토링 2회차 C1) — 오류 코드·문구·칸 이름(applyFrom)·앞뒤 공백·열린 끝 경계를 고정한다.
 * 룰·코드 확정 화면의 두 사본은 글자까지 같았다(공개 범위만 달랐다).
 */
class VersionRulesApplyFromTest {

    private static LocalDateTime parse(String value) {
        return RuleConfirmService.parseApplyFrom(value);
    }

    private static void assertApplyFromError(ErrorCode code, String message, String value) {
        BusinessException e = assertThrows(BusinessException.class, () -> parse(value), String.valueOf(value));
        assertEquals(code, e.getErrorCode(), String.valueOf(value));
        assertEquals(message, e.getMessage(), String.valueOf(value));
        assertEquals(1, e.getErrors().size());
        ErrorDetail d = e.getErrors().get(0);
        assertEquals("applyFrom", d.field());
        assertEquals(code.getCode(), d.code());
        assertEquals(message, d.message());
        assertEquals(null, d.grid());
        assertEquals(null, d.rowKey());
    }

    @Test
    void 초_단위_글자를_그대로_읽고_앞뒤_공백은_무시한다() {
        assertEquals(LocalDateTime.of(2026, 7, 1, 9, 30, 15), parse("2026-07-01 09:30:15"));
        assertEquals(LocalDateTime.of(2026, 7, 1, 0, 0, 0), parse("  2026-07-01 00:00:00 \t"));
    }

    @Test
    void 비어_있으면_REQUIRED_VALUE() {
        for (String blank : new String[] {null, "", "   "}) {
            assertApplyFromError(ErrorCode.REQUIRED_VALUE, "적용 시작 일시를 입력하세요", blank);
        }
    }

    @Test
    void 형식이_다르면_INVALID_VALUE_이고_문구에_공백을_뺀_입력이_붙는다() {
        for (String bad : new String[] {"2026-07-01T00:00", "2026/07/01 00:00:00", "2026-07-01", "2026-07-01 00:00",
                "2026-13-01 00:00:00", "abc"}) {
            assertApplyFromError(ErrorCode.INVALID_VALUE, "적용 시작 일시는 yyyy-MM-dd HH:mm:ss 형식이어야 합니다: " + bad, bad);
        }
        assertApplyFromError(ErrorCode.INVALID_VALUE, "적용 시작 일시는 yyyy-MM-dd HH:mm:ss 형식이어야 합니다: 2026/07/01",
                " 2026/07/01 ");
    }

    @Test
    void 열린_끝_9999_12_31_00_00_00_부터는_INVALID_VALUE_이고_바로_앞은_받는다() {
        assertEquals(LocalDateTime.of(9999, 12, 30, 23, 59, 59), parse("9999-12-30 23:59:59"));
        for (String end : new String[] {"9999-12-31 00:00:00", "9999-12-31 23:59:59"}) {
            assertApplyFromError(ErrorCode.INVALID_VALUE, "적용 시작 일시는 9999-12-31 00:00:00 보다 앞이어야 합니다", end);
        }
    }
}
