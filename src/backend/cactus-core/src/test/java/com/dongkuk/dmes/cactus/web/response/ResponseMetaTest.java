package com.dongkuk.dmes.cactus.web.response;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ResponseMetaTest {

    @Test
    void success_메시지없이_생성() {
        ResponseMeta meta = ResponseMeta.success("tx-001");

        assertThat(meta.txId()).isEqualTo("tx-001");
        assertThat(meta.success()).isTrue();
        assertThat(meta.code()).isEqualTo("0000");
        assertThat(meta.message()).isNull();
    }

    @Test
    void success_메시지포함_생성() {
        ResponseMeta meta = ResponseMeta.success("tx-002", "저장 완료");

        assertThat(meta.success()).isTrue();
        assertThat(meta.message()).isEqualTo("저장 완료");
    }

    @Test
    void error_생성() {
        ResponseMeta meta = ResponseMeta.error("tx-003", "E001", "필수값 누락");

        assertThat(meta.success()).isFalse();
        assertThat(meta.code()).isEqualTo("E001");
        assertThat(meta.message()).isEqualTo("필수값 누락");
    }
}
