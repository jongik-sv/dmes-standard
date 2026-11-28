/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: 사람별 계정 상태 캐시 — 비활성·퇴직·기한 밖이면 쓰던 세션을 다음 요청부터 끊는다(D2)
 */
package com.dongkuk.dmes.mcm.security.account;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 요청마다 DB 를 읽지 않도록 계정 상태를 사람별로 10분 둔다(권한 캐시 {@code UserPermCache} 와 같은 TTL).
 *
 * <p>상태를 바꾸는 저장(비활성·다시 사용·퇴직·재생성·인사 처리)은 그 사람의 {@link #invalidate} 를 부른다 →
 * 같은 서버의 다음 요청부터 바로 반영된다. 서버가 여러 대면 다른 서버는 TTL(최대 10분) 안에 반영된다(D2 추천안).
 *
 * <p>계정을 못 읽으면(DB 오류) 막지 않는다 — 인증 자체는 JWT 가 이미 확인했다. 계정 행이 없으면 끊는다.
 */
@Component
public class AccountStatusCache {

    private static final Logger log = LoggerFactory.getLogger(AccountStatusCache.class);
    static final long TTL_MS = 10L * 60L * 1000L;
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final McmAccountReader reader;
    private final Clock clock;
    private final Map<String, Entry> cache = new ConcurrentHashMap<>();

    /** 스프링이 쓰는 생성자. 시계를 받는 생성자는 테스트용이다. */
    @Autowired
    public AccountStatusCache(McmAccountReader reader) {
        this(reader, Clock.system(KST));
    }

    AccountStatusCache(McmAccountReader reader, Clock clock) {
        this.reader = reader;
        this.clock = clock;
    }

    /** 쓰던 세션을 끊어야 하나. */
    public boolean shouldCut(String userId) {
        if (userId == null || userId.isBlank()) return false;
        long now = clock.millis();
        Entry e = cache.get(userId);
        if (e != null && e.expiresAt > now) return e.cut;
        Boolean cut = load(userId);
        if (cut == null) return false;
        cache.put(userId, new Entry(cut, now + TTL_MS));
        return cut;
    }

    private Boolean load(String userId) {
        try {
            return reader.find(userId)
                    .map(a -> a.state(LocalDate.now(clock.withZone(KST))).cutsSession())
                    .orElse(true);
        } catch (RuntimeException ex) {
            log.warn("[AccountStatusCache] 계정 상태를 읽지 못해 이번 요청은 통과시킨다 — user={} : {}", userId, ex.getMessage());
            return null;
        }
    }

    /**
     * 그 사람의 캐시를 비운다 — 상태를 바꾼 저장 뒤 부른다. 트랜잭션 안이면 지금 한 번, 커밋 뒤 한 번 더 비운다
     * (커밋 전에 다른 요청이 옛 상태를 다시 읽어 10분 동안 들고 있지 않게).
     */
    public void invalidate(String userId) {
        if (userId == null) return;
        cache.remove(userId);
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                    new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            cache.remove(userId);
                        }
                    });
        }
    }

    /** 전부 비운다. */
    public void invalidateAll() {
        cache.clear();
    }

    private record Entry(boolean cut, long expiresAt) {}
}
