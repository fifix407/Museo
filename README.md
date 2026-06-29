# Museo Virtual Interactivo

Un recorrido interactivo en 3D por un museo virtual inspirado en la arquitectura clásica de la Antigua Grecia y Roma, construido con HTML, CSS, y JavaScript utilizando **Three.js**.

## 🏛️ Características del Proyecto

* **Recorrido en 3D (Scroll-driven):** La navegación por el museo se realiza haciendo scroll hacia abajo en la página. La cámara sigue una ruta predefinida y suave a través del pasillo del museo.
* **Exhibiciones Dinámicas:** El museo cuenta con 5 estaciones que exhiben modelos 3D (`.stl`). Al acercarte a cada exhibición, la cámara gira automáticamente para enfocar la obra.
* **Control de Vista Interactivo:** Incluye botones laterales (flechas) que permiten al usuario tomar el control y girar la cámara hacia los lados para apreciar tanto las esculturas como los cuadros colgados en las paredes.
* **Carga de Modelos Reales:** Soporta la carga de modelos `.stl` reales (como Augusto, Afrodita, Zeus, etc.) y calcula automáticamente su escala y posicionamiento sobre los pedestales.
* **Galería de Cuadros:** En las paredes opuestas a las esculturas se pueden cargar imágenes `.jpg` reales dentro de la carpeta `img/` para exhibir cuadros enmarcados.
* **Arquitectura Procedural:** Las columnas jónicas, los pedestales romanos y los marcos de los cuadros están generados matemáticamente mediante código (geometrías de Three.js).
* **Partículas Ambientales:** Efectos de polvo suspendido y niebla para darle una atmósfera inmersiva y realista.

## 🛠️ Tecnologías

* **Three.js** (v0.160.0) para el renderizado 3D.
* **Vanilla JavaScript** (ES Modules) para la lógica de carga y animaciones.
* **HTML5 y CSS3** para la interfaz de usuario, los paneles informativos y los controles sobrepuestos.

## 🚀 Cómo ejecutarlo localmente

Dado que el proyecto utiliza módulos de ES6 y carga archivos externos (`.stl` e imágenes), es necesario ejecutarlo a través de un servidor local.

1. Abre una terminal en la carpeta del proyecto.
2. Inicia un servidor local. Si tienes Python instalado, puedes usar:
   ```bash
   python -m http.server 8080
   ```
3. Abre tu navegador y ve a `http://localhost:8080/`.

## 📂 Estructura de Archivos Importantes

* `index.html`: Estructura principal y paneles de texto informativos de las exhibiciones.
* `style.css`: Estilos visuales de la UI, botones y tipografías.
* `main.js`: Lógica principal del motor 3D, generadores de geometría, recorrido de la cámara y carga de modelos.
* `modelos/`: Carpeta donde se guardan los archivos 3D en formato `.stl` (ej. `agusto.stl`, `afrodita.stl`, `zeus.stl`).
* `img/`: Carpeta destinada a las imágenes (`.jpg`) que se mostrarán en los marcos de la pared (`cuadro-1.jpg`, `cuadro-2.jpg`, etc.).