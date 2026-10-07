package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.common.support.MdmStrings;
import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * 한 번도 RELEASED 되지 않은 마루 코드 통째 삭제의 참조 조회·행 삭제(2026-09-28 사용자 결정 — "릴리즈된 적이 없다면 폐기
 * 버튼이 삭제가 되도록"). 원천 명세 04 에 마루 코드 물리 삭제 규정이 없어 새로 둔 부품이다. 판정·거부 문구는 호출자
 * ({@code CodeEditService})가 정하고, 이 부품은 사실만 돌려준다.
 *
 * <p>지우는 표(FK 안전 순서): TB_MDM_CODE_CATE_ITEM → TB_MDM_CODE_CATE → TB_MDM_CODE_ITEM → TB_MDM_CODE_VER →
 * TB_MDM_CODE_SYSTEM. TB_MDM_CODE 는 호출자가 엔티티 경로로 지운다(TB_MDM_CODE 쓰기는 엔티티 경로 하나, CodeEditService
 * 관례). DRAFT 선점(OWNER_ID)·편집 이력(선분)은 VER·선분 행에 있어 함께 사라진다. 수신 로그(TB_MDM_CODE_RECV)는 감사 성격이라
 * 지우지 않고 행이 있으면 호출자가 삭제를 거부한다. 배포 순번은 TB_MDM_CODE.LAST_CHG_SEQ(행과 함께 사라짐)와 사전 종류별
 * TB_MDM_DICT_SEQ(코드별 행이 아님)라 따로 지울 것이 없다.
 *
 * <p>식 참조는 저장된 텍스트에서 {@code MASTER(…)}·{@code MASTER_AT(…)} 의 첫 인자가 이 ID 인지 본다 — 식 텍스트
 * ({@code MASTER("ID"}·{@code MASTER('ID'}, JSON 안의 {@code \"ID\"} 포함)와 AST JSON({@code "value":"MASTER","params":
 * [{…"value":"ID"}}) 두 모양. SQL 은 {@code LIKE '%MASTER%'} 로 후보만 거르고 판정은 Java 정규식으로 한다(방언 차이 회피).
 * 버전을 가리지 않는다 — 과거 버전의 식도 이 코드를 찾는다.
 */
@Component
public class MasterCodeRemoval {

    /** 행 삭제 순서 — 자식 → 부모(CASCADE 를 쓰지 않는다, V9 불변 규칙 8). */
    static final List<String> CHILD_TABLES = List.of("TB_MDM_CODE_CATE_ITEM", "TB_MDM_CODE_CATE", "TB_MDM_CODE_ITEM",
            "TB_MDM_CODE_VER", "TB_MDM_CODE_SYSTEM");

    /** 식 참조를 찾는 곳: 표, 행 표시 머리, 행을 가리키는 칼럼들, 식 칼럼들. */
    private record ExprSource(String table, String label, List<String> keys, List<String> columns, String exclude) {
    }

    private static final List<ExprSource> EXPR_SOURCES = List.of(
            new ExprSource("TB_MDM_DOMAIN", "도메인", List.of("DOMAIN_ID"),
                    List.of("STD_RULE", "STD_AST", "BIZ_RULE", "BIZ_AST"), null),
            new ExprSource("TB_MDM_RULE_VAR", "룰 변수", List.of("MARU_RULE_ID", "VER", "VAR_ID"),
                    List.of("VAR_AST", "GRP_COND", "GRP_COND_AST"), null),
            new ExprSource("TB_MDM_RULE_ROW", "룰 행", List.of("MARU_RULE_ID", "VER", "ROW_ID"),
                    List.of("CELLS"), null),
            new ExprSource("TB_MDM_CODE_CATE", "마루 코드 카테고리", List.of("MARU_CODE_ID", "CATE_ID"),
                    List.of("DEF_EXPR"), "MARU_CODE_ID"),
            new ExprSource("TB_MDM_DATA_CATE", "마루 데이터 카테고리", List.of("MARU_DATA_ID", "CATE_ID"),
                    List.of("DEF_EXPR"), null));

    private final EntityManager entityManager;

    public MasterCodeRemoval(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    /** TB_MDM_DOMAIN.MARU_CODE_ID 가 이 코드를 가리키는 도메인 ID(오름차순). */
    public List<String> referencingDomainIds(String maruCodeId) {
        List<?> rows = entityManager.createNativeQuery(
                        "SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE MARU_CODE_ID = :id ORDER BY DOMAIN_ID")
                .setParameter("id", maruCodeId).getResultList();
        return rows.stream().map(String::valueOf).toList();
    }

    /** TB_MDM_CODE_RECV(수신 로그) 행 수. */
    public long receiptCount(String maruCodeId) {
        Object n = entityManager.createNativeQuery("SELECT COUNT(*) FROM TB_MDM_CODE_RECV WHERE MARU_CODE_ID = :id")
                .setParameter("id", maruCodeId).getSingleResult();
        return ((Number) n).longValue();
    }

    /** 이 코드를 {@code MASTER}·{@code MASTER_AT} 첫 인자로 쓰는 식의 자리("도메인 3 STD_RULE" 모양). 이 코드 자신의 카테고리는 뺀다. */
    public List<String> expressionReferences(String maruCodeId) {
        String id = Pattern.quote(maruCodeId);
        Pattern text = Pattern.compile("(?i:MASTER(?:_AT)?)\\s*\\(\\s*\\\\?[\"']" + id + "\\\\?[\"']");
        Pattern ast = Pattern.compile("\"value\"\\s*:\\s*\"(?i:MASTER(?:_AT)?)\"\\s*,\\s*\"params\"\\s*:\\s*\\[\\s*\\{[^{}]*"
                + "\"value\"\\s*:\\s*\"" + id + "\"");
        List<String> out = new ArrayList<>();
        for (ExprSource src : EXPR_SOURCES) {
            StringBuilder sql = new StringBuilder("SELECT ").append(String.join(", ", src.keys()));
            src.columns().forEach(c -> sql.append(", ").append(c));
            sql.append(" FROM ").append(src.table()).append(" WHERE (");
            // 대소문자 무시(식은 master(…) 로도 쓴다, SQLite LIKE 와 같은 후보) — UPPER 는 CLOB 칼럼에도 된다.
            sql.append(String.join(" OR ", src.columns().stream().map(c -> "UPPER(" + c + ") LIKE '%MASTER%'").toList()));
            sql.append(")");
            if (src.exclude() != null) {
                sql.append(" AND ").append(src.exclude()).append(" <> :self");
            }
            var query = entityManager.createNativeQuery(sql.toString());
            if (src.exclude() != null) {
                query.setParameter("self", maruCodeId);
            }
            for (Object row : query.getResultList()) {
                Object[] r = (Object[]) row;
                int k = src.keys().size();
                for (int i = 0; i < src.columns().size(); i++) {
                    Object value = r[k + i];
                    if (value == null) {
                        continue;
                    }
                    // STD_AST·BIZ_AST·VAR_AST·GRP_COND_AST·CELLS 는 CLOB 이라 Clob 으로 온다 — toString() 이면 내용이 아니다.
                    String s = MdmStrings.text(value);
                    if (text.matcher(s).find() || ast.matcher(s).find()) {
                        List<String> key = new ArrayList<>();
                        for (int j = 0; j < k; j++) {
                            key.add(String.valueOf(r[j]));
                        }
                        out.add(src.label() + " " + String.join("/", key) + " " + src.columns().get(i));
                    }
                }
            }
        }
        return out;
    }

    /** 자식 표 행을 FK 안전 순서로 지운다. 앞선 엔티티 변경이 네이티브 DELETE 뒤에 섞이지 않게 먼저 flush 한다. */
    public void deleteChildRows(String maruCodeId) {
        entityManager.flush();
        for (String table : CHILD_TABLES) {
            entityManager.createNativeQuery("DELETE FROM " + table + " WHERE MARU_CODE_ID = :id")
                    .setParameter("id", maruCodeId).executeUpdate();
        }
    }
}
