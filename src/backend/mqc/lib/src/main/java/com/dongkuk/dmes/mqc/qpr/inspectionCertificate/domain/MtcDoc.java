package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain;

import java.time.LocalDateTime;

/** 키·JSON 본문으로 저장하는 검사증명서 자료(양식·예외 규칙·증명서·단건 수정·이미지)의 공통 읽기 면. */
public interface MtcDoc {

    String docKey();

    Integer getSortSeq();

    String getBodyJson();

    String getUpdBy();

    LocalDateTime getUpdAt();
}
