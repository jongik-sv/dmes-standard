package com.dongkuk.dmes.mqc.qcd.rule.domain;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.rule.RuleEngine;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;

/**
 * 품질설계 기준 화면들이 함께 쓰는 Maru(MDM) 룰·코드 경계. 운영 구현은 업무 모듈 캐시(MdmDefinitionLookup·MdmMetaService) 위에 선다.
 * MDM 을 받을 수 없으면 {@link com.dongkuk.dmes.cactus.mdm.MdmUnavailableException} 을 그대로 던진다.
 */
public interface QcdRuleGateway {

    /** 평가 시각에 RELEASED 인 정의. 없으면 빈 값. */
    Optional<RuleDefinition> rule(String ruleId, Instant evalTs);

    /** RELEASED 버전 목록(ver 오름차순). ver 는 본문 키 형식(scale 3). */
    List<RuleVersion> versions(String ruleId);

    /** 특정 버전 본문. */
    Optional<RuleDefinition> ruleAt(String ruleId, String ver);

    /** 이 게이트웨이 위에서 만든 엔진(컴파일 캐시를 공유하므로 한 번 만들어 둔다). */
    RuleEngine engine();

    /** 마루 코드의 헤더·버전 목록. 업무 모듈 캐시는 여기에 항목을 싣지 않는다(항목은 {@link #codeAt}). 없으면 빈 값. */
    Optional<CodeRows> code(String maruCodeId);

    /** 버전 하나의 본문(그 버전에 유효한 항목 포함). 없으면 빈 값. */
    Optional<CodeRows> codeAt(String maruCodeId, java.math.BigDecimal ver);

    record RuleVersion(String ver, LocalDateTime applyFrom, LocalDateTime applyTo) {}
}
