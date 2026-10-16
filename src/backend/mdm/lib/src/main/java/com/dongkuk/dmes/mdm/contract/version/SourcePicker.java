package com.dongkuk.dmes.mdm.contract.version;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * 새 버전의 복사 원천 고르기 — 새 버전 훅의 대상별 손잡이(C3). 그 객체의 모든 버전(상태 무관)을 받아 원천 버전 번호를 돌려준다. 원천 없이 빈
 * DRAFT 를 만들면 empty 다. 고를 수 없으면 대상의 오류를 던진다(룰·룰 세트 BUSINESS_ERROR, 레이아웃 MDM009, ERD MDM029). 마루 코드는 새
 * 버전·복원 모두 empty 다(복원 원본은 {@link DraftWriter} 가 본다).
 */
public interface SourcePicker {

    Optional<BigDecimal> pick(List<VersionSnapshot> all);
}
