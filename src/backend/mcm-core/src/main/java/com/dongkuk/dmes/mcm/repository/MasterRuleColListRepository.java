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
     * MasterRuleFrameColListPopupMapper.GetRuleColList 의 MSSQL 변환, 분석 §6 / §11.1 C-001~C-004).
     *
     * <p>As-Is Oracle 메타 딕셔너리(ALL_TAB_COLUMNS + ALL_COL_COMMENTS) → To-Be
     * {@code INFORMATION_SCHEMA.COLUMNS} + {@code sys.extended_properties}(MS_Description = 컬럼 코멘트).
     * 변환점 (분석 §11.1):
     * <ul>
     *   <li>C-002 DECODE('VARCHAR'→'VARCHAR2') → CASE WHEN. MSSQL 타입을 As-Is LoV 도메인
     *       (VARCHAR2/NUMBER/DATE — ds_colType)으로 매핑: 문자→VARCHAR2, 숫자→NUMBER, 일시→DATE.
     *       (As-Is Oracle 은 타입명이 도메인과 자연 일치 — MSSQL 전환 의미 보존 보강, E2E 발견 2026-07-08)</li>
     *   <li>C-003 DATA_LENGTH/DATA_PRECISION → CHARACTER_MAXIMUM_LENGTH/NUMERIC_PRECISION.
     *       COL_LEN 은 COALESCE(문자max, 숫자precision, 날짜precision) — As-Is DATA_LENGTH 가 전 타입에
     *       값을 갖는 의미 보존 (미보강 시 date/decimal 컬럼 총길이 공란 → V-007 저장 불가, E2E 발견 2026-07-08)</li>
     *   <li>C-004 OWNER='MCA_SOURCE' → TABLE_SCHEMA='MCAAPUSER' (To-Be 정본 owner — 분석 §9.2)</li>
     *   <li>NOT IN — As-Is 19 식별자(audit 17 + RULE_VER + RULE_SEQ) 보존 + To-Be McmAuditEntity
     *       audit 9종(C_ 계열·U_ 계열·VER) 추가 제외. masterRuleData Q-006 확정(동적 테이블 audit =
     *       McmAuditEntity 체계)에 따른 후속 정합 — 미제외 시 To-Be 동적 테이블의 audit 가
     *       업무 컬럼으로 메타 조회에 잡힘 (2026-07-08 보강)</li>
     *   <li>ORDER BY ORDINAL_POSITION — As-Is 는 ORDER BY 부재였으나 MSSQL 비결정 순서 방지를 위한
     *       의도적 보강 (개발가이드 결정론 우선 — 체크리스트 기록)</li>
     * </ul>
     * {@code pTable} 은 파라미터 바인딩(동등 비교)이라 SQL injection 표면 없음.
     *
     * @return {@code Object[]{ ruleVer('1'), ruleId, colId, colNm, colType, colLen, colPrecLen,
     *         ioFlag('OUT'), masterCodeDiv('N') }}
     */
    @Query(value = """
            SELECT '1'                          AS ruleVer,
                   :pRuleId                     AS ruleId,
                   COL.COLUMN_NAME              AS colId,
                   CAST(EP.value AS NVARCHAR(400)) AS colNm,
                   CASE WHEN COL.DATA_TYPE IN ('varchar', 'nvarchar', 'char', 'nchar', 'text', 'ntext') THEN 'VARCHAR2'
                        WHEN COL.DATA_TYPE IN ('int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney', 'bit') THEN 'NUMBER'
                        WHEN COL.DATA_TYPE IN ('date', 'datetime', 'datetime2', 'smalldatetime', 'time', 'datetimeoffset') THEN 'DATE'
                        ELSE UPPER(COL.DATA_TYPE) END AS colType,
                   COALESCE(COL.CHARACTER_MAXIMUM_LENGTH, COL.NUMERIC_PRECISION, COL.DATETIME_PRECISION) AS colLen,
                   COL.NUMERIC_PRECISION        AS colPrecLen,   -- As-Is DATA_PRECISION 1:1 (C-003 — As-Is 도 scale 아닌 precision 반환, 운영자 확인 대상 초기값)
                   'OUT'                        AS ioFlag,
                   'N'                          AS masterCodeDiv
              FROM INFORMATION_SCHEMA.COLUMNS COL
              LEFT JOIN sys.columns SC
                ON SC.object_id = OBJECT_ID(QUOTENAME(COL.TABLE_SCHEMA) + '.' + QUOTENAME(COL.TABLE_NAME))
               AND SC.name = COL.COLUMN_NAME
              LEFT JOIN sys.extended_properties EP
                ON EP.class = 1
               AND EP.major_id = SC.object_id
               AND EP.minor_id = SC.column_id
               AND EP.name = 'MS_Description'
             WHERE COL.TABLE_NAME = :pTable
               AND COL.TABLE_SCHEMA = 'MCAAPUSER'
               AND COL.COLUMN_NAME NOT IN (
                   'CREATED_OBJECT_TYPE', 'CREATED_OBJECT_ID', 'CREATED_PROGRAM_ID', 'CREATION_TIMESTAMP',
                   'LAST_UPDATED_OBJECT_TYPE', 'LAST_UPDATED_OBJECT_ID', 'LAST_UPDATE_PROGRAM_ID', 'LAST_UPDATE_TIMESTAMP',
                   'DATA_END_STATUS', 'DATA_END_OBJECT_TYPE', 'DATA_END_OBJECT_ID', 'DATA_END_PROGRAM_ID', 'DATA_END_TIMESTAMP',
                   'ARCHIVE_COMPLETED_FLAG', 'ARCHIVED_EMPLOYEE_NUM', 'ARCHIVED_TIMESTAMP', 'ARCHIVE_PROGRAM_ID',
                   'RULE_VER', 'RULE_SEQ',
                   'C_USR_ID', 'C_AT', 'C_SVC_ID', 'C_PGM_ID', 'U_USR_ID', 'U_AT', 'U_SVC_ID', 'U_PGM_ID', 'VER')
             ORDER BY COL.ORDINAL_POSITION
            """, nativeQuery = true)
    List<Object[]> searchSourceTableColumns(@Param("pRuleId") String pRuleId,
                                            @Param("pTable") String pTable);

    /**
     * 컬럼정의 + PK 판정 조회 (cmb/masterRuleData lov — As-Is MasterRuleDataMapper.GetRuleColList
     * 의 MSSQL 변환, 분석 §6.1 #1 / §11).
     *
     * <p>As-Is Oracle {@code ALL_CONS_COLUMNS} + {@code NVL2(MAX(CONSTRAINT_NAME),'Y','N')} PK 판정 →
     * To-Be {@code INFORMATION_SCHEMA.KEY_COLUMN_USAGE + TABLE_CONSTRAINTS(PRIMARY KEY)} EXISTS 등가.
     * PK 판정 대상 테이블 = 'TB_MCA_' + pRuleId (As-Is Mapper:18 문자열 결합 — CONCAT + 바인딩).
     *
     * @return {@code Object[]{ RULE_ID, COL_SEQ, COL_ID, COL_NM, COL_LEN, COL_PREC_LEN,
     *         MES_COL_ID, CODE_YN, PK_YN, COL_TYPE, IO_FLAG }} — As-Is SELECT 별칭 1:1 (대문자)
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
                          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE K
                          JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS TC
                            ON TC.CONSTRAINT_NAME = K.CONSTRAINT_NAME
                           AND TC.TABLE_SCHEMA = K.TABLE_SCHEMA
                           AND TC.CONSTRAINT_TYPE = 'PRIMARY KEY'
                         WHERE K.TABLE_SCHEMA = 'MCAAPUSER'
                           AND K.TABLE_NAME = CONCAT('TB_MCA_', :pRuleId)
                           AND K.COLUMN_NAME = RCLIST.COL_ID)
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
