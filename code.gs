// Propiedades de script para almacenar configuraciones
const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();

// Datos de usuarios predefinidos
const USERS_DATA = [
  {
    id: "Administrador",
    name: "Administrador",
    email: "maused@dyesa.com",
    password: "AusedM",
    role: "admin"
  },
  {
    id: "manager_1",
    name: "Gerente",
    email: "gerente@serviceplus.com",
    password: "gerente123",
    role: "manager"
  },
  {
    id: "editor_1",
    name: "Editor",
    email: "editor@serviceplus.com",
    password: "editor123",
    role: "editor"
  },
  {
    id: "external_1",
    name: "Editor Externo",
    email: "externo@serviceplus.com",
    password: "externo123",
    role: "external_editor"
  },
  {
    id: "viewer_1",
    name: "Visualizador",
    email: "visualizador@serviceplus.com",
    password: "visualizador123",
    role: "viewer"
  }
];

// Función para obtener la información pública del usuario
function getPublicUserInfo() {
  try {
    const userEmail = Session.getActiveUser().getEmail();
    const userProperties = PropertiesService.getUserProperties();
    
    // Obtener información del usuario de la base de datos
    const userInfo = getUserByEmail(userEmail);
    
    if (!userInfo) {
      // Si el usuario no existe en la base de datos, crear un registro básico
      const firstName = userProperties.getProperty('firstName') || 'Usuario';
      const lastName = userProperties.getProperty('lastName') || 'Nuevo';
      
      return {
        email: userEmail,
        firstName: firstName,
        lastName: lastName,
        company: 'Mi Organización',
        role: 'viewer' // Por defecto, asignar el rol más restrictivo
      };
    }
    
    // Registrar el último acceso
    updateUserLastLogin(userInfo.id);
    
    return userInfo;
  } catch (error) {
    Logger.log('Error en getPublicUserInfo: ' + error);
    return null;
  }
}

// Función para obtener las tareas de Asana
function getAsanaTasks() {
  try {
    const apiKey = getAsanaApiKey();
    const url = 'https://app.asana.com/api/1.0/tasks?workspace=9620850264019&assignee=me&opt_fields=gid,name,notes,completed,due_on,created_at,modified_at,assignee,custom_fields,attachments';
    
    const response = UrlFetchApp.fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    const responseData = JSON.parse(response.getContentText());
    
    if (!responseData.data) {
      return [];
    }
    
    // Procesar las tareas para incluir campos personalizados en formato más accesible
    const tasks = responseData.data.map(task => {
      // Procesar campos personalizados
      let customFields = [];
      
      if (task.custom_fields && task.custom_fields.length > 0) {
        customFields = task.custom_fields.map(field => {
          let value = null;
          
          // Extraer el valor según el tipo de campo
          if (field.enum_value && field.enum_value.name) {
            value = field.enum_value.name;
          } else if (field.multi_enum_values && field.multi_enum_values.length > 0) {
            value = field.multi_enum_values.map(val => val.name).join(', ');
          } else if (field.number_value !== null && field.number_value !== undefined) {
            value = field.number_value.toString();
          } else if (field.text_value) {
            value = field.text_value;
          } else if (field.date_value) {
            if (field.date_value.date) {
              value = field.date_value.date;
            } else if (field.date_value.date_time) {
              value = field.date_value.date_time;
            }
          }
          
          return {
            id: field.gid,
            name: field.name,
            type: field.type,
            value: value
          };
        });
      }
      
      // Obtener el nombre del asignado si existe
      let assigneeName = null;
      if (task.assignee && task.assignee.name) {
        assigneeName = task.assignee.name;
      }
      
      return {
        gid: task.gid,
        name: task.name,
        notes: task.notes,
        completed: task.completed,
        dueOn: task.due_on,
        createdAt: task.created_at,
        modifiedAt: task.modified_at,
        assignee: assigneeName,
        customFields: customFields,
        attachments: task.attachments ? task.attachments.length : 0
      };
    });
    
    return tasks;
  } catch (error) {
    Logger.log('Error en getAsanaTasks: ' + error);
    throw new Error('Error al obtener tareas de Asana: ' + error.message);
  }
}

