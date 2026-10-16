/**
 * dma(용어·도메인) 그룹이 함께 쓰는 명명 규칙(TSK-04-04 design.md §1·§6.3~§6.10) — 한국어 논리명 분해·물리명
 * 조합·역분해, 도메인 추천, 표시명·약어 제안, 유사어 1차 추천.
 *
 * <p>Spring·JPA·DB 에 기대지 않는 순수 클래스만 둔다. 서비스가 용어·도메인을 읽어 {@link
 * com.dongkuk.dmes.mdm.dma.naming.TermDictionary}·{@link com.dongkuk.dmes.mdm.dma.naming.DomainEntry} 로 넘긴다.
 * TSK-04-02(용어 관리)가 같은 사전 해석을 재사용한다(design.md §8).
 *
 * <p>§6.3 의 이름·약어 형식 규칙({@code NamingRules})은 dma 밖(common·dmc·dmd·dme)도 써서
 * {@code common.naming} 에 있다(BE 리팩토링 2회차 C5).
 */
package com.dongkuk.dmes.mdm.dma.naming;
