# Diagramas UML para Patrones de Diseño - Museo Virtual 3D

## 1. Patrón Factory Method (Creacional)

Contexto: Se encarga de instanciar el tipo de obra correcta según la estación del recorrido 3D en la que se encuentre el usuario.

### Diagrama de Clases (Estructura)
```mermaid
classDiagram
    class Obra {
        <<interface>>
        +cargarDetalles() void
    }
    class Pintura {
        +cargarDetalles() void
    }
    class Modelo3D {
        +cargarDetalles() void
    }
    class ObraFactory {
        +crearObra(tipo: String) Obra
    }
    
    Obra <|.. Pintura
    Obra <|.. Modelo3D
    ObraFactory ..> Pintura : Crea
    ObraFactory ..> Modelo3D : Crea
```

### Diagrama de Secuencia (Interacción)
```mermaid
sequenceDiagram
    participant Frontend
    participant Controlador as ObraController
    participant Factory as ObraFactory
    participant Instancia as :Modelo3D
    
    Frontend->>Controlador: Cargar estación
    activate Controlador
    Controlador->>Factory: crearObra("3D")
    activate Factory
    Factory->>Instancia: new Modelo3D()
    activate Instancia
    Instancia-->>Factory: Instancia Modelo3D
    deactivate Instancia
    Factory-->>Controlador: Modelo3D
    deactivate Factory
    Controlador-->>Frontend: Datos de la obra
    deactivate Controlador
```

---

## 2. Patrón Singleton (Creacional)

Contexto: Carga y mantiene en memoria la configuración pesada del museo y las rutas de los archivos (JSON) una sola vez al arrancar el servidor para no saturar lecturas en disco.

### Diagrama de Clases (Estructura)
```mermaid
classDiagram
    class JsonDataLoader {
        -static instance: JsonDataLoader
        -JsonDataLoader()
        +static getInstance() JsonDataLoader
    }
```

### Diagrama de Secuencia (Interacción)
```mermaid
sequenceDiagram
    participant Servidor
    participant Usuario
    participant Loader as JsonDataLoader (Clase)
    participant Instancia as :JsonDataLoader
    
    Servidor->>Loader: getInstance()
    activate Loader
    Loader->>Instancia: new JsonDataLoader()
    activate Instancia
    Instancia->>Instancia: Leer JSON del disco
    Instancia-->>Loader: instance
    deactivate Instancia
    Loader-->>Servidor: instance
    deactivate Loader
    
    Note over Usuario,Loader: El usuario scrollea y pide datos
    Usuario->>Loader: getInstance()
    activate Loader
    Loader-->>Usuario: instance
    deactivate Loader
    Usuario->>Instancia: Solicitar datos
    activate Instancia
    Instancia-->>Usuario: Datos cacheados en RAM
    deactivate Instancia
```

---

## 3. Patrón Strategy (Comportamiento)

Contexto: Permite al usuario filtrar dinámicamente qué tipo de obras ver en su recorrido.

### Diagrama de Clases (Estructura)
```mermaid
classDiagram
    class ObraService {
        -filtro: ObraFilter
        +setFilter(filtro: ObraFilter) void
    }
    class ObraFilter {
        <<interface>>
        +filtrar() List~Obra~
    }
    class SinFiltro {
        +filtrar() List~Obra~
    }
    class FiltroPorTipo {
        -tipo: String
        +filtrar() List~Obra~
    }
    
    ObraService o--> ObraFilter
    ObraFilter <|.. SinFiltro
    ObraFilter <|.. FiltroPorTipo
```

### Diagrama de Secuencia (Interacción)
```mermaid
sequenceDiagram
    participant Frontend
    participant Controlador as ObraController
    participant Servicio as ObraService
    participant Estrategia as :FiltroPorTipo
    
    Frontend->>Controlador: Evento "Filtrar por Esculturas"
    activate Controlador
    Controlador->>Servicio: aplicar filtro
    activate Servicio
    Servicio->>Estrategia: new FiltroPorTipo("Escultura")
    Servicio->>Servicio: setFilter(Estrategia)
    Servicio->>Estrategia: filtrar()
    activate Estrategia
    Note over Estrategia: Ejecuta el filtrado sobre la lista completa
    Estrategia-->>Servicio: lista limpia
    deactivate Estrategia
    Servicio-->>Controlador: lista limpia
    deactivate Servicio
    Controlador-->>Frontend: lista limpia
    deactivate Controlador
```

---

## 4. Patrón Template Method (Comportamiento)

Contexto: Define los pasos estrictos para procesar los datos de una obra y enviarlos al frontend, delegando detalles específicos a las subclases.

### Diagrama de Clases (Estructura)
```mermaid
classDiagram
    class AbstractObraService {
        <<abstract>>
        +procesarObra() Obra
        #validar() void
        #cargarMetadatos() void
        #adjuntarDetallesEspecificos() void*
    }
    class PinturaService {
        #adjuntarDetallesEspecificos() void
    }
    class Monumento3DService {
        #adjuntarDetallesEspecificos() void
    }
    
    AbstractObraService <|-- PinturaService
    AbstractObraService <|-- Monumento3DService
```

### Diagrama de Secuencia (Interacción)
```mermaid
sequenceDiagram
    participant Controlador
    participant Base as AbstractObraService
    participant Hija as Monumento3DService
    
    Controlador->>Hija: procesarObra()
    activate Hija
    Hija->>Base: procesarObra() (Heredado)
    activate Base
    Base->>Base: validar()
    Base->>Base: cargarMetadatos()
    
    Note over Base,Hija: Delega detalle a la clase hija
    Base->>Hija: adjuntarDetallesEspecificos()
    Note over Hija: Procesa el archivo STL
    Hija-->>Base: detalles adjuntados
    
    Base-->>Hija: obra completa
    deactivate Base
    Hija-->>Controlador: obra completa
    deactivate Hija
```
