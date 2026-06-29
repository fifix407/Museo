package jar.patterns.strategy;

import jar.models.Obra;
import java.util.List;

public class SinFiltro implements ObraFilter {
    @Override
    public List<Obra> filtrar(List<Obra> obras) {
        return obras;
    }
}
