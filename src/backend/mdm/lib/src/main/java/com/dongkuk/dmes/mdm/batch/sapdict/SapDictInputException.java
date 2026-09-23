package com.dongkuk.dmes.mdm.batch.sapdict;

/** 입력 무결성 오류(TSK-04-05 design.md §4.1). CLI 는 종료 코드 1 로 끝내고 출력 파일을 하나도 쓰지 않는다(I4). */
public class SapDictInputException extends RuntimeException {

    public SapDictInputException(String message) {
        super(message);
    }
}
