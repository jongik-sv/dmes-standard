package kr.dongkuk.maru.mdm.engine.spi;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * 마루 코드 행 조회 — 다섯 테이블 행을 해석 없이 그대로 돌려준다(06-business-rule.md:461).
 * 버전 선택·소급·카테고리 해석은 {@code engine.code} 가 한다(06:468). 원장 서버 구현체는 원장 표를,
 * 하위 시스템 구현체는 배포 사본을 읽는다.
 *
 * <p>일시는 KST 벽시계 {@link LocalDateTime}(naming-dialect-rules §3 #16). 열린 끝은 {@code 9999-12-31T00:00}.
 * 버전 번호는 {@code DECIMAL(7,3)} 을 {@link BigDecimal} scale 3 으로 싣는다(#17). 열린 {@code to_ver} 는 9999.
 */
public interface CodeLookup {

    /** 마루 코드가 없으면 빈 값. 있으면 {@code MASTER} 는 마루 코드 대상으로 판정한다(05:363 — 첫 인자로 가른다). */
    Optional<CodeRows> code(String maruCodeId);

    /**
     * 버전 {@code ver} 판정에 필요한 행(D-154, 결정 P7). 기본은 {@link #code} 의 전체 행 — 원장·옛 구현은 바꿀 것이 없다. 업무 모듈 캐시는 버전 본문
     * 하나(그 버전 1행·유효 items·고른 카테고리 정의)를 준다. {@code engine.code} 는 버전 선택·DEPRECATED 판단에만 {@link #code} 를 쓰고 items·카테고리
     * 계산에는 이것을 쓴다.
     */
    default Optional<CodeRows> codeAt(String maruCodeId, BigDecimal ver) {
        return code(maruCodeId);
    }

    /** 04:969-1040 의 다섯 테이블 행(배포 대상·수신 로그 표는 싣지 않는다). */
    record CodeRows(
            CodeHeader header,
            List<CodeVersionRow> versions,
            List<CodeItemRow> items,
            List<CodeCateRow> categories,
            List<CodeCateItemRow> cateItems) {}

    /** TB_MDM_CODE — status 는 CREATED/INUSE/DEPRECATED. DEPRECATED 는 CODE_LIST 빈 목록(02:426). */
    record CodeHeader(String maruCodeId, String status) {}

    /** TB_MDM_CODE_VER — RELEASED 만 판정에 쓰고 CANCELLED 는 제외(02:403). 사본 구현체는 RELEASED 만 실어도 된다. */
    record CodeVersionRow(BigDecimal ver, String status, LocalDateTime applyFrom, LocalDateTime applyTo) {}

    /**
     * TB_MDM_CODE_ITEM — {@code from_ver <= V < to_ver} 이면 V 에 유효(04:194).
     *
     * @param lvl   lvl1-lvl5, 길이 5 고정(빈 칸은 null)
     * @param attrs attr01-attr10, 길이 10 고정(빈 칸은 null). {@code MASTER(…, "attrNN")} 이 문자열 그대로 돌려준다
     */
    record CodeItemRow(
            String code,
            BigDecimal fromVer,
            BigDecimal toVer,
            String name,
            String alterName,
            Integer seq,
            List<String> lvl,
            List<String> attrs) {}

    /** TB_MDM_CODE_CATE — defKind REGEX/TABLE, defTarget CODE·LVL1-5·ATTR01-10(REGEX 전용, 04:178). */
    record CodeCateRow(
            String cateId,
            BigDecimal fromVer,
            BigDecimal toVer,
            String defKind,
            String defExpr,
            String defTarget) {}

    /** TB_MDM_CODE_CATE_ITEM — TABLE 카테고리 소속(04:1035-1040). */
    record CodeCateItemRow(String cateId, String code, BigDecimal fromVer, BigDecimal toVer) {}
}
