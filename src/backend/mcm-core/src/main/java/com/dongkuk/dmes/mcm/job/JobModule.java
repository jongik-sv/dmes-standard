package com.dongkuk.dmes.mcm.job;

import java.util.Locale;
import java.util.Optional;
import org.springframework.core.env.Environment;

/** 예약 작업이 속하는 모듈 키 — 표의 {@code MODULE_CD} 와 같다. */
public enum JobModule {
    MCM, MDM, MPP, MLS, MQC, MPN;

    /** 대소문자를 무시하고 찾는다. 없거나 모르는 값이면 {@link IllegalArgumentException}. */
    public static JobModule of(String value) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("모듈 키가 비어 있습니다");
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("알 수 없는 모듈 키: " + value.trim());
        }
    }

    /**
     * 이 앱의 모듈 — {@code dmes.job.module} 이 있으면 그것, 없으면 {@code spring.application.name} 의 첫 '-' 앞부분.
     * 판정할 수 없으면 {@link IllegalStateException}.
     */
    public static JobModule resolve(JobProperties props, Environment env) {
        return tryResolve(props, env).orElseThrow(() -> new IllegalStateException(
                "예약 작업 모듈을 판정할 수 없습니다 — dmes.job.module 을 MCM|MDM|MPP|MLS|MQC|MPN 중 하나로 지정하세요"));
    }

    /**
     * {@link #resolve} 와 같으나 판정할 수 없으면 예외 대신 비어 있는 결과를 돌려준다. 지금 기동 경로는 쓰지 않는다 — {@code JobAgentConfig} 가
     * {@link #resolve} 를 불러 판정에 실패하면 기동을 실패시킨다(빠른 실패).
     */
    public static Optional<JobModule> tryResolve(JobProperties props, Environment env) {
        String configured = props.getModule();
        if (configured != null && !configured.isBlank()) {
            try {
                return Optional.of(of(configured));
            } catch (IllegalArgumentException e) {
                return Optional.empty();
            }
        }
        String name = env.getProperty("spring.application.name");
        if (name == null || name.isBlank()) return Optional.empty();
        String head = name.trim();
        int dash = head.indexOf('-');
        if (dash > 0) head = head.substring(0, dash);
        try {
            return Optional.of(of(head));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
