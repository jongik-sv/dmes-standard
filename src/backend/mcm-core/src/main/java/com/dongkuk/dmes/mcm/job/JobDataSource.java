package com.dongkuk.dmes.mcm.job;

import com.zaxxer.hikari.HikariDataSource;
import javax.sql.DataSource;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 예약 작업 표(MCMAPUSER.TB_MCM_JOB_*)를 읽고 쓰는 전용 연결 — {@link JobConfig} 가 만든다. 일부러 {@link DataSource} 형 빈으로 두지 않는다:
 * 형으로 DataSource 를 받는 다른 빈(JPA·업무 코드)이 JOB 전용 연결을 집어 가지 않게. 직결 풀을 직접 만든 경우만 종료 때 닫는다
 * (JNDI·앱 기본 DataSource 는 주인이 따로 있다). JOB 표용 JPA 엔티티는 두지 않고 이 템플릿으로만 SQL 을 쓴다.
 */
public final class JobDataSource implements DisposableBean {

    private final DataSource dataSource;
    private final boolean dedicated;
    private final AutoCloseable owned;
    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate namedJdbc;
    private final TransactionTemplate tx;

    private JobDataSource(DataSource dataSource, boolean dedicated, AutoCloseable owned) {
        if (dataSource == null) throw new IllegalArgumentException("DataSource 가 없습니다");
        this.dataSource = dataSource;
        this.dedicated = dedicated;
        this.owned = owned;
        this.jdbc = new JdbcTemplate(dataSource);
        this.namedJdbc = new NamedParameterJdbcTemplate(jdbc);
        this.tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    }

    /** 앱 기본 DataSource 를 그대로 쓴다(전용 설정 없음). */
    public static JobDataSource shared(DataSource dataSource) {
        return new JobDataSource(dataSource, false, null);
    }

    /** 직결 풀. 종료 때 풀을 닫는다. */
    public static JobDataSource dedicated(HikariDataSource dataSource) {
        return new JobDataSource(dataSource, true, dataSource);
    }

    /** 컨테이너(JNDI) 풀. 풀 주인이 따로 있어 닫지 않는다. */
    public static JobDataSource jndi(DataSource dataSource) {
        return new JobDataSource(dataSource, true, null);
    }

    public JdbcTemplate jdbc() { return jdbc; }

    /** IN 목록 등 이름 붙은 매개변수용. {@link #jdbc()} 와 같은 연결을 쓴다. */
    public NamedParameterJdbcTemplate namedJdbc() { return namedJdbc; }

    /** 이 연결에 묶인 트랜잭션 템플릿 — 선점·이력 갱신 같은 짧은 쓰기를 한 단위로 묶는다. */
    public TransactionTemplate tx() { return tx; }

    /** 전용 연결(직결 또는 JNDI)인지. false 면 앱 기본 DataSource 를 함께 쓴다. */
    public boolean isDedicated() { return dedicated; }

    @Override
    public void destroy() throws Exception {
        if (owned != null) owned.close();
    }
}
