package com.dongkuk.dmes.cactus.web.request;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class CactusRequestTest {

    @Test
    void 기본생성자로_생성하면_모든필드가_null이다() {
        CactusRequest request = new CactusRequest();

        assertThat(request.getMeta()).isNull();
        assertThat(request.getParams()).isNull();
        assertThat(request.getGrids()).isNull();
    }

    @Test
    void 전체필드로_생성할_수_있다() {
        RequestMeta meta = new RequestMeta("user01", "PROD001");
        Map<String, Object> params = Map.of("plantCd", "P01");
        GridData gridData = new GridData(List.of(Map.of("itemCd", "ITEM-001")));
        Map<String, GridData> grids = Map.of("master", gridData);

        CactusRequest request = new CactusRequest(meta, params, grids);

        assertThat(request.getMeta().userId()).isEqualTo("user01");
        assertThat(request.getMeta().menuId()).isEqualTo("PROD001");
        assertThat(request.getParams()).containsEntry("plantCd", "P01");
        assertThat(request.getGrids()).containsKey("master");
        assertThat(request.getGrids().get("master").size()).isEqualTo(1);
    }

    @Test
    void setter로_값을_설정할_수_있다() {
        CactusRequest request = new CactusRequest();
        request.setMeta(new RequestMeta("user01", "SC001"));
        request.setParams(Map.of("key", "value"));

        assertThat(request.getMeta().menuId()).isEqualTo("SC001");
        assertThat(request.getParams()).containsEntry("key", "value");
    }
}
