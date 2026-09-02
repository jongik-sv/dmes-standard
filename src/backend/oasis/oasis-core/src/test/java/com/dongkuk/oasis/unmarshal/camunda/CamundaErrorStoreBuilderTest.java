package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.error.Error;
import com.dongkuk.oasis.unmarshal.ErrorStore;
import com.dongkuk.oasis.unmarshal.ErrorStoreBuilder;
import com.dongkuk.oasis.unmarshal.ServiceElementFromPath;
import org.jdom2.Element;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-07-21
 */
class CamundaErrorStoreBuilderTest {
    private final ServiceElementFromPath<Element> serviceParser =
            new CamundaClassPathJdom2ServiceElementFromPath();
    private final ErrorStoreBuilder<Element> errorStoreBuilder = new CamundaErrorStoreBuilder();

    @Test
    void extractError() {
        Element service =
                serviceParser.serviceElement("/unmarshal/camunda/CamundaEventBuilderTest/userExceptionEvent.bpmn");
        ErrorStore errors = errorStoreBuilder.errors(service);
        Error error1 = errors.error("Error_17kc1w2");
        Error error2 = errors.error("Error_1h9ibh5");

        assertThat(error1.errorCode()).isEqualTo("abc");
        assertThat(error1.errorName()).isEqualTo("userException");
        assertThat(error1.errorMessage()).isEqualTo("#{id} 설정을 잘 못 했습니다.");

        assertThat(error2.errorCode()).isNull();
        assertThat(error2.errorName()).isEqualTo("Error_14sve4c");
        assertThat(error2.errorMessage()).isNull();
    }
}