package com.dongkuk.dmes.mdm.dme.ruleEdit.service;

import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveResult;

/**
 * 저장 부분 전략 — 확장 지점(TSK-08-02 design §6.8). 파사드는 {@code part()} 로 빈을 골라 위임한다. 이 Task 는 HEADER·TABLE 두 빈을
 * 두고, TSK-08-03 이 COLUMNS 빈을 더한다(기존 줄을 고치지 않는다). 같은 part 가 둘이면 기동이 실패한다.
 */
public interface RuleEditSavePart {

    String part();

    RuleEditSaveResult save(RuleEditSaveRequest request);
}
