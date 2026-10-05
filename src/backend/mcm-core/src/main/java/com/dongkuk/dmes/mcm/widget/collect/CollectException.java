package com.dongkuk.dmes.mcm.widget.collect;

/** 수집 실패 — 메시지는 RUN 행(MSG 200자)에 적는 사람이 읽을 한국어 문장이다. 주소·인증값·DB 메시지를 넣지 않는다. */
public class CollectException extends RuntimeException {

    public CollectException(String message) {
        super(message);
    }
}
