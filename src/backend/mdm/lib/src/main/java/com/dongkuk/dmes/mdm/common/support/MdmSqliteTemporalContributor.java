package com.dongkuk.dmes.mdm.common.support;

import org.hibernate.boot.MetadataBuilder;
import org.hibernate.boot.spi.MetadataBuilderContributor;

/**
 * SQLite(local) 전용 — {@link MdmSqliteLocalDateTimeConverter} 를 mdm 엔티티의 {@code LocalDateTime} 필드에
 * auto-apply 로 등록한다(TSK-08-01 D5, TSK-06-01 D7).
 *
 * <p>application-local.yml 의 {@code spring.jpa.properties.hibernate.metadata_builder_contributor} 로만 등록한다
 * (mls 선례: Spring Boot 기본 EMF — mcm 처럼 {@code JpaConfig} 로 직접 빌드하지 않으므로 설정 키가 그대로 Hibernate 에
 * 전달된다). wildfly 프로파일은 local 을 포함하지 않으므로 SQLite 가 아닌 DB 에는 켜지지 않는다(그쪽은
 * Hibernate 기본 일시 매핑을 쓴다). {@code Instant}(감사 {@code C_AT})에는 적용되지 않는다(D-038 그대로).
 */
public class MdmSqliteTemporalContributor implements MetadataBuilderContributor {

    @Override
    public void contribute(MetadataBuilder metadataBuilder) {
        metadataBuilder.applyAttributeConverter(MdmSqliteLocalDateTimeConverter.class, true);
    }
}
