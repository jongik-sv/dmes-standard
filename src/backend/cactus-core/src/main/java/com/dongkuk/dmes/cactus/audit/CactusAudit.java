package com.dongkuk.dmes.cactus.audit;

import com.dongkuk.oasis.audit.Audit;

/**
 * 감사 정보. OasisServiceExecutor가 요청마다 생성하여 AuditHolder에 저장한다.
 * CactusAuditListener(JPA)와 CactusMybatisAuditInterceptor(MyBatis)가
 * 이 정보를 꺼내 감사 컬럼에 세팅한다.
 *
 * @param userId    사용자 ID (UserContextHolder에서)
 * @param menuId    메뉴(화면) ID (CactusRequest.meta.menuId에서) — DB C/U_PGM_ID
 * @param serviceId 서비스 ID (OasisServiceExecutor 파라미터에서) — DB C/U_SVC_ID
 */
public record CactusAudit(String userId, String menuId, String serviceId) implements Audit {
}
