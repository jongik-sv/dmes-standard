package com.dongkuk.dmes.cactus.web.inbound;

import com.dongkuk.dmes.cactus.common.ApiResponse;
import com.dongkuk.dmes.cactus.common.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * {@link LovController} 단위 테스트 — 마스터 코드 LoV.
 * {@code /lov/query}·{@code /lov/service} 시험은 {@link QueryControllerTest}·{@link ServiceControllerTest} 로 옮겼다.
 */
class LovControllerTest {

    @SuppressWarnings("unchecked")
    private ObjectProvider<MasterCodeProvider> providerOf(MasterCodeProvider provider) {
        ObjectProvider<MasterCodeProvider> op = mock(ObjectProvider.class);
        when(op.getIfAvailable()).thenReturn(provider);
        return op;
    }

    @Test
    @DisplayName("/lov/master/{code} 호출 — MasterCodeProvider 결과를 ApiResponse 에 담아 반환")
    void lovMaster_returnsLovList() {
        MasterCodeProvider provider = mock(MasterCodeProvider.class);
        List<Lov> rows = List.of(new Lov("MC", "Y", "사용"), new Lov("MC", "N", "미사용"));
        when(provider.findMasterCodeLov("USE_YN", "ROOT")).thenReturn(rows);

        LovController controller = new LovController(providerOf(provider));
        ApiResponse<List<Lov>> response = controller.lovMasterRoot("USE_YN");

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getData()).hasSize(2);
    }

    @Test
    @DisplayName("/lov/master/* — MasterCodeProvider 빈이 없으면 BusinessException")
    void lovMaster_noProvider_throws() {
        LovController controller = new LovController(providerOf(null));

        assertThatThrownBy(() -> controller.lovMaster("USE_YN", "ROOT"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("MasterCodeProvider");
    }
}
