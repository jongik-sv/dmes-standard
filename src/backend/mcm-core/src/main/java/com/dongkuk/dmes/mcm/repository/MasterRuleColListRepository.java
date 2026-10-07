package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.MasterRuleColList;
import com.dongkuk.dmes.mcm.entity.MasterRuleColListId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * 업무기준 구조관리 (cmb/masterRuleFrame) Repository — TB_MCA_RULE_COL_LIST.
 *
 * <p>설계: `docs/mcm/design/masterRuleFrame/masterRuleFrame_분석리포트.md` §6
 * (As-Is MasterRuleFrameMapper.GetRuleColInList/GetRuleColOutList) 의 JPQL 변환 +
 * 외부 공통 Mapper (TB_MCA_RULE_COL_LIST_Mapper.delete/insert) 의 흡수
 * ({@link #deleteByRuleId} + {@link JpaRepository#saveAll}) — BPMN설계서 §4.2.
 *
 * <p>저장 패턴 = RULE_ID 단위 delete-all-then-insert (BR-003, Service 가 orchestrate).
 */
public interface MasterRuleColListRepository extends JpaRepository<MasterRuleColList, MasterRuleColListId> {

    /**
     * IN/OUT 컬럼 조회 (As-Is GetRuleColInList/GetRuleColOutList 1:1 — 분석 §6.1).
     *
     * <p>As-Is INNER JOIN TB_MCA_RULE_MASTER (RMASTER.RULE_ID = RCLIST.RULE_ID) 은
     * 마스터 실존 행만 반환하는 의미 — EXISTS 서브쿼리로 동일 의미 보존 (연관관계 금지 — BE v2 §6).
     *
     * <p>WHERE: pRuleId 동등 비교 (공란 시 제외 — As-Is {@code <if>}) + IO_FLAG 고정값.
     * ORDER BY COL_SEQ (BR-016).
     */
    @Query("""
            SELECT c FROM MasterRuleColList c
             WHERE EXISTS (SELECT 1 FROM RuleMaster m WHERE m.ruleId = c.id.ruleId)
               AND (:pRuleId IS NULL OR :pRuleId = '' OR c.id.ruleId = :pRuleId)
               AND c.ioFlag = :ioFlag
             ORDER BY c.id.colSeq
            """)
    List<MasterRuleColList> searchRuleColList(@Param("pRuleId") String pRuleId,
                                              @Param("ioFlag") String ioFlag);

    /**
     * RULE_ID 단위 전체 삭제 (As-Is TB_MCA_RULE_COL_LIST_Mapper.delete — java:31~34).
     *
     * <p>반환값(삭제 행수)은 As-Is 와 동일하게 <b>미검증</b> (BR-015 — 검증 블록 주석 As-Is 보존).
     */
    @Modifying
    @Query("DELETE FROM MasterRuleColList c WHERE c.id.ruleId = :ruleId")
    int deleteByRuleId(@Param("ruleId") String ruleId);

    /**
     * 소스 테이블 컬럼 메타 조회 (cmb/masterRuleFrameColListPopup — As-Is
     * MasterRuleFrameColListPopupMapper.GetRuleColList 의 Oracle 사전 뷰 변환, 분석 §6 / §11.1 C-001~C-004).
     *
     * <p>As-Is 와 같은 Oracle 메타 사전({@code ALL_TAB_COLUMNS} + {@code ALL_COL_COMMENTS})으로 되돌렸다
     * (oracle-1007 c2 — 예전 MSSQL {@code INFORMATION_SCHEMA.COLUMNS} + {@code sys.extended_properties} 폐기).
     * 변환점 (분석 §11.1):
     * <ul>
     *   <li>C-002 DECODE('VARCHAR'→'VARCHAR2') → CASE WHEN. Oracle DATA_TYPE 을 As-Is LoV 도메인
     *       (VARCHAR2/NUMBER/DATE — ds_colType)으로 맞춘다: 문자(VARCHAR2·NVARCHAR2·CHAR·NCHAR·VARCHAR·CLOB·NCLOB)→VARCHAR2,
     *       숫자(NUMBER·FLOAT·BINARY_FLOAT·BINARY_DOUBLE·INTEGER)→NUMBER, 일시(DATE·{@code TIMESTAMP(n)}…)→DATE.
     *       그 밖의 형은 DATA_TYPE 그대로. 하위 서비스(masterRuleData 계열)는 이 도메인 값('VARCHAR2'·'DATE')만 비교한다.</li>
     *   <li>C-003 COL_LEN = {@code COALESCE(NULLIF(CHAR_LENGTH,0), DATA_PRECISION, DATA_LENGTH)}.
     *       문자형은 선언 글자 수(CHAR_LENGTH — 기준선이 {@code n CHAR} 라 DATA_LENGTH 는 바이트 수로 부풀어 있다),
     *       숫자형은 정밀도, 그 밖(DATE 7·TIMESTAMP 11·정밀도 없는 NUMBER 22)은 DATA_LENGTH — As-Is DATA_LENGTH 처럼
     *       전 타입에 값이 있게 한다(공란이면 V-007 저장 불가, E2E 발견 2026-07-08).
     *       COL_PREC_LEN = DATA_PRECISION (As-Is 1:1 — scale 아닌 precision).</li>
     *   <li>C-004 OWNER='MCA_SOURCE' → OWNER='MCAAPUSER' (To-Be 정본 owner — 분석 §9.2). 표 이름은 Oracle 사전이
     *       대문자로 보관하므로 {@code UPPER(:pTable)} 로 비교한다.</li>
     *   <li>NOT IN — As-Is 19 식별자(audit 17 + RULE_VER + RULE_SEQ) 보존 + To-Be McmAuditEntity
     *       audit 9종(C_ 계열·U_ 계열·VER) 추가 제외 (2026-07-08 보강)</li>
     *   <li>ORDER BY COLUMN_ID — As-Is 는 ORDER BY 부재였으나 비결정 순서 방지를 위한 의도적 보강.</li>
     * </ul>
     *
     * <p><b>빈 결과의 뜻이 둘이다</b> — {@code ALL_*} 사전 뷰는 접속 사용자에게 권한이 없는 표를 오류 없이 빼고 돌려준다.
     * 그래서 결과가 비면 "표·칸이 없다" 와 "MCMAPUSER 가 MCAAPUSER 표를 볼 권한이 없다" 를 구분할 수 없다
     * (MCAAPUSER 기준선의 GRANT 가 빠지면 팝업이 조용히 0 건이 된다).
     *
     * {@code pTable} 은 파라미터 바인딩(동등 비교)이라 SQL injection 표면 없음.
     *
     * @return {@code Object[]{ ruleVer('1'), ruleId, colId, colNm, colType, colLen, colPrecLen,
     *         ioFlag('OUT'), masterCodeDiv('N') }} — 위치로 읽는다(별칭 대소문자 무관)
     */
    @Query(value = """
            SELECT '1'                          AS ruleVer,
                   :pRuleId                     AS ruleId,
                   COL.COLUMN_NAME              AS colId,
                   SUBSTR(COM.COMMENTS, 1, 400) AS colNm,
                   CASE WHEN COL.DATA_TYPE IN ('VARCHAR2', 'NVARCHAR2', 'CHAR', 'NCHAR', 'VARCHAR', 'CLOB', 'NCLOB', 'LONG') THEN 'VARCHAR2'
                        WHEN COL.DATA_TYPE IN ('NUMBER', 'FLOAT', 'BINARY_FLOAT', 'BINARY_DOUBLE', 'INTEGER') THEN 'NUMBER'
                        WHEN COL.DATA_TYPE = 'DATE' OR COL.DATA_TYPE LIKE 'TIMESTAMP%' THEN 'DATE'
                        ELSE COL.DATA_TYPE END  AS colType,
                   COALESCE(NULLIF(COL.CHAR_LENGTH, 0), COL.DATA_PRECISION, COL.DATA_LENGTH) AS colLen,
                   COL.DATA_PRECISION           AS colPrecLen,   -- As-Is DATA_PRECISION 1:1 (C-003 — As-Is 도 scale 아닌 precision 반환, 운영자 확인 대상 초기값)
                   'OUT'                        AS ioFlag,
                   'N'                          AS masterCodeDiv
              FROM ALL_TAB_COLUMNS COL
              LEFT JOIN ALL_COL_COMMENTS COM
                ON COM.OWNER = COL.OWNER
               AND COM.TABLE_NAME = COL.TABLE_NAME
               AND COM.COLUMN_NAME = COL.COLUMN_NAME
             WHERE COL.OWNER = 'MCAAPUSER'
               AND COL.TABLE_NAME = UPPER(:pTable)
               AND COL.COLUMN_NAME NOT IN (
                   'CREATED_OBJECT_TYPE', 'CREATED_OBJECT_ID', 'CREATED_PROGRAM_ID', 'CREATION_TIMESTAMP',
                   'LAST_UPDATED_OBJECT_TYPE', 'LAST_UPDATED_OBJECT_ID', 'LAST_UPDATE_PROGRAM_ID', 'LAST_UPDATE_TIMESTAMP',
                   'DATA_END_STATUS', 'DATA_END_OBJECT_TYPE', 'DATA_END_OBJECT_ID', 'DATA_END_PROGRAM_ID', 'DATA_END_TIMESTAMP',
                   'ARCHIVE_COMPLETED_FLAG', 'ARCHIVED_EMPLOYEE_NUM', 'ARCHIVED_TIMESTAMP', 'ARCHIVE_PROGRAM_ID',
                   'RULE_VER', 'RULE_SEQ',
                   'C_USR_ID', 'C_AT', 'C_SVC_ID', 'C_PGM_ID', 'U_USR_ID', 'U_AT', 'U_SVC_ID', 'U_PGM_ID', 'VER')
             ORDER BY COL.COLUMN_ID
            """, nativeQuery = true)
    List<Object[]> searchSourceTableColumns(@Param("pRuleId") String pRuleId,
                                            @Param("pTable") String pTable);

    /**
     * 컬럼정의 + PK 판정 조회 (cmb/masterRuleData lov — As-Is MasterRuleDataMapper.GetRuleColList
     * 의 Oracle 사전 뷰 변환, 분석 §6.1 #1 / §11).
     *
     * <p>As-Is Oracle {@code ALL_CONS_COLUMNS} + {@code NVL2(MAX(CONSTRAINT_NAME),'Y','N')} PK 판정 →
     * {@code ALL_CONSTRAINTS(CONSTRAINT_TYPE='P') + ALL_CONS_COLUMNS} EXISTS 등가 (oracle-1007 c2 — 예전 MSSQL
     * INFORMATION_SCHEMA 폐기). PK 판정 대상 = OWNER 'MCAAPUSER' 의 {@code UPPER('TB_MCA_' || pRuleId)}
     * (As-Is Mapper:18 문자열 결합). 칸 이름도 사전이 대문자로 보관하므로 {@code UPPER(COL_ID)} 로 비교한다
     * (예전 MSSQL 은 대소문자 무시 정렬이라 같은 뜻).
     *
     * <p>ALL_* 사전 뷰는 권한이 없는 표를 오류 없이 뺀다 — PK 표가 안 보이면 모든 칸이 PK_YN='N' 이 되고,
     * 그것이 "PK 없음" 인지 "권한 없음" 인지 이 결과로는 구분할 수 없다.
     *
     * @return {@code Object[]{ RULE_ID, COL_SEQ, COL_ID, COL_NM, COL_LEN, COL_PREC_LEN,
     *         MES_COL_ID, CODE_YN, PK_YN, COL_TYPE, IO_FLAG }} — As-Is SELECT 별칭 1:1 (대문자), 위치로 읽는다
     */
    @Query(value = """
            SELECT RCLIST.RULE_ID,
                   RCLIST.COL_SEQ,
                   RCLIST.COL_ID,
                   RCLIST.COL_NM,
                   RCLIST.COL_LEN,
                   RCLIST.COL_PREC_LEN,
                   RCLIST.MES_COL_ID,
                   RCLIST.MASTER_CODE_DIV AS CODE_YN,
                   CASE WHEN EXISTS (
                        SELECT 1
                          FROM ALL_CONSTRAINTS C
                          JOIN ALL_CONS_COLUMNS K
                            ON K.OWNER = C.OWNER
                           AND K.CONSTRAINT_NAME = C.CONSTRAINT_NAME
                           AND K.TABLE_NAME = C.TABLE_NAME
                         WHERE C.OWNER = 'MCAAPUSER'
                           AND C.CONSTRAINT_TYPE = 'P'
                           AND C.TABLE_NAME = UPPER('TB_MCA_' || :pRuleId)
                           AND K.COLUMN_NAME = UPPER(RCLIST.COL_ID))
                        THEN 'Y' ELSE 'N' END AS PK_YN,
                   RCLIST.COL_TYPE,
                   RCLIST.IO_FLAG
              FROM MCAAPUSER.TB_MCA_RULE_COL_LIST RCLIST
              JOIN MCAAPUSER.TB_MCA_RULE_MASTER RMASTER
                ON RMASTER.RULE_ID = RCLIST.RULE_ID
             WHERE RCLIST.RULE_ID = :pRuleId
             ORDER BY RCLIST.COL_SEQ
            """, nativeQuery = true)
    List<Object[]> searchRuleColDefsWithPk(@Param("pRuleId") String pRuleId);
}
