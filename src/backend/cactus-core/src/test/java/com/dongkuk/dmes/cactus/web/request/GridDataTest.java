package com.dongkuk.dmes.cactus.web.request;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class GridDataTest {

    @Test
    void 기본생성자는_빈배열이다() {
        GridData gridData = new GridData();

        assertThat(gridData.getRows()).isEmpty();
        assertThat(gridData.isEmpty()).isTrue();
        assertThat(gridData.size()).isZero();
    }

    @Test
    void null_rows는_빈배열로_대체된다() {
        GridData gridData = new GridData(null);

        assertThat(gridData.getRows()).isEmpty();
    }

    @Test
    void rows_setter에_null을_넣으면_빈배열이_된다() {
        GridData gridData = new GridData(List.of(Map.of("a", "b")));
        gridData.setRows(null);

        assertThat(gridData.getRows()).isEmpty();
    }

    @Test
    void 데이터가_있으면_isEmpty가_false이다() {
        GridData gridData = new GridData(List.of(
                Map.of("rowKey", "tmp-1", "rowStatus", "C")
        ));

        assertThat(gridData.isEmpty()).isFalse();
        assertThat(gridData.size()).isEqualTo(1);
    }
}