// Función para obtener las opciones de campos personalizados
function getCustomFieldOptions() {
  try {
    const apiKey = getAsanaApiKey();
    const workspaceId = '9620850264019'; // Reemplazar con el ID real del workspace
    const url = `https://app.asana.com/api/1.0/workspaces/${workspaceId}/custom_fields`;
    
    const response = UrlFetchApp.fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    const responseData = JSON.parse(response.getContentText());
    
    if (!responseData.data) {
      return [];
    }
    
    // Procesar los campos personalizados
    const customFields = responseData.data.map(field => {
      let options = [];
      
      if (field.enum_options) {
        options = field.enum_options.map(option => ({
          id: option.gid,
          name: option.name,
          color: option.color
        }));
      }
      
      return {
        id: field.gid,
        name: field.name,
        type: field.resource_subtype,
        options: options
      };
    });
    
    return customFields;
  } catch (error) {
    Logger.log('Error en getCustomFieldOptions: ' + error);
    throw new Error('Error al obtener opciones de campos personalizados: ' + error.message);
  }
}

// Función para crear una tarea en Asana
function createAsanaTask(name, notes, dueOn, customFields, assignee) {
  try {
    const apiKey = getAsanaApiKey();
    const workspaceId = '9620850264019'; // Reemplazar con el ID real del workspace
    const projectId = '1209100499036031'; // Reemplazar con el ID real del proyecto
    const url = 'https://app.asana.com/api/1.0/tasks';
    
    // Crear el payload base
    const payload = {
      data: {
        name: name,
        notes: notes,
        workspace: workspaceId,
        projects: [projectId]
      }
    };
    
    // Agregar fecha límite si se proporciona
    if (dueOn) {
      payload.data.due_on = dueOn;
    }
    
    // Agregar asignado si se proporciona
    if (assignee) {
      payload.data.assignee = assignee;
    }
    
    // Agregar campos personalizados si se proporcionan
    if (customFields && Object.keys(customFields).length > 0) {
      payload.data.custom_fields = {};
      
      Object.keys(customFields).forEach(fieldId => {
        const value = customFields[fieldId];
        
        // Manejar diferentes tipos de valores según el tipo de campo
        if (Array.isArray(value)) {
          // Para campos multi_enum
          payload.data.custom_fields[fieldId] = value;
        } else if (typeof value === 'object' && value !== null) {
          // Para campos de fecha
          payload.data.custom_fields[fieldId] = value;
        } else {
          // Para otros tipos de campos
          payload.data.custom_fields[fieldId] = value;
        }
      });
    }
    
    // Realizar la solicitud a la API
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode !== 201) {
      Logger.log('Error al crear tarea en Asana: ' + responseText);
      throw new Error('Error al crear tarea en Asana: ' + JSON.parse(responseText).errors[0].message);
    }
    
    const responseData = JSON.parse(responseText);
    
    // Registrar actividad
    const userEmail = Session.getActiveUser().getEmail();
    logActivity('create_task', 'Tarea creada', JSON.stringify({
      taskId: responseData.data.gid,
      taskName: name,
      userEmail: userEmail
    }));
    
    return responseData.data.gid;
  } catch (error) {
    Logger.log('Error en createAsanaTask: ' + error);
    throw new Error('Error al crear tarea en Asana: ' + error.message);
  }
}

// Función para actualizar el estado de completado de una tarea
function updateTaskCompletionStatus(taskId, completed) {
  try {
    const apiKey = getAsanaApiKey();
    const url = `https://app.asana.com/api/1.0/tasks/${taskId}`;
    
    const payload = {
      data: {
        completed: completed
      }
    };
    
    const response = UrlFetchApp.fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode !== 200) {
      Logger.log('Error al actualizar estado de tarea en Asana: ' + responseText);
      throw new Error('Error al actualizar estado de tarea en Asana: ' + JSON.parse(responseText).errors[0].message);
    }
    
    // Registrar actividad
    const userEmail = Session.getActiveUser().getEmail();
    const actionType = completed ? 'complete_task' : 'reopen_task';
    const actionDesc = completed ? 'Tarea completada' : 'Tarea reabierta';
    
    logActivity(actionType, actionDesc, JSON.stringify({
      taskId: taskId,
      userEmail: userEmail
    }));
    
    return true;
  } catch (error) {
    Logger.log('Error en updateTaskCompletionStatus: ' + error);
    throw new Error('Error al actualizar estado de tarea en Asana: ' + error.message);
  }
}

