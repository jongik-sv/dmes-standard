package com.dongkuk.dmes.cactus.dmom;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * dmom 전문 송신 설정 프로퍼티. {@code cactus.dmom.*} 바인딩.
 *
 * <pre>
 * cactus:
 *   dmom:
 *     enabled: true                          # 디폴트 true
 *     biz-template: sqlSessionTemplateBiz    # 업무 tx 커넥션 템플릿 (DB 아웃박스 INSERT + 포맷/TC_ERROR 조회)
 *     error-tx-manager: transactionManager   # TC_ERROR REQUIRES_NEW 대상 (HTTP 실패 적재용)
 *     default-send-table-prefix: "IF_"       # SEND_TABLE_ID 미지정 시 IF_&lt;INTERFACE_ID&gt;
 * </pre>
 *
 * <p>상세 설계: {@code docs/cactus/002_전문송수신(포멧,오아시스,메시지태스크)/02_전문송신_상세설계.md} §7.
 */
@ConfigurationProperties(prefix = "cactus.dmom")
public class DmomProperties {

    /** dmom 송신 자동 활성 여부 (디폴트 true). */
    private boolean enabled = true;

    /** 업무 tx DataSource 에 바인딩된 SqlSessionTemplate 빈 이름 (포맷 조회 + IF_* INSERT + TC_ERROR). */
    private String bizTemplate = "sqlSessionTemplateBiz";

    /** TC_ERROR(HTTP 실패) 적재용 REQUIRES_NEW 트랜잭션 매니저 빈 이름. */
    private String errorTxManager = "transactionManager";

    /** SEND_TABLE_ID 미지정 시 사용할 접두사 ({@code IF_} + INTERFACE_ID). */
    private String defaultSendTablePrefix = "IF_";

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public String getBizTemplate() { return bizTemplate; }
    public void setBizTemplate(String bizTemplate) { this.bizTemplate = bizTemplate; }

    public String getErrorTxManager() { return errorTxManager; }
    public void setErrorTxManager(String errorTxManager) { this.errorTxManager = errorTxManager; }

    public String getDefaultSendTablePrefix() { return defaultSendTablePrefix; }
    public void setDefaultSendTablePrefix(String defaultSendTablePrefix) {
        this.defaultSendTablePrefix = defaultSendTablePrefix;
    }
}
