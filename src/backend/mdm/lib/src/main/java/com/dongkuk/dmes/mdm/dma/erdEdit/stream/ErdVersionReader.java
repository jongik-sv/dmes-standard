package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * ERD 버전 상태 읽기(S2-12). 허브의 구독 직후 이벤트, ErdEditService 의 동작 뒤 이벤트와 view 편집자 목록이 같은 SQL 을 쓴다.
 * JdbcTemplate 으로 읽으므로 호출자 트랜잭션(OASIS)이 있으면 그 연결로 읽는다. 스스로 트랜잭션을 열지 않는다.
 */
@Component
public class ErdVersionReader {

    private final JdbcTemplate jdbc;

    public ErdVersionReader(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 지금 버전 상태 — view(ver 없음)가 돌려줄 값과 같다: DRAFT 가 있으면 그것, 없으면 가장 높은 RELEASED. 버전 행이 없으면 null.
     * JdbcTemplate 으로 읽는다. 동작 뒤 이벤트는 호출자(ErdEditService)가 같은 트랜잭션 안에서 영속성 문맥을 내보낸 뒤 부른다 —
     * 엔티티는 네이티브 CAS 뒤에 낡은 값을 가질 수 있다. 구독 직후 이벤트는 허브의 읽기 스레드가 DB 읽기 상한 안에서 부른다.
     */
    public ErdVersionEvent versionNow(String modelId, String reason, String userId) {
        record Row(BigDecimal ver, String status, String ownerId, long rowVersion) {}
        List<Row> rows = jdbc.query("""
                SELECT VER
                     , STATUS
                     , OWNER_ID
                     , ROW_VERSION
                  FROM TB_MDM_ERD_MODEL_VER
                 WHERE ERD_MODEL_ID = ?
                   AND STATUS IN ('DRAFT', 'RELEASED')
                 ORDER BY CASE STATUS WHEN 'DRAFT' THEN 0 ELSE 1 END
                        , VER DESC
                """, (rs, i) -> new Row(rs.getBigDecimal(1), rs.getString(2), rs.getString(3), rs.getLong(4)), modelId);
        if (rows.isEmpty()) return null;
        Row v = rows.get(0);
        List<String> editors = editors(modelId, v.ver());
        return new ErdVersionEvent(modelId, VersionNumbers.plain(v.ver()), v.status(), v.ownerId(), List.copyOf(editors),
                v.rowVersion(), reason, userId, Instant.now().toString());
    }

    /** 그 버전의 공동 편집자, 사용자 id 순. */
    public List<String> editors(String modelId, BigDecimal ver) {
        return jdbc.queryForList(
                "SELECT USER_ID FROM TB_MDM_ERD_EDITOR WHERE ERD_MODEL_ID = ? AND VER = ? ORDER BY USER_ID",
                String.class, modelId, ver);
    }
}
