package com.dongkuk.dmes.mcm.widget.collect;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 정시 수집 설정 — yml prefix {@code dmes.widget.collect}(스펙 2026-10-05 정시 수집 §4).
 *
 * <pre>{@code
 * dmes:
 *   widget:
 *     collect:
 *       enabled: true            # false 면 수집·보관 삭제를 모두 하지 않는다
 *       allowed-hosts:           # http 원천이 부를 수 있는 호스트(정확 일치, 대소문자 무시, 포트는 허용). 비어 있으면 http 원천은 모두 거절
 *         - api.example.com
 * }</pre>
 */
@ConfigurationProperties(prefix = "dmes.widget.collect")
public class WidgetCollectProperties {

    private boolean enabled = true;

    private List<String> allowedHosts = new ArrayList<>();

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public List<String> getAllowedHosts() { return allowedHosts; }
    public void setAllowedHosts(List<String> allowedHosts) { this.allowedHosts = allowedHosts == null ? new ArrayList<>() : allowedHosts; }

    /** host 가 허용 목록에 정확히 있는가(대소문자 무시). 목록이 비면 모두 거절. */
    public boolean isAllowedHost(String host) {
        if (host == null || host.isBlank()) return false;
        String h = host.strip().toLowerCase(Locale.ROOT);
        for (String allowed : allowedHosts) {
            if (allowed != null && allowed.strip().toLowerCase(Locale.ROOT).equals(h)) return true;
        }
        return false;
    }
}
