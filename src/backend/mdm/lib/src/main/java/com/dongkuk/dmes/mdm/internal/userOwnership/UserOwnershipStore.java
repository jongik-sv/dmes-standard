package com.dongkuk.dmes.mdm.internal.userOwnership;

import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 퇴직 처리용 소유 칸 SQL(MCM 서버 호출, {@code /internal/mdm/userOwnership}). 종류마다 정적 SQL 하나씩이다(oracle-sql-rules 4.7).
 *
 * <p>규칙:
 * <ul>
 *   <li>여러 사용자는 JSON 배열 문자열 하나로 바인딩해 {@code JSON_TABLE} 로 푼다 — 목록 길이와 상관없이 SQL 글자가 같고 IN 1000개 한도가 없다.
 *       바인드 문자열 4000바이트 한도 때문에 {@link #MAX_JSON_BYTES} 안으로 나눠 여러 번 부른다.</li>
 *   <li>버전 표는 {@code STATUS = 'DRAFT'} 행만 본다. 넘기면 {@code ROW_VERSION} 을 올린다 — 퇴직자 화면에 남은 낡은 rowVersion 의 저장은 충돌로
 *       거절된다({@code VersionRowStore.casSetOwner} 와 같은 갱신).</li>
 *   <li>모든 쓰기는 감사 U_* 칸을 쓰고 감사 카운터(버전 표 {@code AUD_VER}, 그 밖 {@code VER})를 1 올린다(규칙표 §2).</li>
 *   <li>JdbcTemplate 이라 호출자 트랜잭션이 있으면 그 연결로 읽고 쓴다. 스스로 트랜잭션을 열지 않는다.</li>
 * </ul>
 */
@Repository
public class UserOwnershipStore {

    /** JSON 배열 바인드 한 번의 상한(바이트). VARCHAR2 바인드 4000바이트보다 조금 작게 둔다. */
    static final int MAX_JSON_BYTES = 3900;

    // ── 건수(사용자별) ──────────────────────────────────────────────────────

    private static final String COUNT_CODE_OWNER = """
            SELECT A.OWNER_ID USER_KEY
                 , COUNT(*) CNT
            FROM   TB_MDM_CODE_VER A
            WHERE  A.OWNER_ID IN (SELECT B.V FROM JSON_TABLE(:ids, '$[*]' COLUMNS (V VARCHAR2(50) PATH '$')) B)
            AND    A.STATUS = 'DRAFT'
            GROUP BY A.OWNER_ID
            """;

    private static final String COUNT_RULE_OWNER = """
            SELECT A.OWNER_ID USER_KEY
                 , COUNT(*) CNT
            FROM   TB_MDM_RULE_VER A
            WHERE  A.OWNER_ID IN (SELECT B.V FROM JSON_TABLE(:ids, '$[*]' COLUMNS (V VARCHAR2(50) PATH '$')) B)
            AND    A.STATUS = 'DRAFT'
            GROUP BY A.OWNER_ID
            """;

    private static final String COUNT_RULE_SET_OWNER = """
            SELECT A.OWNER_ID USER_KEY
                 , COUNT(*) CNT
            FROM   TB_MDM_RULE_SET_VER A
            WHERE  A.OWNER_ID IN (SELECT B.V FROM JSON_TABLE(:ids, '$[*]' COLUMNS (V VARCHAR2(50) PATH '$')) B)
            AND    A.STATUS = 'DRAFT'
            GROUP BY A.OWNER_ID
            """;

    private static final String COUNT_LAYOUT_OWNER = """
            SELECT A.OWNER_ID USER_KEY
                 , COUNT(*) CNT
            FROM   TB_MDM_LAYOUT_VER A
            WHERE  A.OWNER_ID IN (SELECT B.V FROM JSON_TABLE(:ids, '$[*]' COLUMNS (V VARCHAR2(50) PATH '$')) B)
            AND    A.STATUS = 'DRAFT'
            GROUP BY A.OWNER_ID
            """;

    private static final String COUNT_ERD_OWNER = """
            SELECT A.OWNER_ID USER_KEY
                 , COUNT(*) CNT
            FROM   TB_MDM_ERD_MODEL_VER A
            WHERE  A.OWNER_ID IN (SELECT B.V FROM JSON_TABLE(:ids, '$[*]' COLUMNS (V VARCHAR2(50) PATH '$')) B)
            AND    A.STATUS = 'DRAFT'
            GROUP BY A.OWNER_ID
            """;

    /** DRAFT 버전의 공동 편집자만 센다(확정된 버전에 남은 편집자 행은 이력). */
    private static final String COUNT_ERD_EDITOR = """
            SELECT A.USER_ID USER_KEY
                 , COUNT(*) CNT
            FROM   TB_MDM_ERD_EDITOR A
            WHERE  A.USER_ID IN (SELECT B.V FROM JSON_TABLE(:ids, '$[*]' COLUMNS (V VARCHAR2(50) PATH '$')) B)
            AND    EXISTS (SELECT 1 FROM TB_MDM_ERD_MODEL_VER C WHERE C.ERD_MODEL_ID = A.ERD_MODEL_ID AND C.VER = A.VER AND C.STATUS = 'DRAFT')
            GROUP BY A.USER_ID
            """;

    private static final String COUNT_TERM_OWNER = """
            SELECT A.OWNER_ID USER_KEY
                 , COUNT(*) CNT
            FROM   TB_MDM_TERM A
            WHERE  A.OWNER_ID IN (SELECT B.V FROM JSON_TABLE(:ids, '$[*]' COLUMNS (V VARCHAR2(50) PATH '$')) B)
            GROUP BY A.OWNER_ID
            """;

    /** 살아 있는 표시만 센다. 지우기({@code ErdEventHub.releaseAllOf})는 만료된 것까지 지운다. */
    private static final String COUNT_ERD_CLAIM = """
            SELECT A.USER_ID USER_KEY
                 , COUNT(*) CNT
            FROM   TB_MDM_ERD_CLAIM A
            WHERE  A.USER_ID IN (SELECT B.V FROM JSON_TABLE(:ids, '$[*]' COLUMNS (V VARCHAR2(50) PATH '$')) B)
            AND    A.EXPIRES_AT > :now
            GROUP BY A.USER_ID
            """;

    // ── 넘기기 ──────────────────────────────────────────────────────────────

    private static final String REASSIGN_CODE_OWNER = """
            UPDATE TB_MDM_CODE_VER A
            SET    A.OWNER_ID = :toId
                 , A.ROW_VERSION = A.ROW_VERSION + 1
                 , A.AUD_VER = COALESCE(A.AUD_VER, 0) + 1
                 , A.U_USR_ID = :uUsrId
                 , A.U_AT = :uAt
                 , A.U_SVC_ID = :uSvcId
                 , A.U_PGM_ID = :uPgmId
            WHERE  A.OWNER_ID = :fromId
            AND    A.STATUS = 'DRAFT'
            """;

    private static final String REASSIGN_RULE_OWNER = """
            UPDATE TB_MDM_RULE_VER A
            SET    A.OWNER_ID = :toId
                 , A.ROW_VERSION = A.ROW_VERSION + 1
                 , A.AUD_VER = COALESCE(A.AUD_VER, 0) + 1
                 , A.U_USR_ID = :uUsrId
                 , A.U_AT = :uAt
                 , A.U_SVC_ID = :uSvcId
                 , A.U_PGM_ID = :uPgmId
            WHERE  A.OWNER_ID = :fromId
            AND    A.STATUS = 'DRAFT'
            """;

    private static final String REASSIGN_RULE_SET_OWNER = """
            UPDATE TB_MDM_RULE_SET_VER A
            SET    A.OWNER_ID = :toId
                 , A.ROW_VERSION = A.ROW_VERSION + 1
                 , A.AUD_VER = COALESCE(A.AUD_VER, 0) + 1
                 , A.U_USR_ID = :uUsrId
                 , A.U_AT = :uAt
                 , A.U_SVC_ID = :uSvcId
                 , A.U_PGM_ID = :uPgmId
            WHERE  A.OWNER_ID = :fromId
            AND    A.STATUS = 'DRAFT'
            """;

    private static final String REASSIGN_LAYOUT_OWNER = """
            UPDATE TB_MDM_LAYOUT_VER A
            SET    A.OWNER_ID = :toId
                 , A.ROW_VERSION = A.ROW_VERSION + 1
                 , A.AUD_VER = COALESCE(A.AUD_VER, 0) + 1
                 , A.U_USR_ID = :uUsrId
                 , A.U_AT = :uAt
                 , A.U_SVC_ID = :uSvcId
                 , A.U_PGM_ID = :uPgmId
            WHERE  A.OWNER_ID = :fromId
            AND    A.STATUS = 'DRAFT'
            """;

    private static final String REASSIGN_ERD_OWNER = """
            UPDATE TB_MDM_ERD_MODEL_VER A
            SET    A.OWNER_ID = :toId
                 , A.ROW_VERSION = A.ROW_VERSION + 1
                 , A.AUD_VER = COALESCE(A.AUD_VER, 0) + 1
                 , A.U_USR_ID = :uUsrId
                 , A.U_AT = :uAt
                 , A.U_SVC_ID = :uSvcId
                 , A.U_PGM_ID = :uPgmId
            WHERE  A.OWNER_ID = :fromId
            AND    A.STATUS = 'DRAFT'
            """;

    /**
     * 받는 사람이 이미 그 DRAFT 의 편집자이거나 소유자면 퇴직자 행은 지운다(PK 가 ERD_MODEL_ID·VER·USER_ID 이고, 소유자는 편집자 표에 넣지 않는다 —
     * 스펙 D15). {@link #REASSIGN_ERD_EDITOR} 보다 먼저, {@link #REASSIGN_ERD_OWNER} 보다 뒤에 돈다.
     */
    private static final String DROP_ERD_EDITOR_DUP = """
            DELETE FROM TB_MDM_ERD_EDITOR A
            WHERE  A.USER_ID = :fromId
            AND    EXISTS
                   (
                       SELECT 1
                       FROM   TB_MDM_ERD_MODEL_VER B
                       WHERE  B.ERD_MODEL_ID = A.ERD_MODEL_ID
                       AND    B.VER = A.VER
                       AND    B.STATUS = 'DRAFT'
                   )
            AND    (
                       EXISTS (SELECT 1 FROM TB_MDM_ERD_EDITOR C WHERE C.ERD_MODEL_ID = A.ERD_MODEL_ID AND C.VER = A.VER AND C.USER_ID = :toId)
                    OR EXISTS (SELECT 1 FROM TB_MDM_ERD_MODEL_VER D WHERE D.ERD_MODEL_ID = A.ERD_MODEL_ID AND D.VER = A.VER AND D.OWNER_ID = :toId)
                   )
            """;

    private static final String REASSIGN_ERD_EDITOR = """
            UPDATE TB_MDM_ERD_EDITOR A
            SET    A.USER_ID = :toId
                 , A.AUD_VER = COALESCE(A.AUD_VER, 0) + 1
                 , A.U_USR_ID = :uUsrId
                 , A.U_AT = :uAt
                 , A.U_SVC_ID = :uSvcId
                 , A.U_PGM_ID = :uPgmId
            WHERE  A.USER_ID = :fromId
            AND    EXISTS (SELECT 1 FROM TB_MDM_ERD_MODEL_VER B WHERE B.ERD_MODEL_ID = A.ERD_MODEL_ID AND B.VER = A.VER AND B.STATUS = 'DRAFT')
            """;

    private static final String REASSIGN_TERM_OWNER = """
            UPDATE TB_MDM_TERM A
            SET    A.OWNER_ID = :toId
                 , A.VER = COALESCE(A.VER, 0) + 1
                 , A.U_USR_ID = :uUsrId
                 , A.U_AT = :uAt
                 , A.U_SVC_ID = :uSvcId
                 , A.U_PGM_ID = :uPgmId
            WHERE  A.OWNER_ID = :fromId
            """;

    /** 퇴직자가 소유하거나 공동 편집하는 DRAFT 의 ERD 모델 — 넘긴 뒤 버전 이벤트를 보낼 모델이다. */
    private static final String ERD_DRAFT_MODELS_OF = """
            SELECT A.ERD_MODEL_ID
            FROM   TB_MDM_ERD_MODEL_VER A
            WHERE  A.OWNER_ID = :userId
            AND    A.STATUS = 'DRAFT'
            UNION
            SELECT B.ERD_MODEL_ID
            FROM   TB_MDM_ERD_EDITOR B
            WHERE  B.USER_ID = :userId
            AND    EXISTS (SELECT 1 FROM TB_MDM_ERD_MODEL_VER C WHERE C.ERD_MODEL_ID = B.ERD_MODEL_ID AND C.VER = B.VER AND C.STATUS = 'DRAFT')
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final MdmTemporalBinder temporal;

    public UserOwnershipStore(JdbcTemplate jdbc, MdmTemporalBinder temporal) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbc);
        this.temporal = temporal;
    }

    /**
     * 그 종류에서 값(사용자 ID 또는 사번)별 건수. 0 건인 값은 결과에 없다. {@code now} 는 작업 중 표시의 만료 비교에만 쓴다.
     */
    public Map<String, Long> count(UserOwnershipKind kind, List<String> ids, Instant now) {
        String sql = countSql(kind);
        Map<String, Long> out = new HashMap<>();
        for (String json : jsonChunks(ids, MAX_JSON_BYTES)) {
            MapSqlParameterSource p = new MapSqlParameterSource("ids", json);
            if (kind == UserOwnershipKind.ERD_CLAIM) {
                p.addValue("now", Timestamp.from(now)); // 작업 중 표시는 Timestamp.from(Instant) 로 쓰고 비교한다(ErdClaimStore 와 같은 시계)
            }
            jdbc.query(sql, p, rs -> {
                out.merge(rs.getString("USER_KEY"), rs.getLong("CNT"), Long::sum);
            });
        }
        return out;
    }

    /**
     * 그 종류의 소유 칸을 {@code fromId} 에서 {@code toId} 로 바꾼다. 바꾼 행 수를 돌려준다. {@link UserOwnershipKind#ERD_EDITOR} 는 지운 중복 행
     * 수를 더한다. 작업 중 표시({@link UserOwnershipKind#ERD_CLAIM})는 여기서 다루지 않는다 — {@code ErdEventHub.releaseAllOf} 가 지우고 방송한다.
     */
    public int reassign(UserOwnershipKind kind, String fromId, String toId, AuditStamp stamp) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("fromId", fromId)
                .addValue("toId", toId);
        return switch (kind) {
            case CODE_OWNER -> jdbc.update(REASSIGN_CODE_OWNER, audit(p, stamp));
            case RULE_OWNER -> jdbc.update(REASSIGN_RULE_OWNER, audit(p, stamp));
            case RULE_SET_OWNER -> jdbc.update(REASSIGN_RULE_SET_OWNER, audit(p, stamp));
            case LAYOUT_OWNER -> jdbc.update(REASSIGN_LAYOUT_OWNER, audit(p, stamp));
            case ERD_OWNER -> jdbc.update(REASSIGN_ERD_OWNER, audit(p, stamp));
            case ERD_EDITOR -> jdbc.update(DROP_ERD_EDITOR_DUP, p) + jdbc.update(REASSIGN_ERD_EDITOR, audit(p, stamp));
            case TERM_OWNER -> jdbc.update(REASSIGN_TERM_OWNER, audit(p, stamp));
            case ERD_CLAIM -> throw new IllegalArgumentException("ERD_CLAIM 은 넘기지 않고 ErdEventHub.releaseAllOf 로 지운다");
        };
    }

    /** 그 사용자가 소유하거나 공동 편집하는 DRAFT 의 ERD 모델 id. */
    public List<String> erdDraftModelsOf(String userId) {
        return jdbc.queryForList(ERD_DRAFT_MODELS_OF, new MapSqlParameterSource("userId", userId), String.class);
    }

    private static String countSql(UserOwnershipKind kind) {
        return switch (kind) {
            case CODE_OWNER -> COUNT_CODE_OWNER;
            case RULE_OWNER -> COUNT_RULE_OWNER;
            case RULE_SET_OWNER -> COUNT_RULE_SET_OWNER;
            case LAYOUT_OWNER -> COUNT_LAYOUT_OWNER;
            case ERD_OWNER -> COUNT_ERD_OWNER;
            case ERD_EDITOR -> COUNT_ERD_EDITOR;
            case TERM_OWNER -> COUNT_TERM_OWNER;
            case ERD_CLAIM -> COUNT_ERD_CLAIM;
        };
    }

    private MapSqlParameterSource audit(MapSqlParameterSource p, AuditStamp stamp) {
        // null 도 문자열 형으로 바인딩한다(VersionRowStore.bindString 과 같은 이유 — 드라이버가 형 없는 null 을 다르게 추론하지 않게)
        return p.addValue("uUsrId", stamp.userId(), Types.VARCHAR)
                .addValue("uAt", temporal.toDb(stamp.at()))
                .addValue("uSvcId", stamp.serviceId(), Types.VARCHAR)
                .addValue("uPgmId", stamp.programId(), Types.VARCHAR);
    }

    /**
     * 값 목록을 JSON 배열 문자열 여러 개로 나눈다 — 각 문자열은 UTF-8 로 {@code maxBytes} 를 넘지 않는다. 빈 값·중복은 뺀다. 목록이 비면 빈
     * 목록이다. 값 하나가 상한을 넘으면 그 값만 담은 배열을 따로 만든다(칸 길이 50자라 실제로는 생기지 않는다).
     */
    static List<String> jsonChunks(List<String> ids, int maxBytes) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder("[");
        int curBytes = 1;
        for (String id : new LinkedHashSet<>(ids)) {
            if (id == null || id.isBlank()) {
                continue;
            }
            String item = quote(id);
            int itemBytes = item.getBytes(StandardCharsets.UTF_8).length;
            boolean first = cur.length() == 1;
            if (!first && curBytes + 1 + itemBytes + 1 > maxBytes) {
                out.add(cur.append(']').toString());
                cur = new StringBuilder("[");
                curBytes = 1;
                first = true;
            }
            if (!first) {
                cur.append(',');
                curBytes++;
            }
            cur.append(item);
            curBytes += itemBytes;
        }
        if (cur.length() > 1) {
            out.add(cur.append(']').toString());
        }
        return out;
    }

    /** JSON 문자열 리터럴 — 따옴표·역슬래시·제어 문자만 이스케이프한다. */
    private static String quote(String s) {
        StringBuilder b = new StringBuilder(s.length() + 2).append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') {
                b.append('\\').append(c);
            } else if (c < 0x20) {
                b.append(String.format("\\u%04x", (int) c));
            } else {
                b.append(c);
            }
        }
        return b.append('"').toString();
    }
}
