package com.dongkuk.caravan.hub.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TC-CFG-001/002: caravan-hub 설정 프로퍼티 테스트
 */
class CaravanHubPropertiesTest {

    // ========== TC-CFG-002: 기본값 테스트 ==========

    @Nested
    @DisplayName("TC-CFG-002: 기본값 테스트")
    class DefaultValues {

        @Test
        @DisplayName("CaravanHubProperties 기본 객체 생성 시 모든 기본값 확인")
        void shouldHaveCorrectDefaultValues() {
            // given
            CaravanHubProperties props = new CaravanHubProperties();

            // then - inbound.db
            assertThat(props.getInbound()).isNotNull();
            assertThat(props.getInbound().getDb()).isNotNull();
            assertThat(props.getInbound().getDb().isEnabled()).isTrue();
            assertThat(props.getInbound().getDb().getThreadPoolSize()).isEqualTo(10);
            assertThat(props.getInbound().getDb().getBatchSize()).isEqualTo(100);

            // then - inbound.file
            assertThat(props.getInbound().getFile()).isNotNull();
            assertThat(props.getInbound().getFile().isEnabled()).isTrue();
            assertThat(props.getInbound().getFile().getThreadPoolSize()).isEqualTo(5);

            // then - outbound.http
            assertThat(props.getOutbound()).isNotNull();
            assertThat(props.getOutbound().getHttp()).isNotNull();
            assertThat(props.getOutbound().getHttp().getConnectTimeout()).isEqualTo(10000);
            assertThat(props.getOutbound().getHttp().getReadTimeout()).isEqualTo(30000);
        }
    }

    // ========== TC-CFG-001: 설정값 바인딩 테스트 ==========

    @Nested
    @DisplayName("TC-CFG-001: 설정값 바인딩 테스트")
    class ConfigBinding {

        @Test
        @DisplayName("Inbound DB 설정값 변경")
        void shouldBindInboundDbProperties() {
            // given
            CaravanHubProperties props = new CaravanHubProperties();
            props.getInbound().getDb().setEnabled(false);
            props.getInbound().getDb().setThreadPoolSize(20);
            props.getInbound().getDb().setBatchSize(500);

            // then
            assertThat(props.getInbound().getDb().isEnabled()).isFalse();
            assertThat(props.getInbound().getDb().getThreadPoolSize()).isEqualTo(20);
            assertThat(props.getInbound().getDb().getBatchSize()).isEqualTo(500);
        }

        @Test
        @DisplayName("Inbound File 설정값 변경")
        void shouldBindInboundFileProperties() {
            // given
            CaravanHubProperties props = new CaravanHubProperties();
            props.getInbound().getFile().setEnabled(false);
            props.getInbound().getFile().setThreadPoolSize(8);

            // then
            assertThat(props.getInbound().getFile().isEnabled()).isFalse();
            assertThat(props.getInbound().getFile().getThreadPoolSize()).isEqualTo(8);
        }

        @Test
        @DisplayName("Outbound Http 설정값 변경")
        void shouldBindOutboundHttpProperties() {
            // given
            CaravanHubProperties props = new CaravanHubProperties();
            props.getOutbound().getHttp().setConnectTimeout(5000);
            props.getOutbound().getHttp().setReadTimeout(15000);

            // then
            assertThat(props.getOutbound().getHttp().getConnectTimeout()).isEqualTo(5000);
            assertThat(props.getOutbound().getHttp().getReadTimeout()).isEqualTo(15000);
        }
    }

    // ========== 내부 클래스 독립성 ==========

    @Nested
    @DisplayName("내부 클래스 독립성")
    class InnerClassIndependence {

        @Test
        @DisplayName("Inbound와 Outbound는 독립적인 객체")
        void inboundAndOutboundShouldBeIndependent() {
            // given
            CaravanHubProperties props = new CaravanHubProperties();

            // then
            assertThat(props.getInbound()).isNotSameAs(props.getOutbound());
        }

        @Test
        @DisplayName("DB와 File 설정은 독립적인 객체")
        void dbAndFileShouldBeIndependent() {
            // given
            CaravanHubProperties props = new CaravanHubProperties();

            // when - DB 설정 변경
            props.getInbound().getDb().setEnabled(false);

            // then - File 설정에 영향 없음
            assertThat(props.getInbound().getFile().isEnabled()).isTrue();
        }
    }
}
