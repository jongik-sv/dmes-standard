package com.dongkuk.dmes.mdm.contract.dictionary.archviolation;

import com.dongkuk.dmes.mdm.entity.MdmUnit;

/**
 * TSK-04-01 design.md §3.5 — 공허 통과 방지 음성 테스트 전용 고립 클래스. 계약 패키지({@code contract..})를
 * 가장해 엔티티를 직접 참조한다("계약_패키지는_엔티티_리포지토리_패키지에_의존하지_않는다" 규칙의 위반 표본).
 *
 * <p>메인 소스가 아니라 test 에만 둔다 — main 으로 옮기면 {@code MdmContractArchitectureTest} 의
 * "계약_패키지에는_인터페이스_enum_record_상수클래스만_있다" 규칙이 이 클래스를 별도로 잡는다.
 */
public class ArchViolationSample {

    public MdmUnit describe(MdmUnit unit) {
        return unit;
    }
}
