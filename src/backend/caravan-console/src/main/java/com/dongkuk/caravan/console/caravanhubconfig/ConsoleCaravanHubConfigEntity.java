package com.dongkuk.caravan.console.caravanhubconfig;

import com.dongkuk.caravan.console.audit.ConsoleAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * TB_CARAVAN_HUB_CONFIG JPA Entity.
 *
 * <p>caravan-console 원본 CaravanHubConfigEntity 의 caravan-console 이전체. {@link ConsoleAuditEntity} 상속으로
 * C_USR_ID/C_AT/U_USR_ID/U_AT/VER 등 audit 컬럼 자동 처리. caravan-console 원본에는 audit 컬럼이 없었지만
 * caravan-console 는 dmes 표준에 맞춤.</p>
 *
 * <p>호스트가 결정한 EMF 에 매핑. mcm 호스트 기준 cactus 의 if EMF
 * ({@code cactusEntityManagerFactoryIf}, alias {@code consoleEntityManagerFactory}) 사용 —
 * AppHostEntity 와 같은 CARAVANUSER schema (caravan 메타와 동일 DB).</p>
 */
@Entity
@Table(name = "TB_CARAVAN_HUB_CONFIG")
@IdClass(ConsoleCaravanHubConfigId.class)
@Getter
@Setter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class ConsoleCaravanHubConfigEntity extends ConsoleAuditEntity {

    @Id
    @Column(name = "TOPIC_ID")
    private String topicId;

    @Id
    @Column(name = "DIRECTION")
    private String direction;

    @Column(name = "INTEGRATION_TYPE")
    private String integrationType;

    @Column(name = "POLLING_INTERVAL_MS")
    private Integer pollingIntervalMs;

    @Column(name = "DB_TABLE_NAME")
    private String dbTableName;

    @Column(name = "DB_SCHEMA")
    private String dbSchema;

    @Column(name = "FILE_PATH")
    private String filePath;

    @Column(name = "BACKUP_PATH")
    private String backupPath;

    @Column(name = "FTP_HOST")
    private String ftpHost;

    @Column(name = "FTP_PORT")
    private Integer ftpPort;

    @Column(name = "FTP_USER")
    private String ftpUser;

    @Column(name = "FTP_PASSWORD")
    private String ftpPassword;

    @Column(name = "HTTP_URL")
    private String httpUrl;

    @Column(name = "HTTP_METHOD")
    private String httpMethod;

    @Column(name = "HTTP_HEADERS")
    private String httpHeaders;

    @Column(name = "USE_YN")
    private String useYn;
}