// Función para eliminar una tarea
function deleteAsanaTask(taskId) {
  try {
    const apiKey = getAsanaApiKey();
    const url = `https://app.asana.com/api/1.0/tasks/${taskId}`;
    
    const response = UrlFetchApp.fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      muteHttpExceptions: true
    });
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode !== 200) {
      Logger.log('Error al eliminar tarea en Asana: ' + responseText);
      throw new Error('Error al eliminar tarea en Asana: ' + JSON.parse(responseText).errors[0].message);
    }
    
    // Registrar actividad
    const userEmail = Session.getActiveUser().getEmail();
    logActivity('delete_task', 'Tarea eliminada', JSON.stringify({
      taskId: taskId,
      userEmail: userEmail
    }));
    
    return true;
  } catch (error) {
    Logger.log('Error en deleteAsanaTask: ' + error);
    throw new Error('Error al eliminar tarea en Asana: ' + error.message);
  }
}

// Función para obtener los adjuntos de una tarea
function getTaskAttachments(taskId) {
  try {
    const apiKey = getAsanaApiKey();
    const url = `https://app.asana.com/api/1.0/tasks/${taskId}/attachments`;
    
    const response = UrlFetchApp.fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    const responseData = JSON.parse(response.getContentText());
    
    if (!responseData.data) {
      return [];
    }
    
    // Procesar los adjuntos
    const attachments = responseData.data.map(attachment => {
      let type = 'file';
      
      // Determinar el tipo de adjunto
      if (attachment.view_url && attachment.view_url.includes('youtube.com')) {
        type = 'video';
      } else if (attachment.name.match(/\.(jpg|jpeg|png|gif)$/i)) {
        type = 'image';
      }
      
      return {
        id: attachment.gid,
        name: attachment.name,
        url: attachment.view_url || attachment.download_url,
        type: type,
        description: attachment.resource_subtype === 'external' ? 'Enlace externo' : '',
        thumbnail: type === 'video' ? `https://img.youtube.com/vi/${getYouTubeVideoId(attachment.view_url)}/0.jpg` : null
      };
    });
    
    return attachments;
  } catch (error) {
    Logger.log('Error en getTaskAttachments: ' + error);
    throw new Error('Error al obtener adjuntos de la tarea: ' + error.message);
  }
}

// Función para obtener el historial de actividad de una tarea
function getTaskActivity(taskId) {
  try {
    const apiKey = getAsanaApiKey();
    const url = `https://app.asana.com/api/1.0/tasks/${taskId}/stories`;
    
    const response = UrlFetchApp.fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    const responseData = JSON.parse(response.getContentText());
    
    if (!responseData.data) {
      return [];
    }
    
    // Procesar las historias
    const activities = responseData.data.map(story => {
      let type = 'info';
      
      // Determinar el tipo de actividad
      if (story.type === 'comment') {
        type = 'comment';
      } else if (story.text.includes('added to')) {
        type = 'create';
      } else if (story.text.includes('changed')) {
        type = 'update';
      } else if (story.text.includes('completed')) {
        type = 'complete';
      } else if (story.text.includes('attached')) {
        type = 'attachment';
      }
      
      return {
        id: story.gid,
        type: type,
        description: story.text,
        user: story.created_by ? story.created_by.name : 'Sistema',
        timestamp: story.created_at
      };
    });
    
    // Ordenar por fecha (más reciente primero)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return activities;
  } catch (error) {
    Logger.log('Error en getTaskActivity: ' + error);
    throw new Error('Error al obtener actividad de la tarea: ' + error.message);
  }
}

// Función para subir un adjunto a Asana
function uploadAsanaAttachment(taskId, fileData, fileName, description, fileType) {
  try {
    const apiKey = getAsanaApiKey();
    const url = `https://app.asana.com/api/1.0/tasks/${taskId}/attachments`;
    
    // Convertir datos base64 a blob
    const contentType = getContentTypeFromBase64(fileData);
    const blob = Utilities.newBlob(Utilities.base64Decode(fileData.split(',')[1]), contentType, fileName);
    
    // Crear el formulario multipart
    const boundary = Utilities.getUuid();
    
    const payload = Utilities.newBlob(
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="file"; filename="' + fileName + '"\r\n' +
      'Content-Type: ' + contentType + '\r\n\r\n'
    ).getBytes();
    
    const fileBytes = blob.getBytes();
    const endBytes = Utilities.newBlob(
      '\r\n--' + boundary + '--\r\n'
    ).getBytes();
    
    // Combinar los bytes
    const allBytes = [].concat(payload, fileBytes, endBytes);
    
    // Realizar la solicitud a la API
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'multipart/form-data; boundary=' + boundary
      },
      payload: allBytes,
      muteHttpExceptions: true
    });
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode !== 200) {
      Logger.log('Error al subir adjunto a Asana: ' + responseText);
      throw new Error('Error al subir adjunto a Asana: ' + JSON.parse(responseText).errors[0].message);
    }
    
    // Registrar actividad
    const userEmail = Session.getActiveUser().getEmail();
    logActivity('add_attachment', 'Adjunto agregado', JSON.stringify({
      taskId: taskId,
      fileName: fileName,
      fileType: fileType,
      userEmail: userEmail
    }));
    
    return true;
  } catch (error) {
    Logger.log('Error en uploadAsanaAttachment: ' + error);
    throw new Error('Error al subir adjunto a Asana: ' + error.message);
  }
}

