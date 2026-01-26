package sample;

import java.util.List;
import static java.util.Collections.emptyList;

public class Sample {
    public static final String CONST = "value";
    public int add(int a, int b) { return a + b; }
    protected void hidden() {}
    private void secret() {}
}

class PackagePrivate {
    public int value() { return 1; }
}
