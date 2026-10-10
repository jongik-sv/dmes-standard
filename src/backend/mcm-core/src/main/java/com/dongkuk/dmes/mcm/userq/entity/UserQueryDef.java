package com.dongkuk.dmes.mcm.userq.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 공용 쿼리 정의 — 스펙 2026-10-10-user-query-program-design §2.
 * SQL 은 한 문장 SELECT·WITH 만(SqlGuard 검사), 입력 정의(PARAMS_JSON)·출력 정의(COLUMNS_JSON)는
 * 위젯 {@code QueryParam}·{@code TableColumnConfig} 모양의 JSON 글자다.
 * CLOB 칸은 {@code @Lob} 이 아닌 LONG32VARCHAR 로 둔다(W-D30, WidgetDef CONFIG_JSON 와 같은 이유).
 */
@Entity
@Table(name = "TB_MCM_USRQ_DEF", schema = "MCMAPUSER")
public class UserQueryDef extends McmAuditEntity {

    @Id
    @Column(name = "QUERY_ID", length = 40, nullable = false)
    private String queryId;

    @Column(name = "QUERY_NM", length = 100, nullable = false)
    private String queryNm;

    /** 분류 — 공통코드 그룹 USRQ_CTG 값. */
    @Column(name = "CATEGORY_CD", length = 20)
    private String categoryCd;

    @Column(name = "QUERY_DESC", length = 500)
    private String queryDesc;

    /** 담당 부서 — TB_MCM_DEPT_INFO.DEPT_CD 와 같은 길이. 외래 키 없음. */
    @Column(name = "OWNER_DEPT_CD", length = 10)
    private String ownerDeptCd;

    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "SQL_TEXT", nullable = false)
    private String sqlText;

    /** 입력 정의 — 위젯 QueryParam 배열 JSON. QueryParams.parse 검사를 지나야 한다. */
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "PARAMS_JSON")
    private String paramsJson;

    /** 출력 정의 — 위젯 TableColumnConfig 배열 JSON. §2.2 검사를 지나야 한다. */
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "COLUMNS_JSON")
    private String columnsJson;

    /** 행 상한 — 실행 때 상한+1 행을 읽고 넘으면 버린 뒤 truncated. */
    @Column(name = "MAX_ROW_CNT", nullable = false)
    private Integer maxRowCnt = 1000;

    /** DDL 이 char(1 char) 라 hbm2ddl validate 가 CHAR 형을 기대한다(String 기본은 VARCHAR). */
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "USE_YN", length = 1, nullable = false)
    private String useYn = "Y";

    public UserQueryDef() {}

    public boolean isInUse() { return "Y".equals(useYn); }

    public String getQueryId() { return queryId; }
    public void setQueryId(String queryId) { this.queryId = queryId; }
    public String getQueryNm() { return queryNm; }
    public void setQueryNm(String queryNm) { this.queryNm = queryNm; }
    public String getCategoryCd() { return categoryCd; }
    public void setCategoryCd(String categoryCd) { this.categoryCd = categoryCd; }
    public String getQueryDesc() { return queryDesc; }
    public void setQueryDesc(String queryDesc) { this.queryDesc = queryDesc; }
    public String getOwnerDeptCd() { return ownerDeptCd; }
    public void setOwnerDeptCd(String ownerDeptCd) { this.ownerDeptCd = ownerDeptCd; }
    public String getSqlText() { return sqlText; }
    public void setSqlText(String sqlText) { this.sqlText = sqlText; }
    public String getParamsJson() { return paramsJson; }
    public void setParamsJson(String paramsJson) { this.paramsJson = paramsJson; }
    public String getColumnsJson() { return columnsJson; }
    public void setColumnsJson(String columnsJson) { this.columnsJson = columnsJson; }
    public Integer getMaxRowCnt() { return maxRowCnt; }
    public void setMaxRowCnt(Integer maxRowCnt) { this.maxRowCnt = maxRowCnt; }
    public String getUseYn() { return useYn; }
    public void setUseYn(String useYn) { this.useYn = useYn; }
}
