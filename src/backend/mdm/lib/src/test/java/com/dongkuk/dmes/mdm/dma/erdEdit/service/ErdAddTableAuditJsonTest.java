package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.AddTable;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import org.junit.jupiter.api.Test;

/** addTable.audit JSON: 빠지면 null(=붙임), false 면 false. 엄격 리더·기본 MAPPER 모두 정규 생성자로 읽는다. */
class ErdAddTableAuditJsonTest {

    @Test
    void missingAuditIsNull() throws Exception {
        for (var mapper : new com.fasterxml.jackson.databind.ObjectMapper[] {ErdModelCodec.MAPPER, ErdStrictReader.STRICT}) {
            ErdCommand c = mapper.readValue("{\"op\":\"addTable\",\"phys\":\"TB_A\"}", ErdCommand.class);
            assertThat(c).isEqualTo(new AddTable(null, "TB_A", null, null, null));
            assertThat(((AddTable) c).audit()).isNull();
        }
    }

    @Test
    void auditFalseAndTrueAreRead() throws Exception {
        for (var mapper : new com.fasterxml.jackson.databind.ObjectMapper[] {ErdModelCodec.MAPPER, ErdStrictReader.STRICT}) {
            assertThat(((AddTable) mapper.readValue("{\"op\":\"addTable\",\"phys\":\"TB_A\",\"audit\":false}", ErdCommand.class)).audit())
                    .isFalse();
            assertThat(((AddTable) mapper.readValue("{\"op\":\"addTable\",\"phys\":\"TB_A\",\"audit\":true}", ErdCommand.class)).audit())
                    .isTrue();
        }
    }

    @Test
    void auditStringIsRejectedByStrictReader() {
        assertThatThrownBy(() -> ErdStrictReader.STRICT.readValue(
                "{\"op\":\"addTable\",\"phys\":\"TB_A\",\"audit\":\"false\"}", ErdCommand.class))
                .isInstanceOf(com.fasterxml.jackson.core.JsonProcessingException.class);
    }

    @Test
    void serializesBackWithAudit() throws Exception {
        String json = ErdModelCodec.MAPPER.writeValueAsString(new AddTable("t-1", "TB_A", "에이", "", false));
        assertThat(json).contains("\"audit\":false");
    }
}
