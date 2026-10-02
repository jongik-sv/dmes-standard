package com.dongkuk.dmes.mcm.screenusage.service;

import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * 현재 HTTP 요청의 클라이언트 IP. 로그인 이력(McmAuthController — LoginLog.clientIp)과 같은 remoteAddr 기준이다
 * (X-Forwarded-For 는 보지 않는다). 요청 밖에서 호출되면 null.
 */
@Component
public class RequestClientIp {

    public String current() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes servlet) {
            return servlet.getRequest().getRemoteAddr();
        }
        return null;
    }
}
