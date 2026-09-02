package com.dongkuk.dmes.cactus.common;

import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class BusinessExceptionTest {

    @Test
    void 기본메시지로_생성() {
        BusinessException ex = new BusinessException(ErrorCode.REQUIRED_VALUE);

        assertThat(ex.getMessage()).isEqualTo("필수값이 누락되었습니다");
        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE);
        assertThat(ex.getErrors()).isNull();
    }

    @Test
    void 커스텀메시지로_생성() {
        BusinessException ex = new BusinessException(ErrorCode.BUSINESS_ERROR, "수량이 부족합니다");

        assertThat(ex.getMessage()).isEqualTo("수량이 부족합니다");
        assertThat(ex.getErrors()).isNull();
    }

    @Test
    void 행단위_에러목록과_함께_생성() {
        List<ErrorDetail> errors = List.of(
                ErrorDetail.ofGrid("master", "tmp-1", "qty", "E001", "필수값"),
                ErrorDetail.ofGrid("master", "tmp-2", "itemCd", "E002", "유효하지 않은 값")
        );

        BusinessException ex = new BusinessException(ErrorCode.REQUIRED_VALUE, "입력값 확인 필요", errors);

        assertThat(ex.getErrors()).hasSize(2);
        assertThat(ex.getErrors().get(0).rowKey()).isEqualTo("tmp-1");
        assertThat(ex.getErrors().get(1).field()).isEqualTo("itemCd");
    }
}
