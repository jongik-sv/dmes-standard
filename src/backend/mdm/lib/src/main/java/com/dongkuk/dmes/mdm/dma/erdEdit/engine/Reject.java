package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

/** 거절을 엔진 안에서 운반하는 예외(스택 없음). */
final class Reject extends RuntimeException {
    final ErdRejection rejection;

    Reject(ErdRejection rejection) {
        super(rejection.message(), null, false, false);
        this.rejection = rejection;
    }
}
