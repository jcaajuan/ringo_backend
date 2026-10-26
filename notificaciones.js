const { getMessaging } = require('firebase-admin/messaging');

const CANAL_SOLICITUD = 'ringo_solicitud_viaje_v2';
const SONIDO_SOLICITUD = 'ringo_solicitud_viaje';

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
    const conductor = await db.collection('conductores').doc(pres.id).get();
    const token = conductor.get('fcmToken');
    if (typeof token === 'string' && token.trim()) tokens.add(token.trim());
  }

  if (tokens.size === 0) {
    console.log(`Viaje ${doc.id}: ningún conductor conectado con fcmToken compatible`);
    return;
  }

  const origen = String(data.origenDireccion || 'Origen');
  const destino = String(data.destinoDireccion || 'Destino');
  const monto = Number(data.montoUsd ?? data.monto ?? 0);
  const titulo = 'Nueva solicitud de viaje';
  const cuerpo = `${origen} → ${destino} · $${Number.isFinite(monto) ? monto.toFixed(2) : '0.00'}`;
  const lista = [...tokens];

  for (let i = 0; i < lista.length; i += 500) {
    const lote = lista.slice(i, i + 500);
    const resultado = await getMessaging().sendEachForMulticast({
      tokens: lote,
      notification: {
        title: titulo,
        body: cuerpo,
      },
      data: {
        tipo: 'solicitud_viaje',
        viajeId: doc.id,
        titulo,
        cuerpo,
      },
      android: {
        priority: 'high',
        ttl: 30 * 1000,
        collapseKey: 'ringo_solicitud_viaje',
        notification: {
          channelId: CANAL_SOLICITUD,
          sound: SONIDO_SOLICITUD,
          priority: 'max',
          defaultVibrateTimings: true,
          visibility: 'public',
          tag: 'ringo_solicitud_viaje',
        },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: {
          aps: {
            sound: 'ringo_solicitud_viaje.mp3',
          },
        },
      },
    });
    console.log(
      `Viaje ${doc.id}: push ${resultado.successCount} ok, ${resultado.failureCount} fallos`,
    );
    resultado.responses.forEach((item, indice) => {
      if (!item.success) {
        console.error(`Token ${lote[indice].slice(0, 12)}…: ${item.error?.code || item.error?.message}`);
      }
    });
  }
}

module.exports = { escucharSolicitudes };