// Función para adjuntar un enlace de YouTube a una tarea
function attachYouTubeLink(taskId, videoUrl, title) {
  try {
    const apiKey = getAsanaApiKey();
    const url = `https://app.asana.com/api/1.0/tasks/${taskId}/attachments`;
    
    // Validar que sea un enlace de YouTube
    if (!videoUrl.includes('youtube.com/') && !videoUrl.includes('youtu.be/')) {
      throw new Error('El enlace proporcionado no es un enlace válido de YouTube');
    }
    
    // Crear el payload
    const payload = {
      data: {
        resource_subtype: 'external',
        name: title || 'Video de YouTube',
        url: videoUrl
      }
    };
    
    // Realizar la solicitud a la API
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode !== 200) {
      Logger.log('Error al adjuntar enlace de YouTube a Asana: ' + responseText);
      throw new Error('Error al adjuntar enlace de YouTube a Asana: ' + JSON.parse(responseText).errors[0].message);
    }
    
    // Registrar actividad
    const userEmail = Session.getActiveUser().getEmail();
    logActivity('add_attachment', 'Enlace de YouTube adjuntado', JSON.stringify({
      taskId: taskId,
      videoUrl: videoUrl,
      userEmail: userEmail
    }));
    
    return true;
  } catch (error) {
    Logger.log('Error en attachYouTubeLink: ' + error);
    throw new Error('Error al adjuntar enlace de YouTube a Asana: ' + error.message);
  }
}

// Función para subir un video a YouTube y adjuntarlo a una tarea
function uploadVideoToYouTube(taskId, videoData, title, description) {
  try {
    // Obtener credenciales de YouTube
    const clientId = SCRIPT_PROPERTIES.getProperty('YOUTUBE_CLIENT_ID');
    const clientSecret = SCRIPT_PROPERTIES.getProperty('YOUTUBE_CLIENT_SECRET');
    
    if (!clientId || !clientSecret) {
      throw new Error('No se han configurado las credenciales de YouTube');
    }
    
    // Convertir datos base64 a blob
    const contentType = getContentTypeFromBase64(videoData);
    const blob = Utilities.newBlob(Utilities.base64Decode(videoData.split(',')[1]), contentType, title);
    
    // Autenticar con YouTube
    const service = getYouTubeService();
    
    if (!service.hasAccess()) {
      throw new Error('No se ha autorizado el acceso a YouTube. Por favor, configure la autorización en la configuración.');
    }
    
    // Subir el video a YouTube
    const videoId = uploadVideoToYouTubeAPI(service, blob, title, description);
    
    if (!videoId) {
      throw new Error('Error al subir el video a YouTube');
    }
    
    // Adjuntar el enlace del video a la tarea
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    attachYouTubeLink(taskId, videoUrl, title);
    
    // Registrar actividad
    const userEmail = Session.getActiveUser().getEmail();
    logActivity('add_attachment', 'Video subido a YouTube y adj untado', JSON.stringify({
      taskId: taskId,
      videoId: videoId,
      videoTitle: title,
      userEmail: userEmail
    }));
    
    return videoId;
  } catch (error) {
    Logger.log('Error en uploadVideoToYouTube: ' + error);
    throw new Error('Error al subir video a YouTube: ' + error.message);
  }
}

