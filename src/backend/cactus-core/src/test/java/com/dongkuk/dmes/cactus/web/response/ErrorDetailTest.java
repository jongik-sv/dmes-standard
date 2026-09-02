package com.dongkuk.dmes.cactus.web.response;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ErrorDetailTest {

    @Test
    void 공통에러_생성() {
        ErrorDetail error = ErrorDetail.of("E003", "저장 기간 마감");

        assertThat(error.code()).isEqualTo("E003");
        assertThat(error.message()).isEqualTo("저장 기간 마감");
        assertThat(error.grid()).isNull();
        assertThat(error.rowKey()).isNull();
        assertThat(error.field()).isNull();
    }

    @Test
    void 그리드_행에러_생성() {
        ErrorDetail error = ErrorDetail.ofGrid("master", "tmp-1", "qty", "E001", "필수값");

        assertThat(error.grid()).isEqualTo("master");
        assertThat(error.rowKey()).isEqualTo("tmp-1");
        assertThat(error.field()).isEqualTo("qty");
        assertThat(error.rowIndex()).isNull();
    }

    @Test
    void 행인덱스_포함_에러_생성() {
        ErrorDetail error = ErrorDetail.ofGrid("master", "tmp-2", 3, "itemCd", "E002", "유효하지 않은 값");

        assertThat(error.rowIndex()).isEqualTo(3);
        assertThat(error.rowKey()).isEqualTo("tmp-2");
    }
}
