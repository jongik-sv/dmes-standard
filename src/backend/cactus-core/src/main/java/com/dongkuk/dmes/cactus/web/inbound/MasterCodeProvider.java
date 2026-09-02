package com.dongkuk.dmes.cactus.web.inbound;

import java.util.List;

/**
 * LoV master code 조회 확장점.
 *
 * <p>{@code /lov/master/{code}/{group}} 엔드포인트가 호출되면 {@link LovController} 가
 * 본 인터페이스를 통해 마스터 코드 목록을 조회한다. 마스터 코드 저장소(DB 테이블, 캐시 등)는
 * 프로젝트마다 다르므로 cactus-core 는 인터페이스만 제공하고,
 * 소비 모듈(mpn/mpp/mqc/mcm)이 자체 구현 빈을 등록한다.
 *
 * <p>구현 빈이 없으면 {@code /lov/master/*} 엔드포인트는 비활성(404)된다.
 */
public interface MasterCodeProvider {

    /**
     * 마스터 코드 목록을 조회한다.
     *
     * @param code  마스터 코드 분류 (예: "PROD_TYPE")
     * @param group 그룹 (선택, null 이면 전체). 예: "ROOT"
     * @return 화면 표시용 LoV 목록
     */
    List<Lov> findMasterCodeLov(String code, String group);
}
