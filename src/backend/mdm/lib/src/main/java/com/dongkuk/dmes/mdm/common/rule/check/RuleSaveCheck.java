package com.dongkuk.dmes.mdm.common.rule.check;

import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 원장을 읽는 저장 시 검사의 확장 지점(TSK-08-04 design §2.2, D10). {@link RuleSaveValidator} 가 <b>쓰기 전에</b> 부르고, 돌려준
 * 이슈에 ERROR 가 하나라도 있으면 호출자가 저장을 거부한다. 이슈 맵 모양은 {@link RuleCheckReport} 와 같다.
 *
 * <p>기본 단계(셀·식·미완성·생성·분석)에 ERROR 가 이미 있으면 부르지 않는다 — 정규화되지 않은 셀을 원장 검사가 다시 보지 않게 한다.
 */
public interface RuleSaveCheck {

    List<Map<String, Object>> check(RuleSaveContext context);

    /** 이 검사가 도는 적용 지점(§6.1 표). */
    default Set<RuleSaveTarget> targets() {
        return EnumSet.of(RuleSaveTarget.TABLE, RuleSaveTarget.STORED);
    }
}
