package com.dongkuk.dmes.cactus.web.converter;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GridConverterTest {

    /** 테스트용 DTO */
    public static class ItemDto {
        private String itemCd;
        private Integer qty;
        private String remark;

        public String getItemCd() { return itemCd; }
        public void setItemCd(String itemCd) { this.itemCd = itemCd; }
        public Integer getQty() { return qty; }
        public void setQty(Integer qty) { this.qty = qty; }
        public String getRemark() { return remark; }
        public void setRemark(String remark) { this.remark = remark; }
    }

    @Test
    void Map리스트를_DTO리스트로_변환한다() {
        List<Map<String, Object>> rows = List.of(
                Map.of("itemCd", "ITEM-001", "qty", 100, "remark", "테스트")
        );

        List<ItemDto> result = GridConverter.convert(rows, ItemDto.class);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getItemCd()).isEqualTo("ITEM-001");
        assertThat(result.get(0).getQty()).isEqualTo(100);
    }

    @Test
    void 빈문자열은_null로_정규화된다() {
        Map<String, Object> row = new HashMap<>();
        row.put("itemCd", "ITEM-001");
        row.put("qty", "");    // 숫자 필드에 빈문자열
        row.put("remark", ""); // 문자열 필드에 빈문자열

        List<ItemDto> result = GridConverter.convert(List.of(row), ItemDto.class);

        assertThat(result.get(0).getQty()).isNull();     // "" → null → Integer null
        assertThat(result.get(0).getRemark()).isNull();   // "" → null
    }

    @Test
    void 알수없는_필드는_무시한다() {
        List<Map<String, Object>> rows = List.of(
                Map.of("itemCd", "ITEM-001", "unknownField", "ignored")
        );

        List<ItemDto> result = GridConverter.convert(rows, ItemDto.class);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getItemCd()).isEqualTo("ITEM-001");
    }

    @Test
    void DTO리스트를_Map리스트로_변환한다() {
        ItemDto dto = new ItemDto();
        dto.setItemCd("ITEM-002");
        dto.setQty(50);

        List<Map<String, Object>> result = GridConverter.toMapList(List.of(dto));

        assertThat(result).hasSize(1);
        assertThat(result.get(0)).containsEntry("itemCd", "ITEM-002");
        assertThat(result.get(0)).containsEntry("qty", 50);
    }
}
