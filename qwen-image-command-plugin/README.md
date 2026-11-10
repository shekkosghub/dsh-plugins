# Qwen Image Command Plugin for DeepSeek Harness

Un plugin para DeepSeek Harness que genera imágenes con el modelo **qwen-image-3.0-pro** (Alibaba Token Plan) directamente desde la caja de prompt, sin pasar por el agente.

## Características

- 🎨 Generación de imágenes texto → imagen (`T2I`)
- 🖼️ Edición de imágenes imagen → imagen (`I2I`) con `--edit`
- ⚡ Ejecución directa sin gastar tokens de chat
- 📝 Nombres de archivo legibles derivados del prompt
- 🔐 API key leída del entorno o del almacén de credenciales de DSH
- 📐 Control de tamaño, modelo y ruta de salida con flags

## Instalación

1. Copia la carpeta `qwen-image-command-plugin` a tu repo de plugins (o a tu workspace)
2. En `~/.dsh/profiles/web/package.json` añade la dependencia y el bundle:

   ```json
   "dependencies": {
     "@local/qwen-image-command": "link:/ruta/a/qwen-image-command-plugin"
   },
   "dsh": {
     "profile": {
       "bundles": [ "...", "@local/qwen-image-command" ]
     }
   }
   ```

3. Enlaza el paquete en el perfil:

   ```bash
   ln -s /ruta/a/qwen-image-command-plugin ~/.dsh/profiles/web/node_modules/@local/qwen-image-command
   ```

4. Reinicia `dsh web`

## Configuración

### Paso 1: Obtener la API key de Alibaba Cloud

1. Ve a la consola de [Alibaba Cloud Model Studio](https://www.alibabacloud.com/) (plan Token Plan)
2. Crea una API key para tu workspace
3. Guárdala como variable de entorno `QWEN_TOKEN_PLAN_INDIVIDUAL_API_KEY` o agrégala en las credenciales de DSH (`~/.dsh/.credentials.yaml` bajo `refs:`)

La variable de entorno, el modelo y el directorio de salida se pueden cambiar en el `cordis.patch.yml` del plugin:

```yaml
config:
  model: qwen-image-3.0-pro
  outputDir: out
  apiKeyEnv: QWEN_TOKEN_PLAN_INDIVIDUAL_API_KEY
```

## Uso

### Generar una imagen

```
/imagen un pingüino tocando el piano, estilo óleo
```

La imagen se guarda en `out/<slug-del-prompt>.png`, con sufijo `-2`, `-3`… si el nombre ya existe.

### Flags disponibles

```
/imagen <prompt> [--model <id>] [--size <WxH>] [--out <ruta>] [--edit <imagen>]
```

| Flag | Descripción | Ejemplo |
|---|---|---|
| `--model` | Modelo a usar | `--model qwen-image-3.0` |
| `--size` | Resolución de salida (WxH) | `--size 1024x1024` |
| `--out` | Ruta de archivo de salida | `--out docs/portada.png` |
| `--edit` | Imagen de entrada para edición | `--edit foto.png "ponle un sombrero"` |

### Ejemplos

```
/imagen un gato astronauta --size 1024x1024
/imagen un faro --model qwen-image-3.0 --out out/faro.png
/imagen --edit foto.png "cambia el fondo a una playa al atardecer"
```

## Arquitectura

El plugin sigue la arquitectura de DeepSeek Harness:

- **Host (index.js)**: Lógica del servidor, lectura de credenciales y llamada directa al endpoint compatible de Alibaba
- **Cordis Patch**: Registro del plugin y configuración en el perfil de DSH

### Por qué llama a `/chat/completions` en vez de `/images/generations`

En el plan Token Plan, `qwen-image-3.0-pro` **no** está expuesto en `/images/generations` (404). Se sirve por `POST /compatible-mode/v1/chat/completions` exigiendo:

- `messages[0].role === "user"` (sin mensaje `system` previo)
- `messages[*].content` como **lista de partes** (`[{ "type": "text", "text": "..." }]`)

El comando construye el request con ese formato exacto y descarga el PNG de la URL devuelta (`output.choices[0].message.content[].image`) antes de que caduque (24 h).

## Seguridad

- No se embeben credenciales en el código: la API key se lee en tiempo de ejecución de `process.env` o del almacén de credenciales de DSH
- La API key nunca se escribe en logs ni en mensajes de respuesta
- Las URLs temporales de imagen se descargan al instante y no se exponen en la salida del comando

## Desarrollo

Este plugin fue creado usando **vibecoding** - programación conversacional con IA.

- **Enfoque**: Conversación iterativa en tiempo real
- **Pruebas**: Verificación del handler real con generación de imágenes de extremo a extremo

## Licencia

MIT