// Función para subir un video a la API de YouTube
function uploadVideoToYouTubeAPI(service, videoBlob, title, description) {
  try {
    const metadata = {
      snippet: {
        title: title,
        description: description || '',
        categoryId: '22' // Categoría "People & Blogs"
      },
      status: {
        privacyStatus: 'unlisted' // Video no listado
      }
    };
    
    // Crear la solicitud de inserción
    const requestBody = Utilities.newBlob(JSON.stringify(metadata), 'application/json');
    
    // Construir la URL de la API
    const uploadUrl = 'https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart';
    
    // Crear el límite para multipart
    const boundary = Utilities.getUuid();
    
    // Construir el cuerpo multipart
    const requestPayload = buildMultipartBody(boundary, requestBody, videoBlob);
    
    // Realizar la solicitud a la API
    const response = UrlFetchApp.fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + service.getAccessToken(),
        'Content-Type': 'multipart/related; boundary=' + boundary
      },
      payload: requestPayload,
      muteHttpExceptions: true
    });
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode !== 200) {
      Logger.log('Error al subir video a YouTube: ' + responseText);
      throw new Error('Error al subir video a YouTube: ' + JSON.parse(responseText).error.message);
    }
    
    const responseData = JSON.parse(responseText);
    return responseData.id;
  } catch (error) {
    Logger.log('Error en uploadVideoToYouTubeAPI: ' + error);
    throw new Error('Error al subir video a YouTube: ' + error.message);
  }
}

// Función para construir el cuerpo multipart para la API de YouTube
function buildMultipartBody(boundary, metadata, media) {
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelimiter = "\r\n--" + boundary + "--";
  
  const metadataContentType = metadata.getContentType();
  const mediaContentType = media.getContentType();
  
  const multipartRequestBody =
    delimiter +
    'Content-Type: ' + metadataContentType + '\r\n\r\n' +
    metadata.getDataAsString() +
    delimiter +
    'Content-Type: ' + mediaContentType + '\r\n' +
    'Content-Transfer-Encoding: binary\r\n\r\n';
  
  const multipartRequestBodyBlob = Utilities.newBlob(multipartRequestBody);
  const mediaBlob = media;
  const terminatorBlob = Utilities.newBlob(closeDelimiter);
  
  return [multipartRequestBodyBlob, mediaBlob, terminatorBlob];
}

// Función para obtener el servicio de YouTube
function getYouTubeService() {
  const clientId = SCRIPT_PROPERTIES.getProperty('YOUTUBE_CLIENT_ID');
  const clientSecret = SCRIPT_PROPERTIES.getProperty('YOUTUBE_CLIENT_SECRET');
  
  return OAuth2.createService('youtube')
    .setAuthorizationBaseUrl('https://accounts.google.com/o/oauth2/auth')
    .setTokenUrl('https://accounts.google.com/o/oauth2/token')
    .setClientId(clientId)
    .setClientSecret(clientSecret)
    .setPropertyStore(PropertiesService.getUserProperties())
    .setScope('https://www.googleapis.com/auth/youtube.upload')
    .setParam('access_type', 'offline')
    .setParam('approval_prompt', 'force');
}

// Función para obtener usuarios de Asana
function getAsanaUsers() {
  try {
    const apiKey = getAsanaApiKey();
    const workspaceId = '9620850264019'; // Reemplazar con el ID real del workspace
    const url = `https://app.asana.com/api/1.0/workspaces/${workspaceId}/users`;
    
    const response = UrlFetchApp.fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    const responseData = JSON.parse(response.getContentText());
    
    if (!responseData.data) {
      return [];
    }
    
    // Procesar los usuarios
    const users = responseData.data.map(user => ({
      id: user.gid,
      name: user.name,
      email: user.email
    }));
    
    return users;
  } catch (error) {
    Logger.log('Error en getAsanaUsers: ' + error);
    throw new Error('Error al obtener usuarios de Asana: ' + error.message);
  }
}

// Función para crear un usuario en el sistema
function createUser(name, email, role, password) {
  try {
    // Verificar si el usuario ya existe
    const existingUser = getUserByEmail(email);
    
    if (existingUser) {
      throw new Error('Ya existe un usuario con ese email');
    }
    
    // Validar el rol
    const validRoles = ['admin', 'manager', 'editor', 'viewer'];
    if (!validRoles.includes(role)) {
      throw new Error('Rol no válido');
    }
    
    // Crear hash de la contraseña
    const salt = Utilities.getUuid();
    const hashedPassword = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt).map(function(byte) {
      return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
    
    // Obtener la base de datos de usuarios
    let usersData = getUsersData();
    
    // Generar ID único
    const userId = Utilities.getUuid();
    
    // Crear el nuevo usuario
    const newUser = {
      id: userId,
      name: name,
      email: email,
      role: role,
      passwordHash: hashedPassword,
      salt: salt,
      createdAt: new Date().toISOString(),
      lastLogin: null
    };
    
    // Agregar el usuario a la base de datos
    usersData.push(newUser);
    
    // Guardar la base de datos actualizada
    saveUsersData(usersData);
    
    // Registrar actividad
    const userEmail = Session.getActiveUser().getEmail();
    logActivity('create_user', 'Usuario creado', JSON.stringify({
      userId: userId,
      userName: name,
      userEmail: email,
      userRole: role,
      createdBy: userEmail
    }));
    
    return userId;
  } catch (error) {
    Logger.log('Error en createUser: ' + error);
    throw new Error('Error al crear usuario: ' + error.message);
  }
}

// Función para obtener la lista de usuarios
function getUsers() {
  try {
    // Obtener la base de datos de usuarios
    const usersData = getUsersData();
    
    // Filtrar información sensible
    return usersData.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    }));
  } catch (error) {
    Logger.log('Error en getUsers: ' + error);
    throw new Error('Error al obtener usuarios: ' + error.message);
  }
}

