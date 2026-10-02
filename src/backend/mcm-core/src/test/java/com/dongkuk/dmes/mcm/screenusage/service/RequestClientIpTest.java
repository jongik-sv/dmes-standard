package com.dongkuk.dmes.mcm.screenusage.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import static org.assertj.core.api.Assertions.assertThat;

class RequestClientIpTest {

    @AfterEach
    void reset() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    @DisplayName("현재 요청이 있으면 remoteAddr 를 돌려준다")
    void currentRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("10.0.0.7");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

        assertThat(new RequestClientIp().current()).isEqualTo("10.0.0.7");
    }

    @Test
    @DisplayName("요청 밖(스케줄러 등)에서는 null")
    void noRequest() {
        assertThat(new RequestClientIp().current()).isNull();
    }
}
