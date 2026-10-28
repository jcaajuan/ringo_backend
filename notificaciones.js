const { getMessaging } = require('firebase-admin/messaging');

const TTL_SOLICITUD_MS = 30 * 1000;
const TTL_AVISO_MS = 60 * 60 * 1000;

function compatible(tipoServicio, tipoVehiculo) {
  const servicio = String(tipoServicio || '').trim().toLowerCase();
  const vehiculo = String(tipoVehiculo || '').trim().toLowerCase();
  if (servicio === 'delivery') return vehiculo === 'moto' || vehiculo === 'carro';
  if (servicio === 'mototaxi') return vehiculo === 'moto';
  if (servicio === 'taxi') return vehiculo === 'carro';
  return false;
}

function tipoDePresencia(data) {
  if (!data) return '';
  if (typeof data.tipoVehiculo === 'string' && data.tipoVehiculo.trim()) {
    return data.tipoVehiculo.trim().toLowerCase();
  }
  const vehiculo = data.vehiculo;
  if (vehiculo && typeof vehiculo.tipo === 'string') return vehiculo.tipo.trim().toLowerCase();
  return '';
}

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function montoTexto(data) {
  const monto = Number(data.montoUsd ?? data.monto ?? 0);
  return Number.isFinite(monto) ? monto.toFixed(2) : '0.00';
}

/**
 * FCM solo con `data`. Sin bloque `notification`, Android entrega el mensaje
 * al handler de Flutter y la app pinta el canal local.
 * Todos los valores de `data` van como string, que es lo que acepta FCM.
 */
async function enviarData(tokens, data, { ttlMs, collapseKey } = {}) {
  const lista = [...new Set(
    [...tokens].map((token) => texto(token)).filter(Boolean),
  )];
  if (lista.length === 0) {
    console.log(`Push ${data.tipo || '?'} viaje ${data.viajeId || '?'}: sin token`);
    return;
  }

  const payload = {};
  for (const [clave, valor] of Object.entries(data)) {
    if (valor == null) continue;
    payload[clave] = String(valor);
  }

  for (let i = 0; i < lista.length; i += 500) {
    const lote = lista.slice(i, i + 500);
    const mensaje = {
      tokens: lote,
      data: payload,
      android: {
        priority: 'high',
        ttl: ttlMs,
      },
      apns: {
        headers: {
          'apns-priority': '5',
          'apns-push-type': 'background',
        },
        payload: {
          aps: { contentAvailable: true },
        },
      },
    };
    if (collapseKey) mensaje.android.collapseKey = collapseKey;

    const resultado = await getMessaging().sendEachForMulticast(mensaje);
    console.log(
      `Push ${payload.tipo} viaje ${payload.viajeId}: ${resultado.successCount} ok, ${resultado.failureCount} fallos`,
    );
    resultado.responses.forEach((item, indice) => {
      if (!item.success) {
        console.error(`Token ${lote[indice].slice(0, 12)}…: ${item.error?.code || item.error?.message}`);
      }
    });
  }
}

async function tokenDe(db, coleccion, uid) {
  const id = texto(uid);
  if (!id) return null;
  const snap = await db.collection(coleccion).doc(id).get();
  const token = snap.get('fcmToken');
  return texto(token) || null;
}

async function enviarAUsuario(db, uid, data, opciones) {
  const token = await tokenDe(db, 'usuarios', uid);
  if (!token) {
    console.log(`Push ${data.tipo} viaje ${data.viajeId}: usuarios/${uid || '?'} sin fcmToken`);
    return;
  }
  await enviarData([token], data, opciones);
}

async function enviarAConductor(db, uid, data, opciones) {
  const token = await tokenDe(db, 'conductores', uid);
  if (!token) {
    console.log(`Push ${data.tipo} viaje ${data.viajeId}: conductores/${uid || '?'} sin fcmToken`);
    return;
  }
  await enviarData([token], data, opciones);
}

/**
 * Avisa por FCM a los conductores conectados cuando entra un viaje pendiente.
 * El primer snapshot solo registra lo que ya existía: no reenvía solicitudes viejas.
 */
function escucharSolicitudes(db) {
  let sincronizado = false;

  db.collection('viajes')
    .where('estado', '==', 'pendiente')
    .onSnapshot(
      (snap) => {
        const nuevos = [];
        snap.docChanges().forEach((change) => {
          if (change.type !== 'added' || !sincronizado) return;
          nuevos.push(change.doc);
        });
        sincronizado = true;
        nuevos.forEach((doc) => {
          avisarConductores(db, doc).catch((error) => {
            console.error(`No se pudo avisar el viaje ${doc.id}:`, error.message);
          });
        });
      },
      (error) => {
        console.error('Escucha de viajes pendientes caída:', error.message);
      },
    );

  console.log('✅ Escuchando solicitudes pendientes para enviar push a conductores');
}

async function avisarConductores(db, doc) {
  const data = doc.data() || {};
  if (data.estado !== 'pendiente') return;

  const presencia = await db.collection('presencia').where('conectado', '==', true).get();
  const tokens = new Set();

  for (const pres of presencia.docs) {
    if (!compatible(data.tipoServicio, tipoDePresencia(pres.data()))) continue;
    const token = await tokenDe(db, 'conductores', pres.id);
    if (token) tokens.add(token);
  }

  const origen = texto(data.origenDireccion) || 'Origen';
  const destino = texto(data.destinoDireccion) || 'Destino';
  await enviarData(tokens, {
    tipo: 'solicitud_viaje',
    viajeId: doc.id,
    titulo: 'Nueva solicitud de viaje',
    cuerpo: `${origen} → ${destino} · $${montoTexto(data)}`,
  }, {
    ttlMs: TTL_SOLICITUD_MS,
    collapseKey: 'ringo_solicitud_viaje',
  });
}