// Función para eliminar un usuario
function deleteUser(userId) {
  try {
    // Obtener la base de datos de usuarios
    let usersData = getUsersData();
    
    // Buscar el usuario
    const userIndex = usersData.findIndex(user => user.id === userId);
    
    if (userIndex === -1) {
      throw new Error('Usuario no encontrado');
    }
    
    // Guardar información del usuario para el registro
    const deletedUser = usersData[userIndex];
    
    // Eliminar el usuario
    usersData.splice(userIndex, 1);
    
    // Guardar la base de datos actualizada
    saveUsersData(usersData);
    
    // Registrar actividad
    const userEmail = Session.getActiveUser().getEmail();
    logActivity('delete_user', 'Usuario eliminado', JSON.stringify({
      userId: userId,
      userName: deletedUser.name,
      userEmail: deletedUser.email,
      deletedBy: userEmail
    }));
    
    return true;
  } catch (error) {
    Logger.log('Error en deleteUser: ' + error);
    throw new Error('Error al eliminar usuario: ' + error.message);
  }
}

// Función para actualizar el último acceso de un usuario
function updateUserLastLogin(userId) {
  try {
    // Obtener la base de datos de usuarios
    let usersData = getUsersData();
    
    // Buscar el usuario
    const userIndex = usersData.findIndex(user => user.id === userId);
    
    if (userIndex === -1) {
      return false;
    }
    
    // Actualizar el último acceso
    usersData[userIndex].lastLogin = new Date().toISOString();
    
    // Guardar la base de datos actualizada
    saveUsersData(usersData);
    
    return true;
  } catch (error) {
    Logger.log('Error en updateUserLastLogin: ' + error);
    return false;
  }
}

// Función para actualizar los permisos de un campo
function updateFieldPermission(fieldId, role, permission) {
  try {
    // Validar el rol
    const validRoles = ['admin', 'manager', 'editor', 'viewer'];
    if (!validRoles.includes(role)) {
      throw new Error('Rol no válido');
    }
    
    // Validar el permiso
    const validPermissions = ['full', 'edit', 'view', 'none'];
    if (!validPermissions.includes(permission)) {
      throw new Error('Permiso no válido');
    }
    
    // Obtener la base de datos de permisos
    let permissionsData = getFieldPermissionsData();
    
    // Buscar el permiso existente
    const permissionIndex = permissionsData.findIndex(p => p.fieldId === fieldId && p.role === role);
    
    if (permissionIndex === -1) {
      // Crear un nuevo permiso
      permissionsData.push({
        fieldId: fieldId,
        role: role,
        permission: permission
      });
    } else {
      // Actualizar el permiso existente
      permissionsData[permissionIndex].permission = permission;
    }
    
    // Guardar la base de datos actualizada
    saveFieldPermissionsData(permissionsData);
    
    // Registrar actividad
    const userEmail = Session.getActiveUser().getEmail();
    logActivity('update_permission', 'Permiso de campo actualizado', JSON.stringify({
      fieldId: fieldId,
      role: role,
      permission: permission,
      updatedBy: userEmail
    }));
    
    return true;
  } catch (error) {
    Logger.log('Error en updateFieldPermission: ' + error);
    throw new Error('Error al actualizar permiso de campo: ' + error.message);
  }
}

