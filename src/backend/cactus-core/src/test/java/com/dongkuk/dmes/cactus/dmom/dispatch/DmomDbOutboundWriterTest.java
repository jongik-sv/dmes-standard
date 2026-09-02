package com.dongkuk.dmes.cactus.dmom.dispatch;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.format.DmomFormatRepository;
import com.dongkuk.dmes.cactus.dmom.message.DmomSendRequest;
import com.dongkuk.dmes.cactus.dmom.transport.CaravanHubTransport;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mybatis.spring.SqlSessionTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DmomDbOutboundWriterTest {

    private final SqlSessionTemplate bizTemplate = mock(SqlSessionTemplate.class);
    private final DmomFormatRepository formatRepository = mock(DmomFormatRepository.class);
    private final DmomDbOutboundWriter writer = new DmomDbOutboundWriter(bizTemplate, formatRepository);

    private final DmomSendRequest request = DmomSendRequest.builder()
            .transactionCode("TC")
            .interfaceId("MMQCMMCMTT01")
            .transport(CaravanHubTransport.DB)
            .build();

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void 유효테이블이면_INSERT_호출_파라미터_확인() {
        when(formatRepository.resolveSendTable("MMQCMMCMTT01", "TC")).thenReturn("IF_MMQCMMCMTT01");

        writer.insert(request, "a|b|");

        ArgumentCaptor<Map> captor = ArgumentCaptor.forClass(Map.class);
        verify(bizTemplate).insert(eq("DmomMapper.insertIfOutbound"), captor.capture());
        Map<String, Object> p = captor.getValue();
        assertThat(p)
                .containsEntry("tableName", "IF_MMQCMMCMTT01")
                .containsEntry("transactionCode", "TC")
                .containsEntry("interfaceId", "MMQCMMCMTT01")
                .containsEntry("interfaceMsg", "a|b|")
                .containsEntry("ifFlag", "N");
    }

    @Test
    void 화이트리스트_위반테이블명이면_DmomException_INSERT안함() {
        when(formatRepository.resolveSendTable(any(), any())).thenReturn("IF_X; DROP TABLE Y");

        assertThatThrownBy(() -> writer.insert(request, "a|b|"))
                .isInstanceOf(DmomException.class);
        verify(bizTemplate, never()).insert(anyString(), any());
    }
}
