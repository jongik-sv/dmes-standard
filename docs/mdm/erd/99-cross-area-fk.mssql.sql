-- TSK-02-03 교차 영역 후행 FK(MSSQL 전용) — design.md §6.6, D7
-- 02~06 DDL(02·03·04·05·06 mssql.sql) 전부 적용한 뒤 마지막에 실행한다. 실행·실측하지 않는다(F4).
-- 03 내부 순환 FK(EAI↔LAYOUT)는 03-interface-layout.mssql.sql 자체에서 처리하므로 여기 없다.

ALTER TABLE TB_MDM_DOMAIN
    ADD CONSTRAINT FK_TB_MDM_DOMAIN_CODE FOREIGN KEY (MARU_CODE_ID) REFERENCES TB_MDM_CODE (MARU_CODE_ID);
