/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: 퇴직자가 담당인 MDM 데이터 조회·인계·ERD 점유 해제 — MDM 앱에 서버 간 호출
 */
package com.dongkuk.dmes.mcm.security.account;

import java.util.List;

/**
 * 다른 앱(MDM)이 가진 「사람이 담당인 데이터」. MCM 과 DB 스키마·앱이 달라 MCM 트랜잭션에 묶이지 않는다.
 * 호출이 실패하면 {@link UnavailableException} — 부르는 쪽은 퇴직 처리를 되돌리지 않고 「인계 대기」로 남긴다(D4).
 */
public interface UserOwnershipClient {

    /** 담당 데이터 묶음 하나. */
    record Owned(String userId, String kind, String kindNm, long cnt, boolean skipped) {}

    /** 사람 한 명 — 아이디와 사번(사번으로 담당을 적는 칸이 있다). */
    record Person(String userId, String empNo) {}

    /** 여러 사람의 담당 데이터 건수(0건은 빠진다). */
    List<Owned> summary(List<Person> users);

    /** from 의 담당을 to 에게 넘기고 from 의 ERD 편집 점유를 푼다. 넘긴 건수. */
    List<Owned> handover(Person from, Person to);

    /** ERD 편집 점유만 푼다. 푼 건수. */
    long releaseClaims(String userId);

    /** MDM 에 닿지 못함·거절. */
    class UnavailableException extends RuntimeException {
        public UnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