/**
 * Cambios de estado del viaje. Ignora las escrituras de GPS: solo avisa
 * cuando `estado` pasa a otro valor.
 */
function escucharEstados(db) {
  const estados = new Map();
  let sincronizado = false;

  db.collection('viajes').onSnapshot(
    (snap) => {
      snap.docChanges().forEach((change) => {
        const id = change.doc.id;
        if (change.type === 'removed') {
          estados.delete(id);
          return;
        }
        const data = change.doc.data() || {};
        const anterior = estados.get(id);
        const actual = texto(data.estado);
        estados.set(id, actual);
        if (!sincronizado || change.type !== 'modified') return;
        if (!anterior || anterior === actual) return;
        notificarCambioEstado(db, change.doc, actual).catch((error) => {
          console.error(`No se pudo avisar el estado ${actual} del viaje ${id}:`, error.message);
        });
      });
      sincronizado = true;
    },
    (error) => {
      console.error('Escucha de estados de viaje caída:', error.message);
    },
  );

  console.log('✅ Escuchando cambios de estado para enviar push al pasajero');
}

async function notificarCambioEstado(db, doc, estado) {
  const data = doc.data() || {};
  const viajeId = doc.id;
  const aviso = avisoDeEstado(data, estado);
  if (!aviso) return;

  const opciones = {
    ttlMs: TTL_AVISO_MS,
    collapseKey: `${aviso.tipo}_${viajeId}`.slice(0, 64),
  };
  const payload = { ...aviso, viajeId };

  if (data.userId) {
    await enviarAUsuario(db, data.userId, payload, opciones);
  }

  if (estado === 'cancelado' && data.conductorId) {
    await enviarAConductor(db, data.conductorId, {
      tipo: 'viaje_cancelado',
      viajeId,
      titulo: 'Viaje cancelado',
      cuerpo: 'El pasajero canceló el viaje.',
    }, opciones);
  }
}

function avisoDeEstado(data, estado) {
  const nombre = texto(data.conductorNombre) || 'Tu conductor';
  switch (estado) {
    case 'aceptado':
      return {
        tipo: 'conductor_asignado',
        titulo: '¡Conductor asignado!',
        cuerpo: `${nombre} va en camino.`,
      };
    case 'llego':
      return {
        tipo: 'conductor_llego',
        titulo: 'Tu conductor llegó',
        cuerpo: 'Tu conductor ya está en el punto de encuentro.',
      };
    case 'finalizado':
      return {
        tipo: 'viaje_finalizado',
        titulo: 'Viaje finalizado',
        cuerpo: `Total: $${montoTexto(data)}. ¡Gracias por viajar con RinGo!`,
      };
    case 'cancelado':
      return {
        tipo: 'viaje_cancelado',
        titulo: 'Viaje cancelado',
        cuerpo: 'El viaje fue cancelado.',
      };
    default:
      return null;
  }
}

/**
 * Mensajes nuevos del chat. El primer snapshot no reenvía el historial.
 * Cada mensaje avisa a la otra parte del viaje.
 */
function escucharMensajes(db) {
  let sincronizado = false;

  db.collectionGroup('mensajes').onSnapshot(
    (snap) => {
      const nuevos = [];
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added' || !sincronizado) return;
        nuevos.push(change.doc);
      });
      sincronizado = true;
      nuevos.forEach((doc) => {
        avisarMensaje(db, doc).catch((error) => {
          console.error(`No se pudo avisar el mensaje ${doc.id}:`, error.message);
        });
      });
    },
    (error) => {
      console.error('Escucha de mensajes caída:', error.message);
    },
  );

  console.log('✅ Escuchando mensajes de chat para enviar push');
}

async function avisarMensaje(db, doc) {
  const data = doc.data() || {};
  const viajeRef = doc.ref.parent && doc.ref.parent.parent;
  if (!viajeRef) return;

  const autor = texto(data.autorId) || texto(data.senderId);
  const cuerpo = texto(data.texto);
  if (!autor || !cuerpo) return;

  const viajeSnap = await viajeRef.get();
  const viaje = viajeSnap.data() || {};
  const userId = texto(viaje.userId);
  const conductorId = texto(viaje.conductorId);
  const payload = {
    tipo: 'mensaje_chat',
    viajeId: viajeRef.id,
    mensajeId: doc.id,
    cuerpo,
  };
  const opciones = { ttlMs: TTL_AVISO_MS };

  if (autor === userId && conductorId) {
    await enviarAConductor(db, conductorId, {
      ...payload,
      titulo: texto(viaje.pasajeroNombre) || 'Pasajero',
    }, opciones);
    return;
  }
  if (autor === conductorId && userId) {
    await enviarAUsuario(db, userId, {
      ...payload,
      titulo: texto(viaje.conductorNombre) || 'Tu conductor',
    }, opciones);
  }
}

function escucharNotificaciones(db) {
  escucharSolicitudes(db);
  escucharEstados(db);
  escucharMensajes(db);
}

module.exports = { escucharNotificaciones, escucharSolicitudes };
