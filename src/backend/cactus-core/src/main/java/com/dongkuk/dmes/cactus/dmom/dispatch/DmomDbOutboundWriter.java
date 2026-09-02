package com.dongkuk.dmes.cactus.dmom.dispatch;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.format.DmomFormatRepository;
import com.dongkuk.dmes.cactus.dmom.message.DmomSendRequest;
import org.mybatis.spring.SqlSessionTemplate;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * DB 방식 송신 — {@code EAIUSER.IF_*} 테이블에 INSERT.
 *
 * <p>{@code @Transactional} 없음 — {@code createMsg} 가 <b>활성 업무 트랜잭션</b> 안에서 직접 호출하므로,
 * {@code bizTemplate}(업무 tx DataSource 에 바인딩된 SqlSessionTemplate)으로 INSERT 하면 같은 로컬 tx 에
 * 합류한다(원자적). INSERT 실패 시 예외 전파 → 업무 트랜잭션 전체 롤백.
 *
 * <p>대상 테이블명은 {@code ${tableName}} 으로 SQL 에 삽입되므로 정규식 화이트리스트로 검증한다(SQL injection 방지).
 */
public class DmomDbOutboundWriter {

    /** CaravanHub {@code isValidTableName} 과 동일한 화이트리스트 패턴. */
    private static final Pattern VALID_TABLE = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]*$");

    private final SqlSessionTemplate bizTemplate;
    private final DmomFormatRepository formatRepository;

    public DmomDbOutboundWriter(SqlSessionTemplate bizTemplate, DmomFormatRepository formatRepository) {
        this.bizTemplate = bizTemplate;
        this.formatRepository = formatRepository;
    }

    /**
     * 업무 tx 커넥션으로 IF_* INSERT (원자적). 감사 컬럼은 {@code CactusMybatisAuditInterceptor} 가 자동 주입.
     *
     * @param request      송신 요청
     * @param interfaceMsg 직렬화된 전문
     */
    public void insert(DmomSendRequest request, String interfaceMsg) {
        String table = formatRepository.resolveSendTable(request.interfaceId(), request.transactionCode());
        if (table == null || !VALID_TABLE.matcher(table).matches()) {
            throw new DmomException("유효하지 않은 IF 테이블명: " + table
                    + " (interfaceId=" + request.interfaceId() + ")");
        }

        Map<String, Object> param = new HashMap<>();
        param.put("tableName", table);
        param.put("transactionCode", request.transactionCode());
        param.put("interfaceId", request.interfaceId());
        param.put("interfaceMsg", interfaceMsg);
        param.put("ifFlag", "N");                // 미처리 (CaravanHub DB-inbound 폴러 대상)
        // IF_SEQ(NULL 허용) / IF_DATE·IF_TIME(CaravanHub 처리시 채움) / KEY_DATA(미사용) 는 INSERT 컬럼 제외.
        // 감사 컬럼(cUsrId/cAt/...) 은 CactusMybatisAuditInterceptor 가 Map 에 자동 주입.

        bizTemplate.insert("DmomMapper.insertIfOutbound", param);
    }
}
