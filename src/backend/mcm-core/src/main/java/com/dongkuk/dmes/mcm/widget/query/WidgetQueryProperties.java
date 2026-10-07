package com.dongkuk.dmes.mcm.widget.query;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 쿼리 위젯 실행기 설정 — yml prefix {@code dmes.widget.query}(스펙 2026-10-02-widget-admin-generic §7.3).
 *
 * <pre>{@code
 * dmes:
 *   widget:
 *     query:
 *       require-dedicated: false     # true 면 전용 DataSource 가 없을 때 어느 DB 든 실행을 거절한다(운영 Oracle 권장)
 *       datasource:                  # 선택 — 비우면 앱 기본 DataSource
 *         jndi-name: ""              # WildFly 등 컨테이너 풀(있으면 이것만 쓴다)
 *         url: ""                    # 직결(jndi-name 이 없을 때) — 풀 이름 widget-query
 *         username: ""
 *         password: ${WIDGET_QUERY_DS_PASSWORD:}
 *         driver-class-name: ""
 *         maximum-pool-size: 5
 * }</pre>
 * 운영에서는 여기에 <b>읽기 권한만 가진 DB 계정</b>을 붙인다 — 실행기의 읽기 전용 강제(연결 readOnly·늘 롤백·방언별 보강)는
 * 보조 방어선이고, SQL Server 처럼 읽기 전용 트랜잭션이 없는 DB 는 계정 권한이 유일한 막이다.
 * Oracle 은 읽기 전용 트랜잭션이 있어도 이미 있는 자율 트랜잭션 함수의 쓰기와 DB 링크 너머의 실행을 막지 못한다(2026-10-07 실측) —
 * 운영에서는 {@code require-dedicated: true} 로 전용 DataSource 없이 실행하지 않게 한다(oracle-1007 c3 정책 B).
 * 비밀번호는 환경변수로만 넣고, {@link #toString()} 은 비밀번호·주소를 보이지 않는다(로그 유출 방지 — 주소에도 비밀번호가 들어갈 수 있다).
 */
@ConfigurationProperties(prefix = "dmes.widget.query")
public class WidgetQueryProperties {

    private final Datasource datasource = new Datasource();
    /** true 면 전용 DataSource(datasource.*)가 없을 때 DB 갈래와 상관없이 실행을 거절한다. 기본 false(로컬·시험). */
    private boolean requireDedicated = false;

    public Datasource getDatasource() { return datasource; }
    public boolean isRequireDedicated() { return requireDedicated; }
    public void setRequireDedicated(boolean requireDedicated) { this.requireDedicated = requireDedicated; }

    @Override
    public String toString() {
        return "WidgetQueryProperties{requireDedicated=" + requireDedicated + ", datasource=" + datasource + "}";
    }

    /** 실행기 전용 DataSource. jndi-name 이 있으면 그것, 없고 url 이 있으면 직결 풀, 둘 다 없으면 앱 기본 DataSource. */
    public static class Datasource {

        private String jndiName = "";
        private String url = "";
        private String username = "";
        private String password = "";
        private String driverClassName = "";
        /** 직결 풀 최대 연결 수(기본 5). 0 이하면 기본값. */
        private int maximumPoolSize = 5;

        public String getJndiName() { return jndiName; }
        public void setJndiName(String jndiName) { this.jndiName = jndiName; }
        public String getUrl() { return url; }
        public void setUrl(String url) { this.url = url; }
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
        public String getDriverClassName() { return driverClassName; }
        public void setDriverClassName(String driverClassName) { this.driverClassName = driverClassName; }
        public int getMaximumPoolSize() { return maximumPoolSize; }
        public void setMaximumPoolSize(int maximumPoolSize) { this.maximumPoolSize = maximumPoolSize; }

        @Override
        public String toString() {
            return "Datasource{jndiName=" + (blank(jndiName) ? "(없음)" : "(설정됨)")
                    + ", url=" + (blank(url) ? "(없음)" : "(설정됨)")
                    + ", username=" + (blank(username) ? "(없음)" : "(설정됨)")
                    + ", password=" + (blank(password) ? "(없음)" : "(설정됨)")
                    + ", driverClassName=" + driverClassName + ", maximumPoolSize=" + maximumPoolSize + "}";
        }

        private static boolean blank(String s) {
            return s == null || s.isBlank();
        }
    }
}