// Función para guardar la configuración general
function saveGeneralSettings(orgName, timezone) {
  try {
    SCRIPT_PROPERTIES.setProperty('ORG_NAME', orgName);
    SCRIPT_PROPERTIES.setProperty('TIMEZONE', timezone);
    
    // Registrar actividad
    const userEmail = Session.getActiveUser().getEmail();
    logActivity('update_settings', 'Configuración general actualizada', JSON.stringify({
      orgName: orgName,
      timezone: timezone,
      updatedBy: userEmail
    }));
    
    return true;
  } catch (error) {
    Logger.log('Error en saveGeneralSettings: ' + error);
    throw new Error('Error al guardar configuración general: ' + error.message);
  }
}

// Función para guardar la configuración de API
function saveApiSettings(asanaApiKey, youtubeClientId, youtubeClientSecret) {
  try {
    if (asanaApiKey) {
      SCRIPT_PROPERTIES.setProperty('ASANA_API_KEY', asanaApiKey);
    }
    
    if (youtubeClientId) {
      SCRIPT_PROPERTIES.setProperty('YOUTUBE_CLIENT_ID', youtubeClientId);
    }
    
    if (youtubeClientSecret) {
      SCRIPT_PROPERTIES.setProperty('YOUTUBE_CLIENT_SECRET', youtubeClientSecret);
    }
    
    // Registrar actividad
    const userEmail = Session.getActiveUser().getEmail();
    logActivity('update_settings', 'Configuración de API actualizada', JSON.stringify({
      updatedBy: userEmail
    }));
    
    return true;
  } catch (error) {
    Logger.log('Error en saveApiSettings: ' + error);
    throw new Error('Error al guardar configuración de API: ' + error.message);
  }
}

// Función para guardar la configuración de notificaciones
function saveNotificationSettings(emailNotifications, summaryFrequency) {
  try {
    SCRIPT_PROPERTIES.setProperty('EMAIL_NOTIFICATIONS', emailNotifications.toString());
    SCRIPT_PROPERTIES.setProperty('SUMMARY_FREQUENCY', summaryFrequency);
    
    // Registrar actividad
    const userEmail = Session.getActiveUser().getEmail();
    logActivity('update_settings', 'Configuración de notificaciones actualizada', JSON.stringify({
      emailNotifications: emailNotifications,
      summaryFrequency: summaryFrequency,
      updatedBy: userEmail
    }));
    
    return true;
  } catch (error) {
    Logger.log('Error en saveNotificationSettings: ' + error);
    throw new Error('Error al guardar configuración de notificaciones: ' + error.message);
  }
}

// Función para registrar actividad
function logActivity(type, description, detailsJson) {
  try {
    // Obtener información del usuario
    const userEmail = Session.getActiveUser().getEmail();
    const user = getUserByEmail(userEmail);
    const userName = user ? user.name : userEmail;
    
    // Obtener la base de datos de actividad
    let activityData = getActivityData();
    
    // Crear el registro de actividad
    const activityRecord = {
      id: Utilities.getUuid(),
      type: type,
      description: description,
      user: userName,
      userEmail: userEmail,
      timestamp: new Date().toISOString(),
      details: detailsJson || '{}'
    };
    
    // Agregar el registro a la base de datos
    activityData.push(activityRecord);
    
    // Limitar el tamaño del registro (mantener los últimos 1000 registros)
    if (activityData.length > 1000) {
      activityData = activityData.slice(-1000);
    }
    
    // Guardar la base de datos actualizada
    saveActivityData(activityData);
    
    return true;
  } catch (error) {
    Logger.log('Error en logActivity: ' + error);
    return false;
  }
}

// Función para obtener el registro de actividad
function getActivityLog() {
  try {
    // Obtener la base de datos de actividad
    const activityData = getActivityData();
    
    // Ordenar por fecha (más reciente primero)
    activityData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Limitar a los últimos 100 registros
    return activityData.slice(0, 100);
  } catch (error) {
    Logger.log('Error en getActivityLog: ' + error);
    throw new Error('Error al obtener registro de actividad: ' + error.message);
  }
}

