package jar.controllers;

import jar.models.Obra;
import jar.patterns.strategy.FiltroPorTipo;
import jar.patterns.strategy.SinFiltro;
import jar.services.ObraServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/obras")
@CrossOrigin(origins = "*") // Permite peticiones desde cualquier origen (ej. frontend Three.js)
public class ObraController {

    private final ObraServiceImpl obraService;

    @Autowired
    public ObraController(ObraServiceImpl obraService) {
        this.obraService = obraService;
    }

    @GetMapping
    public List<Obra> obtenerObras(@RequestParam(required = false) String tipo) {
        // Utilizamos el Strategy Pattern para elegir el filtro adecuado
        if (tipo != null && !tipo.isEmpty()) {
            return obraService.obtenerObrasProcesadas(new FiltroPorTipo(tipo));
        } else {
            return obraService.obtenerObrasProcesadas(new SinFiltro());
        }
    }
}
