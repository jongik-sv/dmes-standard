package com.dongkuk.dmes.mcm.common.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.util.Arrays;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 요청의 실제 클라이언트 IP 를 정규화해 돌려준다 (화면 사용 기록용).
 *
 * <p>판정 규칙
 * <ul>
 *   <li>{@code remoteAddr} 가 신뢰 프록시 목록에 없으면 {@code X-Forwarded-For} 는 위조될 수 있으므로 무시하고
 *       {@code remoteAddr} 를 쓴다.</li>
 *   <li>신뢰 프록시이면 {@code X-Forwarded-For} 를 오른쪽부터 보며 신뢰 목록에 없는 첫 유효 주소를 쓴다.
 *       모두 신뢰 주소이거나 헤더가 없으면 {@code remoteAddr}.</li>
 *   <li>정규화: {@code ::1} 은 {@code 127.0.0.1}, IPv4-mapped IPv6 은 IPv4, 그 밖의 IPv6 은 그대로.
 *       공백·대괄호·포트는 제거. 이상한 값은 버린다. 이름 해석(DNS)은 하지 않는다.</li>
 * </ul>
 *
 * <p>신뢰 프록시는 설정 {@code dmes.client-ip.trusted-proxies} (쉼표 구분 IP 목록, CIDR 미지원).
 * 운영에서는 BFF 와 NGINX 의 IP 를 반드시 추가해야 실제 사용자 IP 가 기록된다.
 *
 * <p>보안 판정(내부망 제한 등)에는 쓰지 말고 {@code getRemoteAddr()} 만 본다.
 */
@Component
public class ClientIpResolver {

    /** CLIENT_IP 컬럼 길이. */
    static final int MAX_LENGTH = 45;

    private static final String FORWARDED_FOR = "X-Forwarded-For";
    private static final Pattern IPV4 =
            Pattern.compile("^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)$");
    private static final Pattern IPV4_WITH_PORT = Pattern.compile("^([0-9.]+):\\d{1,5}$");
    private static final Pattern IPV6_CHARS = Pattern.compile("^[0-9a-fA-F:.]+$");

    private final Set<String> trustedProxies;

    public ClientIpResolver(@Value("${dmes.client-ip.trusted-proxies:127.0.0.1,::1}") String trustedProxies) {
        this.trustedProxies = Arrays.stream(trustedProxies.split(","))
                .map(ClientIpResolver::normalize)
                .filter(s -> s != null)
                .collect(Collectors.toUnmodifiableSet());
    }

    /** 클라이언트 IP. 판별할 수 없으면 null. */
    public String resolve(HttpServletRequest request) {
        String remote = normalize(request.getRemoteAddr());
        if (remote == null) {
            return null;
        }
        if (!trustedProxies.contains(remote)) {
            return remote;
        }
        String header = request.getHeader(FORWARDED_FOR);
        if (header != null) {
            String[] parts = header.split(",");
            for (int i = parts.length - 1; i >= 0; i--) {
                String ip = normalize(parts[i]);
                if (ip != null && !trustedProxies.contains(ip)) {
                    return ip;
                }
            }
        }
        return remote;
    }

    /** 정규화한 IP 문자열. 유효한 IP 가 아니면 null. */
    static String normalize(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.trim();
        if (s.startsWith("[")) {
            int end = s.indexOf(']');
            if (end < 0) {
                return null;
            }
            String rest = s.substring(end + 1);
            if (!rest.isEmpty() && !rest.matches(":\\d{1,5}")) {
                return null;
            }
            s = s.substring(1, end).trim();
        } else {
            var m = IPV4_WITH_PORT.matcher(s);
            if (m.matches()) {
                s = m.group(1);
            }
        }
        if (s.isEmpty()) {
            return null;
        }
        if (IPV4.matcher(s).matches()) {
            return s;
        }
        if (s.indexOf(':') < 0 || !IPV6_CHARS.matcher(s).matches()) {
            return null;
        }
        try {
            // 문자 구성을 제한한 IPv6 리터럴이라 DNS 조회는 일어나지 않는다.
            InetAddress addr = InetAddress.getByName(s);
            if (addr instanceof Inet4Address) {
                return addr.getHostAddress();
            }
            if (addr instanceof Inet6Address && addr.isLoopbackAddress()) {
                return "127.0.0.1";
            }
        } catch (Exception e) {
            return null;
        }
        return s.length() <= MAX_LENGTH ? s : null;
    }
}
