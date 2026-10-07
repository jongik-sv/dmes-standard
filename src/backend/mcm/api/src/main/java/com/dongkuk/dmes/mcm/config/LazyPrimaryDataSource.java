package com.dongkuk.dmes.mcm.config;

import javax.sql.DataSource;
import org.springframework.jdbc.datasource.LazyConnectionDataSourceProxy;

/**
 * mcm 기본 DataSource 의 연결 지연 획득 감싸개(docs/oracle-1007/design-mcm-lazy-ds.md, {@code dmes.datasource.lazy-connection}).
 * 트랜잭션이 시작돼도 물리 연결은 첫 SQL 때 풀에서 받는다 — OASIS txBiz(READ_COMMITTED)가 시작하자마자 연결을 잡아, SQL 없이
 * 바깥을 내려놓고 LLM 을 기다리는 위젯 채팅 같은 경로가 그동안 연결을 쥐는 일을 막는다. 격리 수준·autoCommit·readOnly 는 기록해 두었다가
 * 실제 연결을 받을 때 적용한다. 기본값(autoCommit·격리 수준)은 처음 연결을 줄 때 대상 풀의 연결 하나로 한 번 감지한다.
 * <p>{@link LazyConnectionDataSourceProxy} 에는 {@code close} 가 없어 스프링이 종료 때 대상 풀을 닫지 않는다. 그래서 직접 만든 풀
 * ({@code owned})이면 {@link #close()} 가 그 풀을 닫는다. JNDI(WildFly 컨테이너 풀)는 컨테이너 소유라 {@code owned} 없이 감싸고 닫지 않는다.
 */
public class LazyPrimaryDataSource extends LazyConnectionDataSourceProxy implements AutoCloseable {

    private final AutoCloseable owned;

    /**
     * @param target 감쌀 기본 DataSource
     * @param owned  종료 때 닫을 풀(직접 만든 Hikari) — JNDI 면 null
     */
    public LazyPrimaryDataSource(DataSource target, AutoCloseable owned) {
        super(target);
        this.owned = owned;
    }

    /** 직접 만든 풀이면 닫는다(스프링 @Bean 종료 메서드 추론이 이 메서드를 부른다). */
    @Override
    public void close() throws Exception {
        if (owned != null) owned.close();
    }
}
