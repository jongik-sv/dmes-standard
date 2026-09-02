package com.dongkuk.caravan.hub.outbound.db;

import com.dongkuk.caravan.core.model.KafkaMessageContext;
import com.dongkuk.caravan.hub.mapper.InterfaceMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * TC-ODB-001 ~ TC-ODB-003: OUTBOUND DB 핸들러 테스트
 */
@ExtendWith(MockitoExtension.class)
class DbOutboundHandlerTest {

    @Mock
    private InterfaceMapper interfaceMapper;

    @InjectMocks
    private DbOutboundHandler dbOutboundHandler;

    // ========== TC-ODB-001: 정상 DB INSERT ==========

    @Nested
    @DisplayName("TC-ODB-001: 정상 DB INSERT")
    class NormalInsert {

        @Test
        @DisplayName("Kafka 메시지를 IF_* 테이블에 INSERT (IF_FLAG='N')")
        void shouldInsertToIfTable() {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            when(context.getTransactionCode()).thenReturn("CaravanHubConsumeHandler");
            when(context.getInterfaceId()).thenReturn("MMPPMMCMTT01");
            when(context.getInterfaceMsg()).thenReturn("PQR02012|P|S|5A|20260130");

            Map<String, Object> config = new HashMap<>();
            config.put("DB_TABLE_NAME", "IF_MMPPMMCMTT01");
            config.put("DB_SCHEMA", "IFUSER");

            // when
            dbOutboundHandler.handle(context, config);

            // then
            verify(interfaceMapper).insertOutboundData(
                    eq("IFUSER"),
                    eq("IF_MMPPMMCMTT01"),
                    eq("CaravanHubConsumeHandler"),
                    eq("MMPPMMCMTT01"),
                    eq("PQR02012|P|S|5A|20260130"),
                    eq("N"),
                    any()
            );
        }

        @Test
        @DisplayName("DB_SCHEMA가 null이어도 INSERT 실행")
        void shouldInsertEvenWhenSchemaIsNull() {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            when(context.getTransactionCode()).thenReturn("TC01");
            when(context.getInterfaceId()).thenReturn("TOPIC01");
            when(context.getInterfaceMsg()).thenReturn("MSG|DATA");

            Map<String, Object> config = new HashMap<>();
            config.put("DB_TABLE_NAME", "IF_TABLE");
            config.put("DB_SCHEMA", null);

            // when
            dbOutboundHandler.handle(context, config);

            // then
            verify(interfaceMapper).insertOutboundData(
                    eq(null), eq("IF_TABLE"), eq("TC01"), eq("TOPIC01"), eq("MSG|DATA"), eq("N"), any());
        }
    }

    // ========== TC-ODB-002: DB_TABLE_NAME 미설정 ==========

    @Nested
    @DisplayName("TC-ODB-002: DB_TABLE_NAME 미설정")
    class MissingTableName {

        @Test
        @DisplayName("DB_TABLE_NAME이 null이면 IllegalStateException")
        void shouldThrowWhenTableNameIsNull() {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            Map<String, Object> config = new HashMap<>();
            config.put("DB_TABLE_NAME", null);
            config.put("DB_SCHEMA", "IFUSER");

            // when & then
            assertThatThrownBy(() -> dbOutboundHandler.handle(context, config))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("DB_TABLE_NAME");
        }

        @Test
        @DisplayName("DB_TABLE_NAME이 빈 문자열이면 IllegalStateException")
        void shouldThrowWhenTableNameIsEmpty() {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            Map<String, Object> config = new HashMap<>();
            config.put("DB_TABLE_NAME", "");
            config.put("DB_SCHEMA", "IFUSER");

            // when & then
            assertThatThrownBy(() -> dbOutboundHandler.handle(context, config))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("DB_TABLE_NAME");
        }
    }

    // ========== TC-ODB-003: 유효하지 않은 테이블명 ==========

    @Nested
    @DisplayName("TC-ODB-003: 유효하지 않은 테이블명 (SQL Injection 방지)")
    class InvalidTableName {

        @Test
        @DisplayName("정상 테이블명 통과: IF_VALID_TABLE")
        void shouldAcceptValidTableName() {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            when(context.getTransactionCode()).thenReturn("TC");
            when(context.getInterfaceId()).thenReturn("TOPIC");
            when(context.getInterfaceMsg()).thenReturn("MSG");

            Map<String, Object> config = new HashMap<>();
            config.put("DB_TABLE_NAME", "IF_VALID_TABLE");
            config.put("DB_SCHEMA", "IFUSER");

            // when
            dbOutboundHandler.handle(context, config);

            // then
            verify(interfaceMapper).insertOutboundData(anyString(), eq("IF_VALID_TABLE"),
                    anyString(), anyString(), anyString(), anyString(), any());
        }

        @Test
        @DisplayName("언더스코어 시작 테이블명 통과: _UNDERSCORE_START")
        void shouldAcceptUnderscoreStart() {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            when(context.getTransactionCode()).thenReturn("TC");
            when(context.getInterfaceId()).thenReturn("TOPIC");
            when(context.getInterfaceMsg()).thenReturn("MSG");

            Map<String, Object> config = new HashMap<>();
            config.put("DB_TABLE_NAME", "_UNDERSCORE_START");
            config.put("DB_SCHEMA", "IFUSER");

            // when
            dbOutboundHandler.handle(context, config);

            // then
            verify(interfaceMapper).insertOutboundData(anyString(), eq("_UNDERSCORE_START"),
                    anyString(), anyString(), anyString(), anyString(), any());
        }

        @Test
        @DisplayName("공백 포함 테이블명 거부: 'IF TABLE'")
        void shouldRejectTableNameWithSpaces() {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            Map<String, Object> config = new HashMap<>();
            config.put("DB_TABLE_NAME", "IF TABLE");
            config.put("DB_SCHEMA", "IFUSER");

            // when & then
            assertThatThrownBy(() -> dbOutboundHandler.handle(context, config))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("유효하지 않은 테이블명");
        }

        @Test
        @DisplayName("SQL Injection 시도 거부: 'IF_TABLE; DROP TABLE'")
        void shouldRejectSqlInjection() {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            Map<String, Object> config = new HashMap<>();
            config.put("DB_TABLE_NAME", "IF_TABLE; DROP TABLE");
            config.put("DB_SCHEMA", "IFUSER");

            // when & then
            assertThatThrownBy(() -> dbOutboundHandler.handle(context, config))
                    .isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("숫자로 시작하는 테이블명 거부: '123_TABLE'")
        void shouldRejectNumberStart() {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            Map<String, Object> config = new HashMap<>();
            config.put("DB_TABLE_NAME", "123_TABLE");
            config.put("DB_SCHEMA", "IFUSER");

            // when & then
            assertThatThrownBy(() -> dbOutboundHandler.handle(context, config))
                    .isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("특수문자 포함 테이블명 거부: 'IF_TABLE$'")
        void shouldRejectSpecialCharacters() {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            Map<String, Object> config = new HashMap<>();
            config.put("DB_TABLE_NAME", "IF_TABLE$");
            config.put("DB_SCHEMA", "IFUSER");

            // when & then
            assertThatThrownBy(() -> dbOutboundHandler.handle(context, config))
                    .isInstanceOf(IllegalStateException.class);
        }
    }
}
