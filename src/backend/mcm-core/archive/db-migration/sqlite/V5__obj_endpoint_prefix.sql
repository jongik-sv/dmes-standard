-- mcm-core V5__obj_endpoint_prefix.sql — OBJ 의 endpoint prefix 컬럼
-- 권한 부여 시 액션만 선택하면 endpoint = {prefix}/{action.toLowerCase()} 로 자동 생성된다.
-- 비어있으면 운영자가 endpoint 를 직접 입력해야 한다.

ALTER TABLE TB_SEC_OBJ ADD COLUMN ENDPOINT_PREFIX TEXT;
