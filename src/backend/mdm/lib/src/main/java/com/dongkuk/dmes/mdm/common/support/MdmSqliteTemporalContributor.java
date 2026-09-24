package com.dongkuk.dmes.mdm.common.support;

import org.hibernate.boot.MetadataBuilder;
import org.hibernate.boot.spi.MetadataBuilderContributor;

/**
 * SQLite(local) 전용 — {@link MdmSqliteLocalDateTimeConverter} 를 auto-apply 로 등록한다(TSK-08-01 D5).
 *
 * <p>application-local.yml 의 {@code spring.jpa.properties.hibernate.metadata_builder_contributor} 로만 등록한다
 * (mls 선례: Spring Boot 기본 EMF). local-db(MSSQL)·wildfly 프로파일은 local 을 포함하지 않으므로 MSSQL 에는
 * 켜지지 않는다. MSSQL 은 Hibernate 기본 {@code DATETIME2} 매핑을 쓴다.
 */
public class MdmSqliteTemporalContributor implements MetadataBuilderContributor {

    @Override
    public void contribute(MetadataBuilder metadataBuilder) {
        metadataBuilder.applyAttributeConverter(MdmSqliteLocalDateTimeConverter.class, true);
    }
}
