package com.dongkuk.dmes.mdm.dmb.layout.confirm;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutChangeClassifier;
import java.util.List;
import java.util.Map;

/**
 * 레이아웃 확정 검사 결과(D-144 3단계, 스펙 §7). 판정 시각은 apply_from 이다.
 *
 * @param layoutKind {@code MESSAGE}·{@code HEADER}
 * @param errors     있으면 확정하지 않는다 — 코드는 {@code LayoutIssueCode} 이름(L01~L16)
 * @param warnings   담당자 확인 대상({@link LayoutConfirmChecks#SIMULTANEOUS_SWITCH}, 헤더면 {@link LayoutHeaderImpact#ORPHAN_OVERRIDE}·
 *                   {@link LayoutHeaderImpact#EAI_STANDARD_HEADER_SWITCH}·{@link LayoutHeaderImpact#HEADER_UNRESOLVED}, 그리고 "전" 에 이미
 *                   있던 L16·L12 — {@link LayoutHeaderImpact#ALREADY} 문구)
 * @param change     직전 RELEASED 대비 변경 분류 — 오류가 있으면 null(분류할 수 없다)
 * @param impact     헤더 확정이 그 시각 전문에 미치는 영향({@link LayoutHeaderImpact} 영향 행, 전문이면 빈 목록)
 * @param eaiCodes   이 헤더 버전을 apply_from 에 확정하면 그 시각 표준 헤더가 이 헤더인 EAI(시각 T 해석, 전문이면 빈 목록)
 */
public record LayoutConfirmReport(String layoutKind, List<MdmCheckIssue> errors, List<MdmCheckIssue> warnings,
                                  LayoutChangeClassifier.Change change, List<Map<String, Object>> impact, List<String> eaiCodes) {
}
