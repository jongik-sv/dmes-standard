package usecase.errorBoundary;

import java.util.Random;

public class ThrowExceptionTask {
    public void execute() {
        throw new RuntimeException("Exception");
    }

    public void taskExceptionExecute() {
        throw new TaskRuntimeException("Exception");
    }

    public void randomExceptionGenerator() {
        Random random1 = new Random();
        int random = random1.nextInt();
        if (random % 2 == 0) {
            throw new RuntimeException("Exception");
        }
    }

    public void nothingDo() {
    }

}