// Función para exportar el registro de actividad
function exportActivityLog() {
  try {
    // Obtener la base de datos de actividad
    const activityData = getActivityData();
    
    // Ordenar por fecha (más reciente primero)
    activityData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Crear una hoja de cálculo para exportar
    const ss = SpreadsheetApp.create('Registro de Actividad - ' + new Date().toISOString().split('T')[0]);
    const sheet = ss.getActiveSheet();
    
    // Agregar encabezados
    sheet.appendRow(['ID', 'Tipo', 'Descripción', 'Usuario', 'Email', 'Fecha', 'Detalles']);
    
    // Agregar datos
    activityData.forEach(activity => {
      sheet.appendRow([
        activity.id,
        activity.type,
        activity.description,
        activity.user,
        activity.userEmail,
        activity.timestamp,
        activity.details
      ]);
    });
    
    // Ajustar anchos de columna
    sheet.autoResizeColumns(1, 7);
    
    // Obtener la URL de la hoja de cálculo
    const url = ss.getUrl();
    
    // Registrar actividad
    const userEmail = Session.getActiveUser().getEmail();
    logActivity('export_activity', 'Registro de actividad exportado', JSON.stringify({
      exportedBy: userEmail,
      recordsCount: activityData.length
    }));
    
    return url;
  } catch (error) {
    Logger.log('Error en exportActivityLog: ' + error);
    throw new Error('Error al exportar registro de actividad: ' + error.message);
  }
}

// Función para obtener el ID de un video de YouTube a partir de su URL
function getYouTubeVideoId(url) {
  if (!url) return null;
  
  // Patrones de URL de YouTube
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/user\/.+\/\w{11}|youtube\.com\/attribution_link\?a=.+&u=%2Fwatch%3Fv%3D)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
    /youtu\.be\/([^&\n?#]+)/
  ];
  
  for (let i = 0; i < patterns.length; i++) {
    const match = url.match(patterns[i]);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

// Función para obtener el tipo de contenido a partir de datos base64
function getContentTypeFromBase64(base64Data) {
  if (!base64Data) return 'application/octet-stream';
  
  const match = base64Data.match(/^data:([^;]+);base64,/);
  return match ? match[1] : 'application/octet-stream';
}

// Función para obtener la clave API de Asana
function getAsanaApiKey() {
  const apiKey = SCRIPT_PROPERTIES.getProperty('ASANA_API_KEY');
  
  if (!apiKey) {
    throw new Error('No se ha configurado la clave API de Asana');
  }
  
  return apiKey;
}

// Función para obtener un usuario por email
function getUserByEmail(email) {
  try {
    const usersData = getUsersData();
    return usersData.find(user => user.email === email) || null;
  } catch (error) {
    Logger.log('Error en getUserByEmail: ' + error);
    return null;
  }
}

// Función para obtener la base de datos de usuarios
function getUsersData() {
  try {
    const usersJson = SCRIPT_PROPERTIES.getProperty('USERS_DATA');
    return usersJson ? JSON.parse(usersJson) : [];
  } catch (error) {
    Logger.log('Error en getUsersData: ' + error);
    return [];
  }
}

// Función para guardar la base de datos de usuarios
function saveUsersData(usersData) {
  try {
    SCRIPT_PROPERTIES.setProperty('USERS_DATA', JSON.stringify(usersData));
    return true;
  } catch (error) {
    Logger.log('Error en saveUsersData: ' + error);
    return false;
  }
}

// Función para obtener la base de datos de permisos de campos
function getFieldPermissionsData() {
  try {
    const permissionsJson = SCRIPT_PROPERTIES.getProperty('FIELD_PERMISSIONS_DATA');
    return permissionsJson ? JSON.parse(permissionsJson) : [];
  } catch (error) {
    Logger.log('Error en getFieldPermissionsData: ' + error);
    return [];
  }
}

// Función para guardar la base de datos de permisos de campos
function saveFieldPermissionsData(permissionsData) {
  try {
    SCRIPT_PROPERTIES.setProperty('FIELD_PERMISSIONS_DATA', JSON.stringify(permissionsData));
    return true;
  } catch (error) {
    Logger.log('Error en saveFieldPermissionsData: ' + error);
    return false;
  }
}

// Función para obtener la base de datos de actividad
function getActivityData() {
  try {
    const activityJson = SCRIPT_PROPERTIES.getProperty('ACTIVITY_DATA');
    return activityJson ? JSON.parse(activityJson) : [];
  } catch (error) {
    Logger.log('Error en getActivityData: ' + error);
    return [];
  }
}

// Función para guardar la base de datos de actividad
function saveActivityData(activityData) {
  try {
    SCRIPT_PROPERTIES.setProperty('ACTIVITY_DATA', JSON.stringify(activityData));
    return true;
  } catch (error) {
    Logger.log('Error en saveActivityData: ' + error);
    return false;
  }
}

// Función para inicializar la aplicación
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ServicePlus - Gestión de Tareas')
    .setFaviconUrl('https://i.ibb.co/mCzJTHyn/Service-Plus-Icon.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}