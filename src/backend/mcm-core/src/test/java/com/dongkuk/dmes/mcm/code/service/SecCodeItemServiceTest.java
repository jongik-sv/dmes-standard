package com.dongkuk.dmes.mcm.code.service;

import com.dongkuk.dmes.mcm.code.dto.SecCodeItemSearchRequest;
import com.dongkuk.dmes.mcm.code.entity.SecCodeItem;
import com.dongkuk.dmes.mcm.code.entity.SecCodeItemId;
import com.dongkuk.dmes.mcm.code.repository.SecCodeItemRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SecCodeItemServiceTest {

    @Mock SecCodeItemRepository secCodeItemRepository;

    @InjectMocks SecCodeItemService service;

    @Test
    void getCodesByGroup_groupCd_없으면_빈_리스트() {
        var req = new SecCodeItemSearchRequest();
        assertThat(service.getCodesByGroup(req)).isEmpty();
    }

    @Test
    void getCodesByGroup_활성_항목만_LoV_형식으로() {
        when(secCodeItemRepository.findActiveByGroupCd("PRIORITY"))
                .thenReturn(List.of(item("PRIORITY", "H", "높음", 1), item("PRIORITY", "L", "낮음", 2)));

        var req = new SecCodeItemSearchRequest();
        req.setGroupCd("PRIORITY");

        List<Map<String, Object>> result = service.getCodesByGroup(req);

        assertThat(result).hasSize(2);
        assertThat(result.get(0).get("code")).isEqualTo("H");
        assertThat(result.get(0).get("name")).isEqualTo("높음");
        assertThat(result.get(1).get("code")).isEqualTo("L");
    }

    @Test
    void searchItems_useYn_Y_면_활성만_그_외엔_전체() {
        when(secCodeItemRepository.findActiveByGroupCd("PRIORITY"))
                .thenReturn(List.of(item("PRIORITY", "H", "높음", 1)));
        when(secCodeItemRepository.findByGroupCdOrderBySortOrdAsc("PRIORITY"))
                .thenReturn(List.of(item("PRIORITY", "H", "높음", 1), item("PRIORITY", "X", "폐기", 99)));

        var activeReq = new SecCodeItemSearchRequest();
        activeReq.setGroupCd("PRIORITY");
        activeReq.setUseYn("Y");
        assertThat(service.searchItems(activeReq)).hasSize(1);

        var allReq = new SecCodeItemSearchRequest();
        allReq.setGroupCd("PRIORITY");
        assertThat(service.searchItems(allReq)).hasSize(2);
    }

    private SecCodeItem item(String groupCd, String itemCd, String itemNm, int sortOrd) {
        var i = new SecCodeItem();
        i.setId(new SecCodeItemId(groupCd, itemCd));
        i.setItemNm(itemNm);
        i.setSortOrd(sortOrd);
        i.setUseYn("Y");
        return i;
    }
}
