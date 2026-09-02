/**
 * Apache Camel 통합 골격 (P2).
 *
 * <p>caravan-hub 의 인바운드/아웃바운드 통합을 Apache Camel 라우트로 전환하기 위한 기반 패키지.
 * P2 단계에서는 <b>라우트를 탑재하지 않고</b> CamelContext 만 기동하며, 다음을 제공한다.</p>
 * <ul>
 *   <li>{@link com.dongkuk.caravan.hub.camel.CamelRouteIds} — 라우트 ID 명명 규약(정적/동적).</li>
 *   <li>{@link com.dongkuk.caravan.hub.camel.CamelRouteControlService} — 라우트 생명주기 제어
 *       (start/stop/suspend/resume/status). 큐막기(pause)·console 소비제어 연동의 진입점.</li>
 * </ul>
 *
 * <h2>레지스트리</h2>
 * <p>Camel 은 Spring {@code ApplicationContext} 를 레지스트리로 사용하므로,
 * {@code mstDataSource}/{@code ifDataSource} 등 스프링 빈은 라우트에서
 * {@code sql:...?dataSource=#ifDataSource} 처럼 {@code #빈이름} 으로 즉시 참조된다(별도 등록 불필요).</p>
 *
 * <h2>단계 로드맵</h2>
 * <ul>
 *   <li>P3 — 인바운드 전환: HTTP({@code camel-servlet}) → DB({@code camel-sql} onConsume 낙관락) → FILE({@code camel-sftp}).</li>
 *   <li>P4 — 아웃바운드 전환: {@code BusinessStart} 브릿지 + {@code direct:} 라우팅(HTTP/DB/FILE).</li>
 * </ul>
 */
package com.dongkuk.caravan.hub.camel;
