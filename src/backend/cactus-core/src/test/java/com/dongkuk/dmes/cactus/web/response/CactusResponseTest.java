package com.dongkuk.dmes.cactus.web.response;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class CactusResponseTest {

    @Test
    void 성공응답을_빌더로_생성할_수_있다() {
        CactusResponse response = new CactusResponse.Builder(ResponseMeta.success("tx-001"))
                .data(Map.of("totalCount", 150))
                .grids(Map.of("master", new GridResult(List.of(Map.of("id", "1")))))
                .build();

        assertThat(response.getMeta().success()).isTrue();
        assertThat(response.getMeta().code()).isEqualTo("0000");
        assertThat(response.getMeta().txId()).isEqualTo("tx-001");
        assertThat(response.getData()).containsEntry("totalCount", 150);
        assertThat(response.getGrids()).containsKey("master");
        assertThat(response.getErrors()).isNull();
    }

    @Test
    void 에러응답을_빌더로_생성할_수_있다() {
        List<ErrorDetail> errors = List.of(
                ErrorDetail.ofGrid("master", "tmp-1", "qty", "E001", "필수값 누락")
        );

        CactusResponse response = new CactusResponse.Builder(
                ResponseMeta.error("tx-002", "E001", "입력값을 확인해주세요."))
                .errors(errors)
                .build();

        assertThat(response.getMeta().success()).isFalse();
        assertThat(response.getMeta().code()).isEqualTo("E001");
        assertThat(response.getErrors()).hasSize(1);
        assertThat(response.getErrors().get(0).grid()).isEqualTo("master");
        assertThat(response.getErrors().get(0).rowKey()).isEqualTo("tmp-1");
        assertThat(response.getData()).isNull();
        assertThat(response.getGrids()).isNull();
    }

    @Test
    void meta만_있는_최소_응답을_생성할_수_있다() {
        CactusResponse response = new CactusResponse.Builder(ResponseMeta.success("tx-003"))
                .build();

        assertThat(response.getMeta().success()).isTrue();
        assertThat(response.getData()).isNull();
        assertThat(response.getGrids()).isNull();
        assertThat(response.getErrors()).isNull();
    }
}
