package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.contract.version.VersionTarget;

/** 대상별 테이블 명세 조회(TSK-01-03 B11). 테스트는 실제 이름과 다른 픽스처 명세를 @Primary 로 준다. */
public interface VersionTableRegistry {

    VersionTableSpec spec(VersionTarget target);
}
