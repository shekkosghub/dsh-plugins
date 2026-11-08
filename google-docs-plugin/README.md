# Google Docs Plugin for DeepSeek Harness

Un plugin para DeepSeek Harness que permite leer y escribir documentos de Google Docs mediante OAuth2.

## Características

- 🔐 Autenticación OAuth2 segura con Google
- 📖 Leer documentos de Google Docs
- ✏️ Escribir y modificar documentos
- 📋 Listar documentos en Google Drive
- 🎨 Interfaz de configuración integrada en DSH

## Instalación

1. Copia la carpeta `google-docs-plugin` a tu workspace
2. En DeepSeek Harness, ve a Settings → Plugins
3. Instala el plugin desde la ruta local
4. Configura tus credenciales OAuth2

## Configuración

### Paso 1: Obtener credenciales de Google

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita las APIs:
   - Google Docs API
   - Google Drive API
4. Ve a Credentials → Create Credentials → OAuth Client ID
5. Selecciona "Desktop app" o "Web application"
6. Agrega el redirect URI: `http://localhost:8085/oauth2callback`
7. Copia tu Client ID y Client Secret

### Paso 2: Configurar en el plugin

1. Abre DeepSeek Harness
2. Ve a Settings → Plugins → Google Docs Integration
3. En la sección "Configuration":
   - Ingresa tu OAuth Client ID
   - Ingresa tu OAuth Client Secret
   - Haz clic en "Save Credentials"

### Paso 3: Autenticarse

El proceso de autenticación es sencillo y guiado:

#### 3.1 Iniciar la autenticación

Haz clic en **"Start Authentication"** en la configuración del plugin. Se abrirá una ventana del navegador para autorizar el acceso a tu cuenta de Google:

![Inicio de autenticación OAuth2](https://res.cloudinary.com/invztuml/image/upload/v1794168889/google_docs-dsh_plugin-start_oauth.png)

#### 3.2 Obtener el código de autorización

Después de autorizar, Google te redirigirá a una URL que contiene el código de autorización. Copia el valor del parámetro `code` de la URL:

![Obtener código de autorización](https://res.cloudinary.com/invztuml/image/upload/v1794168888/google_docs-dsh_plugin-get_code.png)

#### 3.3 Completar la autenticación

Usa el comando en el chat de DeepSeek Harness para completar el proceso:

```
/google-docs-complete-auth TU_CODIGO_AQUI
```

![Completar autenticación con comando](https://res.cloudinary.com/invztuml/image/upload/v1794168889/google_docs-dsh_plugin-complete_authentication.png)

#### 3.4 Verificación exitosa

Una vez completado, verás un mensaje confirmando que la autenticación fue exitosa:

![Autenticación completada exitosamente](https://res.cloudinary.com/invztuml/image/upload/v1794168889/google_docs-dsh_plugin-authentication_completed.png)

¡Listo! Ahora puedes usar todas las herramientas del plugin.

## Uso

### Herramientas disponibles

#### `google_docs_list`
Lista documentos en tu Google Drive.

```
Usa google_docs_list para ver mis documentos recientes
```

#### `google_docs_read`
Lee el contenido de un documento.

```
Usa google_docs_read con documentId="1abc123..." para leer mi documento
```

#### `google_docs_write`
Escribe o modifica un documento.

```
Usa google_docs_write con:
- documentId: "1abc123..."
- text: "Nuevo contenido"
- mode: "append" (o "replace", "insert")
```

#### `google_docs_auth`
Inicia el flujo de autenticación OAuth2.

```
Usa google_docs_auth para autenticarme con Google
```

#### `google_docs_save_config`
Guarda las credenciales OAuth2.

```
Usa google_docs_save_config con clientId="tu-client-id" y clientSecret="tu-client-secret"
```

#### `google_docs_complete_auth`
Completa la autenticación con el código de autorización.

```
Usa google_docs_complete_auth con code="4/0AUn6Hd..."
```

## Arquitectura

El plugin sigue la arquitectura de DeepSeek Harness:

- **Host (index.js)**: Lógica del servidor, manejo de OAuth2, llamadas a la API de Google
- **Client (client.js)**: Interfaz de usuario React para configuración
- **Cordis Patch**: Integración con el sistema de plugins de DSH

### Flujo de OAuth2

1. El usuario ingresa credenciales en la UI
2. Las credenciales se guardan usando `ctx.remote.credentials.set()`
3. Al autenticar, se genera una URL de autorización de Google
4. El usuario autoriza y obtiene un código
5. El código se intercambia por tokens de acceso
6. Los tokens se guardan de forma segura
7. Los tokens se refrescan automáticamente cuando expiran

## Seguridad

- Las credenciales se almacenan usando el servicio de credentials de DSH
- Los tokens OAuth2 se guardan de forma segura
- No se exponen credenciales en logs o mensajes
- El redirect URI usa localhost para desarrollo local

## Desarrollo

Este plugin fue creado usando **vibecoding** - programación conversacional con IA.

- **Modelo usado**: Qwen3.8 Max (Alibaba Token Plan Individual)
- **Tiempo de desarrollo**: ~4-5 horas
- **Líneas de código**: ~700
- **Enfoque**: Conversación iterativa en tiempo real

## Licencia

MIT

## Contribuir

Las contribuciones son bienvenidas. Este plugin sirve como ejemplo de cómo crear plugins para DeepSeek Harness usando vibecoding.

## Soporte

Para problemas o preguntas, abre un issue en el repositorio.
