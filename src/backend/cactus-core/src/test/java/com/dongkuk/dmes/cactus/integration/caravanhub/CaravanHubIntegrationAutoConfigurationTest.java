package com.dongkuk.dmes.cactus.integration.caravanhub;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;

class CaravanHubIntegrationAutoConfigurationTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(CaravanHubIntegrationAutoConfiguration.class));

    @Test
    void defaultActive_registersClient() {
        contextRunner
                .withPropertyValues(
                        "cactus.caravan-hub.base-url=http://localhost:8200",
                        "cactus.caravan-hub.auth.client-key=test-key"
                )
                .run(context -> {
                    assertThat(context).hasSingleBean(CaravanHubIntegrationClient.class);
                    assertThat(context).hasBean("cactusCaravanHubRestClient");
                    CaravanHubClientProperties props = context.getBean(CaravanHubClientProperties.class);
                    assertThat(props.getBaseUrl()).isEqualTo("http://localhost:8200");
                    assertThat(props.getAuth().getClientKey()).isEqualTo("test-key");
                });
    }

    @Test
    void disabled_doesNotRegister() {
        contextRunner
                .withPropertyValues("cactus.caravan-hub.enabled=false")
                .run(context -> {
                    assertThat(context).doesNotHaveBean(CaravanHubIntegrationClient.class);
                    assertThat(context).doesNotHaveBean("cactusCaravanHubRestClient");
                });
    }

    @Test
    void existingBean_isHonored() {
        contextRunner
                .withBean(CaravanHubIntegrationClient.class, () -> (topicId, transactionCode, interfaceMsg) ->
                        new CaravanHubSendResult("SUCCESS", "custom-uuid", topicId, null, null, null))
                .run(context -> {
                    CaravanHubIntegrationClient client = context.getBean(CaravanHubIntegrationClient.class);
                    CaravanHubSendResult result = client.send("T", "TC", "msg");
                    assertThat(result.kafkaKeyData()).isEqualTo("custom-uuid");
                });
    }

    @Test
    void retryDefaults_areApplied() {
        contextRunner.run(context -> {
            CaravanHubClientProperties props = context.getBean(CaravanHubClientProperties.class);
            assertThat(props.getRetry().getMaxAttempts()).isEqualTo(3);
            assertThat(props.getRetry().getDelayMs()).isEqualTo(1000L);
            assertThat(props.getConnectTimeoutMs()).isEqualTo(5000);
            assertThat(props.getReadTimeoutMs()).isEqualTo(10000);
        });
    }

    @Test
    void restClient_isInstantiable() {
        contextRunner.run(context -> {
            RestClient client = context.getBean("cactusCaravanHubRestClient", RestClient.class);
            assertThat(client).isNotNull();
        });
    }
}
