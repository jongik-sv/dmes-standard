package com.dongkuk.dmes.cactus.integration.caravanhub;

import com.dongkuk.dmes.cactus.integration.caravanhub.exception.CaravanHubIntegrationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class DefaultCaravanHubIntegrationClientTest {

    private RestClient restClient;
    private MockRestServiceServer mockServer;
    private CaravanHubClientProperties props;
    private DefaultCaravanHubIntegrationClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        mockServer = MockRestServiceServer.bindTo(builder).build();
        restClient = builder.build();

        props = new CaravanHubClientProperties();
        props.setBaseUrl("http://localhost:8200");
        props.getRetry().setMaxAttempts(3);
        props.getRetry().setDelayMs(10);
        client = new DefaultCaravanHubIntegrationClient(restClient, props);
    }

    @Test
    void send_success() {
        String responseJson = """
                {
                  "resultCode": "SUCCESS",
                  "KAFKA_KEYDATA": "840d4999-196b-4740-a370-bc5eed4b30ae",
                  "INTERFACE_ID": "MMPPMERPTT01",
                  "timestamp": "2026-05-13T13:30:00"
                }
                """;
        mockServer.expect(requestTo("http://localhost:8200/caravanHubApi/v1/send"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andRespond(withSuccess(responseJson, MediaType.APPLICATION_JSON));

        CaravanHubSendResult result = client.send("MMPPMERPTT01", "PQR02012", "PQR02012|P|S|...");

        assertThat(result).isNotNull();
        assertThat(result.isSuccess()).isTrue();
        assertThat(result.kafkaKeyData()).isEqualTo("840d4999-196b-4740-a370-bc5eed4b30ae");
        assertThat(result.interfaceId()).isEqualTo("MMPPMERPTT01");
        mockServer.verify();
    }

    @Test
    void send_retriesOnServerError() {
        // 2 failures then 1 success
        String successJson = """
                {"resultCode":"SUCCESS","KAFKA_KEYDATA":"uuid-3","INTERFACE_ID":"T","timestamp":"t"}
                """;
        mockServer.expect(requestTo("http://localhost:8200/caravanHubApi/v1/send"))
                .andRespond(withServerError());
        mockServer.expect(requestTo("http://localhost:8200/caravanHubApi/v1/send"))
                .andRespond(withServerError());
        mockServer.expect(requestTo("http://localhost:8200/caravanHubApi/v1/send"))
                .andRespond(withSuccess(successJson, MediaType.APPLICATION_JSON));

        CaravanHubSendResult result = client.send("T", "TC", "msg");

        assertThat(result.kafkaKeyData()).isEqualTo("uuid-3");
        mockServer.verify();
    }

    @Test
    void send_throwsAfterMaxAttempts() {
        for (int i = 0; i < 3; i++) {
            mockServer.expect(requestTo("http://localhost:8200/caravanHubApi/v1/send"))
                    .andRespond(withServerError());
        }

        assertThatThrownBy(() -> client.send("T", "TC", "msg"))
                .isInstanceOf(CaravanHubIntegrationException.class)
                .hasMessageContaining("max attempts=3");
        mockServer.verify();
    }
}
