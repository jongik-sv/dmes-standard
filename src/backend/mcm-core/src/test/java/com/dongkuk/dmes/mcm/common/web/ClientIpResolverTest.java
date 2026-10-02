package com.dongkuk.dmes.mcm.common.web;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

class ClientIpResolverTest {

    private final ClientIpResolver resolver = new ClientIpResolver("127.0.0.1,::1");

    private String resolve(String remoteAddr, String xff) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remoteAddr);
        if (xff != null) {
            request.addHeader("X-Forwarded-For", xff);
        }
        return resolver.resolve(request);
    }

    @Test
    @DisplayName("IPv6 루프백은 127.0.0.1 로 바꾼다")
    void loopback() {
        assertThat(resolve("::1", null)).isEqualTo("127.0.0.1");
        assertThat(resolve("0:0:0:0:0:0:0:1", null)).isEqualTo("127.0.0.1");
    }

    @Test
    @DisplayName("IPv4-mapped IPv6 는 IPv4 로 바꾼다")
    void mapped() {
        assertThat(resolve("::ffff:10.1.2.3", null)).isEqualTo("10.1.2.3");
        assertThat(resolve("0:0:0:0:0:FFFF:10.1.2.3", null)).isEqualTo("10.1.2.3");
    }

    @Test
    @DisplayName("일반 IPv6 는 그대로 둔다")
    void plainIpv6() {
        assertThat(resolve("2001:db8::1", null)).isEqualTo("2001:db8::1");
    }

    @Test
    @DisplayName("신뢰하지 않는 remoteAddr 의 XFF 는 무시한다")
    void untrustedIgnoresXff() {
        assertThat(resolve("192.168.0.9", "10.1.2.3")).isEqualTo("192.168.0.9");
    }

    @Test
    @DisplayName("신뢰하는 remoteAddr 의 XFF 를 쓴다")
    void trustedUsesXff() {
        assertThat(resolve("127.0.0.1", "10.1.2.3")).isEqualTo("10.1.2.3");
        assertThat(resolve("0:0:0:0:0:0:0:1", "10.1.2.3")).isEqualTo("10.1.2.3");
    }

    @Test
    @DisplayName("XFF 는 오른쪽부터 신뢰하지 않는 첫 주소를 쓴다")
    void rightToLeft() {
        assertThat(resolve("127.0.0.1", "1.1.1.1, 10.1.2.3")).isEqualTo("10.1.2.3");
        assertThat(resolve("127.0.0.1", "1.1.1.1, 10.1.2.3, 127.0.0.1")).isEqualTo("10.1.2.3");
    }

    @Test
    @DisplayName("XFF 가 신뢰 주소뿐이거나 없으면 remoteAddr")
    void onlyTrusted() {
        assertThat(resolve("127.0.0.1", "::1, 127.0.0.1")).isEqualTo("127.0.0.1");
        assertThat(resolve("::1", null)).isEqualTo("127.0.0.1");
    }

    @Test
    @DisplayName("포트·대괄호·공백을 정리한다")
    void cleanup() {
        assertThat(resolve("127.0.0.1", "  1.2.3.4:5678 ")).isEqualTo("1.2.3.4");
        assertThat(resolve("127.0.0.1", "[2001:db8::1]")).isEqualTo("2001:db8::1");
        assertThat(resolve("127.0.0.1", "[2001:db8::1]:443")).isEqualTo("2001:db8::1");
        assertThat(resolve(" 10.0.0.5 ", null)).isEqualTo("10.0.0.5");
    }

    @Test
    @DisplayName("쓰레기 값은 버리고 다음 값 또는 remoteAddr 을 쓴다")
    void garbage() {
        assertThat(resolve("127.0.0.1", "unknown")).isEqualTo("127.0.0.1");
        assertThat(resolve("127.0.0.1", "10.1.2.3, evil.example.com")).isEqualTo("10.1.2.3");
        assertThat(resolve("127.0.0.1", "999.1.1.1")).isEqualTo("127.0.0.1");
        assertThat(resolve("127.0.0.1", "")).isEqualTo("127.0.0.1");
        assertThat(resolve("not-an-ip", null)).isNull();
        assertThat(resolve("", null)).isNull();
    }

    @Test
    @DisplayName("신뢰 프록시 설정도 정규화해서 비교한다")
    void configuredProxies() {
        ClientIpResolver custom = new ClientIpResolver(" 10.9.9.9 , ::ffff:10.8.8.8 ");
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("10.9.9.9");
        request.addHeader("X-Forwarded-For", "5.5.5.5, 10.8.8.8");
        assertThat(custom.resolve(request)).isEqualTo("5.5.5.5");
    }
}
