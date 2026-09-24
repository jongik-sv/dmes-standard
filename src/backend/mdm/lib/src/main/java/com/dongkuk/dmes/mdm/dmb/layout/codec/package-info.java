/**
 * 03 전문 직렬화기·파서(TSK-05-03 design.md §6.3). 입력은 스냅샷뿐이다 — 엔티티·리포지토리·Spring 을 보지 않는다(불변 I11,
 * {@code LayoutCodecArchitectureTest}). 바이트 길이·패딩·오프셋은 모두 스냅샷 {@code encoding} 으로 센 바이트다(I2). 단위 환산
 * 계수만은 단위 마스터가 별도 배포 대상이라(03:46) 생성자로 받는다(D9).
 */
package com.dongkuk.dmes.mdm.dmb.layout.codec;
