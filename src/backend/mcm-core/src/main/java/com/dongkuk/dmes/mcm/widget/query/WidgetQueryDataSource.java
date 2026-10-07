package com.dongkuk.dmes.mcm.widget.query;

import javax.sql.DataSource;
import org.springframework.beans.factory.DisposableBean;

/**
 * 쿼리 위젯 실행기가 쓸 DataSource — {@link WidgetQueryConfig} 가 만든다. 일부러 {@link DataSource} 형 빈으로 두지 않는다:
 * 형으로 DataSource 를 받는 다른 빈(JPA·업무 코드)이 실행기 전용(읽기 계정) 연결을 집어 가지 않게.
 * 직결 풀을 직접 만든 경우만 종료 때 닫는다(JNDI·앱 기본 DataSource 는 주인이 따로 있다).
 */
public final class WidgetQueryDataSource implements DisposableBean {

    private final DataSource dataSource;
    private final boolean dedicated;
    private final boolean requireDedicated;
    private final AutoCloseable owned;

    private WidgetQueryDataSource(DataSource dataSource, boolean dedicated, boolean requireDedicated, AutoCloseable owned) {
        if (dataSource == null) throw new IllegalArgumentException("DataSource 가 없습니다");
        this.dataSource = dataSource;
        this.dedicated = dedicated;
        this.requireDedicated = requireDedicated;
        this.owned = owned;
    }

    /** 앱 기본 DataSource 를 그대로 쓴다(전용 설정 없음). */
    public static WidgetQueryDataSource shared(DataSource dataSource) {
        return shared(dataSource, false);
    }

    /**
     * 앱 기본 DataSource 를 그대로 쓴다. {@code requireDedicated}(dmes.widget.query.require-dedicated)가 true 면
     * 실행기는 이 DataSource 로 실행하지 않고 거절한다.
     */
    public static WidgetQueryDataSource shared(DataSource dataSource, boolean requireDedicated) {
        return new WidgetQueryDataSource(dataSource, false, requireDedicated, null);
    }

    /** 실행기 전용 DataSource. {@code owned} 는 종료 때 닫을 풀(JNDI 면 null). */
    public static WidgetQueryDataSource dedicated(DataSource dataSource, AutoCloseable owned) {
        return new WidgetQueryDataSource(dataSource, true, false, owned);
    }

    public DataSource dataSource() { return dataSource; }

    /** 전용 DataSource 설정(dmes.widget.query.datasource.*)으로 만든 것인지. */
    public boolean dedicated() { return dedicated; }

    /** 전용 DataSource 를 반드시 쓰라는 설정(dmes.widget.query.require-dedicated)인지. */
    public boolean requireDedicated() { return requireDedicated; }

    @Override
    public void destroy() throws Exception {
        if (owned != null) owned.close();
    }
}
