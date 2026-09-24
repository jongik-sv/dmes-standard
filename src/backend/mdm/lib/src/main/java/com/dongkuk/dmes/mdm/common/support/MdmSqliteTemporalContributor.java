package com.dongkuk.dmes.mdm.common.support;

import org.hibernate.boot.MetadataBuilder;
import org.hibernate.boot.spi.MetadataBuilderContributor;

/**
 * SQLite(local 프로파일) 전용 — mdm 엔티티의 {@code LocalDateTime} 필드에 {@link MdmSqliteLocalDateTimeConverter} 를
 * auto-apply 한다(TSK-06-01 D7). {@code application-local.yml} 의
 * {@code spring.jpa.properties.hibernate.metadata_builder_contributor} 로만 등록한다 — {@code application.yml}·
 * {@code application-local-db.yml}(MSSQL)에는 두지 않아 운영 {@code DATETIME2} 매핑에 영향이 없다(mls 선례와 같은 구조).
 *
 * <p>mdm 은 Spring Boot 자동 EMF 를 쓰므로(mcm 처럼 {@code JpaConfig} 로 직접 빌드하지 않는다) 설정 키가 그대로
 * Hibernate 에 전달된다. 실제 적용은 {@code MdmMasterCodeEntityJpaRoundtripTest} 의 {@code typeof(APPLY_FROM)='text'}
 * 가 증명한다. {@code Instant}(감사 {@code C_AT})에는 적용되지 않는다(D-038 그대로).
 */
public class MdmSqliteTemporalContributor implements MetadataBuilderContributor {

    @Override
    public void contribute(MetadataBuilder metadataBuilder) {
        metadataBuilder.applyAttributeConverter(MdmSqliteLocalDateTimeConverter.class, true);
    }
}
