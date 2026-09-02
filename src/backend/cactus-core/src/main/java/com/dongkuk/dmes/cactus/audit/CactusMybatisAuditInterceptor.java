package com.dongkuk.dmes.cactus.audit;

import com.dongkuk.oasis.audit.AuditHolder;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.SqlCommandType;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Invocation;
import org.apache.ibatis.plugin.Signature;

import java.time.Instant;
import java.util.Map;

/**
 * MyBatis INSERT/UPDATE 실행 시 파라미터 Map에 감사 값을 자동 주입하는 인터셉터.
 *
 * <p>동작 조건:
 * <ul>
 *   <li>SqlCommandType이 INSERT 또는 UPDATE일 때만 동작</li>
 *   <li>파라미터가 Map 타입일 때만 값을 주입 (비-Map은 무시)</li>
 *   <li>AuditHolder에 CactusAudit가 설정되어 있을 때만 사용자/서비스 정보 주입</li>
 * </ul>
 *
 * <p>Mapper XML 사용 예:
 * <pre>{@code
 * <insert id="insertProduct">
 *   INSERT INTO TB_PRODUCT (PRODUCT_ID, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID,
 *                           U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID)
 *   VALUES (#{productId}, #{cUsrId}, #{cAt}, #{cSvcId}, #{cPgmId},
 *           #{uUsrId}, #{uAt}, #{uSvcId}, #{uPgmId})
 * </insert>
 * }</pre>
 */
@Intercepts({
    @Signature(type = Executor.class, method = "update", args = {MappedStatement.class, Object.class})
})
public class CactusMybatisAuditInterceptor implements Interceptor {

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        MappedStatement ms = (MappedStatement) invocation.getArgs()[0];
        SqlCommandType commandType = ms.getSqlCommandType();
        Object param = invocation.getArgs()[1];

        if (param instanceof Map
                && (commandType == SqlCommandType.INSERT || commandType == SqlCommandType.UPDATE)) {

            @SuppressWarnings("unchecked")
            Map<String, Object> map = (Map<String, Object>) param;
            Instant now = Instant.now();

            CactusAudit audit = AuditHolder.getAudit();
            String userId = audit != null ? audit.userId() : null;
            String serviceId = audit != null ? audit.serviceId() : null;
            String menuId = audit != null ? audit.menuId() : null;

            // INSERT: 생성 컬럼 주입
            if (commandType == SqlCommandType.INSERT) {
                map.put("cUsrId", userId);
                map.put("cAt", now);
                map.put("cSvcId", serviceId);
                map.put("cPgmId", menuId);
            }

            // INSERT & UPDATE: 수정 컬럼 주입
            map.put("uUsrId", userId);
            map.put("uAt", now);
            map.put("uSvcId", serviceId);
            map.put("uPgmId", menuId);
        }

        return invocation.proceed();
    }
}
