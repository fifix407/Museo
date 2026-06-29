package jar.patterns.strategy;

import jar.models.Obra;
import java.util.List;

public interface ObraFilter {
    List<Obra> filtrar(List<Obra> obras);
}
