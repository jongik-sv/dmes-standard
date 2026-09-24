package com.dongkuk.dmes.mdm.persistence;

import org.hibernate.boot.MetadataBuilder;
import org.hibernate.boot.spi.MetadataBuilderContributor;

/**
 * SQLite(개발자 Mac local 단독) 전용 — {@link LocalDateTimeAttributeConverter}를 등록한다(TSK-07-01
 * design.md F8, mcm {@code SqliteTemporalConverterContributor} 선례를 모델로 한다).
 *
 * <p>mdm 은 커스텀 {@code JpaConfig}가 없고 표준 Spring Boot JPA 자동설정을 쓰므로, mcm 과 달리 방언별
 * 분기 Java 코드 없이 {@code application-local.yml}(SQLite 전용 프로파일 파일)의 {@code
 * spring.jpa.properties.hibernate.metadata_builder_contributor}로만 등록한다 — {@code
 * application-local-db.yml}(MSSQL 전용)은 건드리지 않으므로 자동으로 SQLite 프로파일에만 스코프된다.
 *
 * <p>{@code autoApply=true}로 등록한다(mcm 과 같다) — 이 컨버터는 비-Id LocalDateTime 칼럼(예: {@code
 * VALID_TO})에 적용된다. 05 선분 모델 때문에 {@code VALID_FROM}처럼 {@code @Id} 구성 요소인
 * LocalDateTime 칼럼도 있는데(F6), Hibernate 7 은 {@code @Id} 속성에 {@code AttributeConverter}를
 * 거는 것을 하드 금지한다(실측 확인) — 그 칼럼들은 {@code @Convert(disableConversion=true)}로 auto-apply
 * 대상에서 명시적으로 빼고 {@link MdmLocalDateTimeIdUserType}(Hibernate 네이티브 타입 계층, JPA
 * converter 와 다른 경로라 이 제약을 받지 않는다)로 대신한다(D3).
 *
 * @see LocalDateTimeAttributeConverter
 * @see MdmLocalDateTimeIdUserType
 */
public class MdmSqliteTemporalConverterContributor implements MetadataBuilderContributor {

    @Override
    public void contribute(MetadataBuilder metadataBuilder) {
        metadataBuilder.applyAttributeConverter(LocalDateTimeAttributeConverter.class, true);
    }
}
