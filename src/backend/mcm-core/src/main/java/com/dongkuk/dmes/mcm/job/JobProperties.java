package com.dongkuk.dmes.mcm.job;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 예약 작업 스케줄러 설정 — yml prefix {@code dmes.job}(설계 2026-10-08-job-scheduler-design).
 *
 * <pre>{@code
 * dmes:
 *   job:
 *     enabled: true             # false 면 이 앱은 예약 작업을 돌리지 않는다
 *     module: ""                # 비우면 spring.application.name 에서 판정
 *     server-name: ""           # 비우면 host:app:pid
 *     pool-size: 4              # 작업 실행 스레드 수
 *     max-claim-per-tick: 20    # 한 틱에 선점하는 최대 회차 수
 *     ver-poll-sec: 10          # 정의 버전 폴링 주기(초)
 *     datasource:               # 선택 — 비우면 앱 기본 DataSource
 *       jndi-name: ""
 *       url: ""
 *       username: ""
 *       password: ${JOB_DS_PASSWORD:}
 *       maximum-pool-size: 2
 *     http:
 *       allowed-hosts: []       # HTTP 유형 작업이 호출할 수 있는 호스트
 *     collect:
 *       enabled: true
 * }</pre>
 * 비밀번호는 환경변수로만 넣고, {@link Datasource#toString()} 은 비밀번호·주소를 보이지 않는다.
 */
@ConfigurationProperties(prefix = "dmes.job")
public class JobProperties {

    private boolean enabled = true;
    /** 비면 spring.application.name 대문자. */
    private String module;
    /** 비면 host:app:pid. */
    private String serverName;
    private int poolSize = 4;
    private int maxClaimPerTick = 20;
    private int verPollSec = 10;
    private final Datasource datasource = new Datasource();
    private final Http http = new Http();
    private final Collect collect = new Collect();

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getModule() { return module; }
    public void setModule(String module) { this.module = module; }
    public String getServerName() { return serverName; }
    public void setServerName(String serverName) { this.serverName = serverName; }
    public int getPoolSize() { return poolSize; }
    public void setPoolSize(int poolSize) { this.poolSize = poolSize; }
    public int getMaxClaimPerTick() { return maxClaimPerTick; }
    public void setMaxClaimPerTick(int maxClaimPerTick) { this.maxClaimPerTick = maxClaimPerTick; }
    public int getVerPollSec() { return verPollSec; }
    public void setVerPollSec(int verPollSec) { this.verPollSec = verPollSec; }
    public Datasource getDatasource() { return datasource; }
    public Http getHttp() { return http; }
    public Collect getCollect() { return collect; }

    /** JOB 전용 DataSource. jndi-name 이 있으면 그것, 없고 url 이 있으면 직결 풀, 둘 다 없으면 앱 기본 DataSource. */
    public static class Datasource {
        private String url;
        private String username;
        private String password;
        private String jndiName;
        private int maximumPoolSize = 2;

        public String getUrl() { return url; }
        public void setUrl(String url) { this.url = url; }
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
        public String getJndiName() { return jndiName; }
        public void setJndiName(String jndiName) { this.jndiName = jndiName; }
        public int getMaximumPoolSize() { return maximumPoolSize; }
        public void setMaximumPoolSize(int maximumPoolSize) { this.maximumPoolSize = maximumPoolSize; }

        @Override
        public String toString() {
            return "Datasource{jndiName=" + jndiName + ", maximumPoolSize=" + maximumPoolSize + "}";
        }
    }

    public static class Http {
        private List<String> allowedHosts = new ArrayList<>();

        public List<String> getAllowedHosts() { return allowedHosts; }
        public void setAllowedHosts(List<String> allowedHosts) { this.allowedHosts = allowedHosts; }
    }

    public static class Collect {
        private boolean enabled = true;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
    }
}
