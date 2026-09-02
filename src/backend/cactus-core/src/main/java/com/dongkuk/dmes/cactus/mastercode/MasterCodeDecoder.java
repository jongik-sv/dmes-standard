package com.dongkuk.dmes.cactus.mastercode;

/**
 * 마스터 코드 디코딩 SPI. {@code (groupCd, itemCd)} 쌍을 사람이 읽을 수 있는 명칭으로 변환.
 *
 * <p>{@link MasterCodeMybatisInterceptor} 가 MyBatis SELECT 결과의 LoV/_CD_NM/_STS_NM
 * 컬럼을 자동 채울 때 호출.
 *
 * <p>cactus-core 가 {@link DefaultMasterCodeDecoder} 를 기본 구현으로 제공
 * ({@code @ConditionalOnMissingBean}). 모듈 고유 룰(외부 시스템 마스터 코드 등) 이
 * 있으면 {@code @Bean MasterCodeDecoder} 로 override.
 *
 * <p>film {@code com.dongkuk.dmes.film.cmn.master.MasterCodeDecoder} 와 동일 시그니처.
 */
public interface MasterCodeDecoder {

    /**
     * 코드값을 사람이 읽을 수 있는 명칭으로 변환한다.
     *
     * @param value     코드값 (itemCd, 예: "01", "Y")
     * @param groupCd   그룹 코드 (예: "USE_YN", "ORDER_STATUS")
     * @return 명칭 (못 찾으면 {@code null} 또는 빈 문자열)
     */
    String decode(String value, String groupCd);

    /**
     * 주어진 코드가 등록된 마스터 코드 그룹인지 판단한다.
     * SELECT 결과의 MASTER_CODE 컬럼이 알려진 그룹인지 확인할 때 사용.
     */
    boolean isMasterCode(String groupCd);
}
