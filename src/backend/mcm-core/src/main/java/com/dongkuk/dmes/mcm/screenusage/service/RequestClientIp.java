package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.common.web.ClientIpResolver;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * 현재 HTTP 요청의 클라이언트 IP (IPv4 형태로 정규화). 신뢰 프록시(BFF·NGINX)가 넘긴 X-Forwarded-For 를
 * {@link ClientIpResolver} 규칙으로 반영한다. 요청 밖에서 호출되면 null.
 */
@Component
public class RequestClientIp {

    private final ClientIpResolver resolver;

    public RequestClientIp(ClientIpResolver resolver) {
        this.resolver = resolver;
    }

    public String current() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes servlet) {
            return resolver.resolve(servlet.getRequest());
        }
        return null;
    }
}
