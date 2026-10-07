package com.dongkuk.dmes.mcm.common.persistence;

import org.hibernate.boot.MetadataBuilder;
import org.hibernate.boot.spi.MetadataBuilderContributor;

/**
 * SQLite(개발자 Mac local 단독) 전용 — LocalDate/LocalDateTime 을 문자열로 저장하는 컨버터를 auto-apply 한다.
 *
 * <p>운영(MSSQL)은 네이티브 {@code date}/{@code datetime2} 를 쓰므로 컨버터를 전역 auto-apply 하지 않는다.
 * 그러나 SQLite 커뮤니티 dialect + xerial 드라이버는 네이티브 temporal 라운드트립에 결함이 있어 화면 저장
 * datetime 이 epoch millis(정수)로 새어 시드(ISO text)·조회와 형식이 어긋난다(mpn 의 캘린더 누락 사례와 동일).
 *
 * <p>mcm primary EMF 는 {@code com.dongkuk.dmes.mcm.config.JpaConfig} 가 명시 빌드하므로 application.yml 의
 * {@code spring.jpa.properties.hibernate.metadata_builder_contributor} 가 적용되지 않는다. 따라서 JpaConfig 가
 * SQLite dialect 일 때만 본 contributor 를 {@code hibernate.metadata_builder_contributor} 로 직접 등록한다
 * (MSSQL/dev/prod 는 미등록 — 동료 환경 무영향).
 *
 * @see LocalDateAttributeConverter
 * @see LocalDateTimeAttributeConverter
 * @deprecated Oracle 단일화(oracle-1007). mcm 모듈 호출을 ora-mcm-app 이 없앤 뒤 ora-base b8 에서 지운다.
 */
@Deprecated
public class SqliteTemporalConverterContributor implements MetadataBuilderContributor {

    @Override
    public void contribute(MetadataBuilder metadataBuilder) {
        metadataBuilder.applyAttributeConverter(LocalDateAttributeConverter.class, true);
        metadataBuilder.applyAttributeConverter(LocalDateTimeAttributeConverter.class, true);
    }
}
