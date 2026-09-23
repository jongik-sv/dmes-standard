package com.dongkuk.dmes.mdm.common.support;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * TSK-01-03 design.md §3.1 L4 — "row_version 409" 의 표현(D5): cactus {@code BusinessException} 의 운반 코드는
 * {@code transport()}, 첫 detail code 가 MDMnnn. 검사 이슈는 뒤이은 detail 로 싣는다.
 */
class MdmErrorsTest {

    @Test
    void 오류_코드_하나를_BusinessException_으로_싣는다() {
        BusinessException e = MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
        assertEquals(ErrorCode.BUSINESS_ERROR, e.getErrorCode());
        assertEquals("다른 사용자가 수정했습니다. 다시 불러오세요", e.getMessage());
        assertEquals(1, e.getErrors().size());
        assertEquals("MDM001", e.getErrors().get(0).code());
        assertEquals(409, MdmErrorCode.ROW_VERSION_CONFLICT.httpStatus());
    }

    @Test
    void 검사_이슈를_뒤이은_detail_로_싣는다() {
        List<MdmCheckIssue> issues = List.of(
                new MdmCheckIssue("C1", "첫 이슈", "codeName", "P01"),
                new MdmCheckIssue("C2", "둘째 이슈", null, null));

        BusinessException e = MdmErrors.of(MdmErrorCode.CONFIRM_CHECK_FAILED, issues);

        assertEquals(ErrorCode.BUSINESS_ERROR, e.getErrorCode());
        List<ErrorDetail> details = e.getErrors();
        assertEquals(3, details.size());
        assertEquals("MDM010", details.get(0).code());
        assertEquals("C1", details.get(1).code());
        assertEquals("첫 이슈", details.get(1).message());
        assertEquals("codeName", details.get(1).field());
        assertEquals("P01", details.get(1).rowKey());
        assertNull(details.get(1).grid());
        assertEquals("C2", details.get(2).code());
        assertNull(details.get(2).rowKey());
    }

    @Test
    void 소유자_아님은_ACCESS_DENIED_로_운반한다() {
        assertEquals(ErrorCode.ACCESS_DENIED, MdmErrors.of(MdmErrorCode.NOT_DRAFT_OWNER).getErrorCode());
        assertEquals(ErrorCode.ACCESS_DENIED, MdmErrors.of(MdmErrorCode.STEWARD_ROLE_REQUIRED).getErrorCode());
    }

    @Test
    void 상세가_있으면_기본_문구_뒤에_붙인다() {
        // TSK-04-04 I25 — OASIS 경로는 message 만 화면에 오므로(F12) 기본 문구로 시작하고 상세는 ": " 뒤에 붙인다.
        BusinessException e = MdmErrors.of(MdmErrorCode.SYSTEM_FIELD_ALREADY_MAPPED, "ERP·MATNR → 컬럼 '코일 아이디'",
                List.of(new MdmCheckIssue("MDM017", "ERP·MATNR", "physName", "ERP")));

        assertEquals("한 시스템 안에서 필드명 하나는 컬럼 하나에만 붙일 수 있습니다: ERP·MATNR → 컬럼 '코일 아이디'",
                e.getMessage());
        assertEquals(ErrorCode.DUPLICATE_DATA, e.getErrorCode());
        assertEquals(2, e.getErrors().size());
        assertEquals("MDM017", e.getErrors().get(0).code());
        assertEquals("ERP", e.getErrors().get(1).rowKey());
    }

    @Test
    void 상세가_비면_기본_문구만() {
        assertEquals("입력값이 올바르지 않습니다", MdmErrors.of(MdmErrorCode.INVALID_INPUT, "  ", List.of()).getMessage());
        assertEquals("입력값이 올바르지 않습니다", MdmErrors.of(MdmErrorCode.INVALID_INPUT, null, List.of()).getMessage());
    }
}
