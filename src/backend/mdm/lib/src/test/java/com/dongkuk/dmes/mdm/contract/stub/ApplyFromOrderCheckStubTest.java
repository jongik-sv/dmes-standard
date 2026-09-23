package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.version.ApplyFromOrderCheck;
import com.dongkuk.dmes.mdm.contract.version.ApplyFromOrderCheckContract;

/** TSK-01-02 design.md §3.1 T10 — 참조 스텁이 apply_from 순서 계약 사례를 통과한다. */
class ApplyFromOrderCheckStubTest extends ApplyFromOrderCheckContract {

    @Override
    protected ApplyFromOrderCheck subject() {
        return new ApplyFromOrderCheckStub();
    }
}
