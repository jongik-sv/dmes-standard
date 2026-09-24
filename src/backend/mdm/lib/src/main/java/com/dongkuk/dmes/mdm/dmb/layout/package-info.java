/**
 * 03 인터페이스 레이아웃 공용 계산·검증·조회(TSK-05-02). TSK-05-03(직렬화·등록 검증 7종·버전)이 재사용한다.
 *
 * <p>순수 계산({@link com.dongkuk.dmes.mdm.dmb.layout.LayoutOffsetCalculator}·{@link
 * com.dongkuk.dmes.mdm.dmb.layout.LayoutItemRules} 등)은 DB·트랜잭션을 모른다. DB 는 {@link
 * com.dongkuk.dmes.mdm.dmb.layout.LayoutQueries}(읽기)와 {@link com.dongkuk.dmes.mdm.dmb.layout.LayoutWriter}(쓰기)만
 * 만진다. 이 패키지에는 {@code @Transactional}·직접 커넥션이 없다 — 트랜잭션은 OASIS action 한 건이다(F11, 불변 I19).
 */
package com.dongkuk.dmes.mdm.dmb.layout;
