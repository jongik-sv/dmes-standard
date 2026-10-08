package com.dongkuk.dmes.mcm.job;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 예약 작업 설정 — yml prefix {@code dmes.job}(설계 §4.7).
 *
 * <pre>{@code
 * dmes:
 *   job:
 *     module: ""                 # 비우면 spring.application.name 의 첫 '-' 앞부분(대문자)
 *     schema: MCMAPUSER          # 모듈 쪽 SQL 의 JOB 표 스키마 접두
 *     pool-size: 4               # 모듈 앱의 작업 실행 스레드 수(대기열 0)
 *     server-name: ""            # 비우면 호스트:앱이름:pid
 *     agent:
 *       enabled: true            # false 면 이 앱은 /internal/job/run 을 받지 않는다(404)
 *     server:
 *       enabled: false           # MCM 앱 application.yml 에서만 true — 판정·선점·호출·관리 빈
 *       batch-size: 50           # 한 번에 선점하는 최대 작업 수
 *     modules:                   # MCM 이 모듈을 부를 주소(기본값은 기존 <모듈>_WAS_URL 환경 변수)
 *       mdm: { base-url: "${MDM_WAS_URL:http://localhost:8096}" }
 *     http:
 *       allowed-hosts: []        # COLLECT(http) 원천이 부를 수 있는 호스트(정확 일치)
 *     collect:
 *       enabled: true            # false 면 COLLECT 작업은 선점 후보에서 빠지고 mcm.collectPurge 는 아무것도 하지 않는다
 * }</pre>
 */
@ConfigurationProperties(prefix = "dmes.job")
public class JobProperties {

    private String module;
    private String schema = "MCMAPUSER";
    private int poolSize = 4;
    private String serverName;
    private final Agent agent = new Agent();
    private final Server server = new Server();
    private final Map<String, ModuleTarget> modules = new LinkedHashMap<>();
    private final Http http = new Http();
    private final Collect collect = new Collect();

    public String getModule() { return module; }
    public void setModule(String module) { this.module = module; }
    public String getSchema() { return schema; }
    public void setSchema(String schema) { this.schema = schema; }
    public int getPoolSize() { return poolSize; }
    public void setPoolSize(int poolSize) { this.poolSize = poolSize; }
    public String getServerName() { return serverName; }
    public void setServerName(String serverName) { this.serverName = serverName; }
    public Agent getAgent() { return agent; }
    public Server getServer() { return server; }
    public Map<String, ModuleTarget> getModules() { return modules; }
    public Http getHttp() { return http; }
    public Collect getCollect() { return collect; }

    public static class Agent {
        private boolean enabled = true;
        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
    }

    public static class Server {
        private boolean enabled = false;
        private int batchSize = 50;
        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public int getBatchSize() { return batchSize; }
        public void setBatchSize(int batchSize) { this.batchSize = batchSize; }
    }

    public static class ModuleTarget {
        private String baseUrl;
        public String getBaseUrl() { return baseUrl; }
        public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    }

    public static class Http {
        private List<String> allowedHosts = new ArrayList<>();
        public List<String> getAllowedHosts() { return allowedHosts; }
        public void setAllowedHosts(List<String> allowedHosts) { this.allowedHosts = allowedHosts == null ? new ArrayList<>() : allowedHosts; }
    }

    public static class Collect {
        private boolean enabled = true;
        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
    }
}
