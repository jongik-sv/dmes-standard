package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

import com.dongkuk.dmes.mdm.common.rule.SetCallIo;
import java.util.List;

/**
 * {@code ruleSetEdit} search target=CALL_IO 응답(하위 세트 spec §8) — 요청 순서의 겉모양(기준 시각 = 지금, 중복·빈 ID 제외). 지금 적용 중인
 * RELEASED 가 없는 세트는 {@code exists=false}.
 */
public class RuleSetCallIoResult {

    private List<SetCallIo> calls;

    public RuleSetCallIoResult() {
    }

    public RuleSetCallIoResult(List<SetCallIo> calls) {
        this.calls = calls;
    }

    public List<SetCallIo> getCalls() { return calls; }

    public void setCalls(List<SetCallIo> v) { this.calls = v; }
}
