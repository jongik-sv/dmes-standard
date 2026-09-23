package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.contract.version.ApplyFromOrderCheck;
import com.dongkuk.dmes.mdm.contract.version.ApplyFromOrderCheckContract;

/**
 * TSK-01-03 design.md §3.1 L1 — 실구현이 TSK-01-02 계약 키트 5사례(최초 면제, 같으면 거부, 앞이면 거부, +1초 통과,
 * 소급 통과)를 그대로 통과한다(불변 규칙 I3).
 */
class DefaultApplyFromOrderCheckTest extends ApplyFromOrderCheckContract {

    @Override
    protected ApplyFromOrderCheck subject() {
        return new DefaultApplyFromOrderCheck();
    }
}
