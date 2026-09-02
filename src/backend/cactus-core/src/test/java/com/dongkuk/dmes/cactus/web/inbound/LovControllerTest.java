package com.dongkuk.dmes.cactus.web.inbound;

import com.dongkuk.dmes.cactus.common.ApiResponse;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import org.apache.ibatis.session.SqlSession;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * {@link LovController} 단위 테스트.
 */
class LovControllerTest {

    private final SqlSession sqlSession = mock(SqlSession.class);
    private final OasisServiceExecutor executor = mock(OasisServiceExecutor.class);

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

        LovController controller = new LovController(sqlSession, executor, providerOf(provider));
        ApiResponse<List<Lov>> response = controller.lovMasterRoot("USE_YN");

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getData()).hasSize(2);
    }

    @Test
    @DisplayName("/lov/master/* — MasterCodeProvider 빈이 없으면 BusinessException")
    void lovMaster_noProvider_throws() {
        LovController controller = new LovController(sqlSession, executor, providerOf(null));

        assertThatThrownBy(() -> controller.lovMaster("USE_YN", "ROOT"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("MasterCodeProvider");
    }

    @Test
    @DisplayName("/lov/query/{queryId} — SqlSession 결과를 ApiResponse 에 담아 반환")
    void lovQuery_returnsLovList() {
        when(sqlSession.<Lov>selectList(eq("lov.findCustomers"), any()))
                .thenReturn(List.of(new Lov("C01", "Customer1"), new Lov("C02", "Customer2")));

        LovController controller = new LovController(sqlSession, executor, providerOf(null));
        ApiResponse<List<Lov>> response =
                controller.lovQuery("lov.findCustomers", Map.of(), null);

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getData()).hasSize(2);
    }

    @Test
    @DisplayName("/lov/service/{serviceId} — action='lov' 로 OASIS 실행")
    void lovService_executesWithLovAction() {
        CactusResponse expected = mock(CactusResponse.class);
        when(executor.execute(eq("svc-lov"), eq("lov"), any())).thenReturn(expected);

        LovController controller = new LovController(sqlSession, executor, providerOf(null));
        CactusResponse actual = controller.lovService("svc-lov", new CactusRequest());

        assertThat(actual).isSameAs(expected);
    }
}
