package com.dongkuk.dmes.mdm.contract.version;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * 새 DRAFT 쓰기 — 새 버전 훅의 대상별 손잡이(C3). 버전 행과 딸린 행(룰 변수·행, 레이아웃 항목·헤더 구성·재정의 등)을 쓴다. {@code source}
 * 가 있으면 그 버전을 다시 읽어 복사한다. 버전 상태 서비스의 트랜잭션 안에서 불린다. 마루 코드 복원은 예외다. 원천이 늘 empty 이고, 요청의 원본
 * 번호를 이 손잡이가 직접 검사(번호 뒤, MDM021)하고 복사한다.
 */
public interface DraftWriter {

    void write(VersionRef draft, VersionKind kind, String owner, Optional<BigDecimal> source);
}
