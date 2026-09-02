package usecase.transactionalSubService;

import com.dongkuk.oasis.audit.Audit;

public class TestAudit implements Audit {
    private String createBy;

    public TestAudit(String createBy) {
        this.createBy = createBy;
    }

    public String getCreateBy() {
        return createBy;
    }
}
