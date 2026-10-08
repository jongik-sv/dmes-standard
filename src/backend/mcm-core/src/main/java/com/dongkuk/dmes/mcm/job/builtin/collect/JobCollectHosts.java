package com.dongkuk.dmes.mcm.job.builtin.collect;

import com.dongkuk.dmes.mcm.job.JobProperties;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;

/** COLLECT(http) 원천의 허용 호스트 — 새 키 {@code dmes.job.http.allowed-hosts} 와 옛 키 {@code dmes.widget.collect.allowed-hosts}(있으면 warn 과 함께 함께 읽는다). */
public final class JobCollectHosts {

    private static final Logger log = LoggerFactory.getLogger(JobCollectHosts.class);
    static final String LEGACY_KEY = "dmes.widget.collect.allowed-hosts";

    private JobCollectHosts() {}

    public static List<String> resolve(JobProperties props, Environment env) {
        List<String> all = new ArrayList<>(props.getHttp().getAllowedHosts());
        List<String> legacy = Binder.get(env).bind(LEGACY_KEY, Bindable.listOf(String.class)).orElse(List.of());
        if (!legacy.isEmpty()) {
            log.warn("{} 는 dmes.job.http.allowed-hosts 로 옮기세요 — 지금은 두 키를 함께 읽습니다", LEGACY_KEY);
            all.addAll(legacy);
        }
        return List.copyOf(all);
    }

    /** 정확 일치(대소문자 무시, 포트 제외한 호스트). 목록이 비면 모두 거절. */
    public static Predicate<String> matcher(List<String> allowed) {
        return host -> {
            if (host == null || host.isBlank()) return false;
            String h = host.strip().toLowerCase(Locale.ROOT);
            for (String a : allowed) {
                if (a != null && a.strip().toLowerCase(Locale.ROOT).equals(h)) return true;
            }
            return false;
        };
    }
}
