const fs = require('fs');
const path = require('path');
const express = require('express');
const twilio = require('twilio');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue } = require('firebase-admin/firestore');
const db = require('../firebase');

const router = express.Router();
const envios = new Map();
let cliente = null;

function twilioClient() {
  if (cliente) return cliente;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  cliente = twilio(accountSid, authToken);
  return cliente;
}

function telefonoValido(valor) {
  const telefono = String(valor || '').trim();
  return /^\+[1-9]\d{7,14}$/.test(telefono) ? telefono : null;
}

function variantesTelefono(telefono) {
  const valores = new Set([telefono]);
  const digitos = telefono.replace(/\D/g, '');
  if (digitos) valores.add(digitos);
  if (digitos.startsWith('58') && digitos.length > 10) {
    const nacional = digitos.slice(2);
    valores.add(nacional);
    valores.add(`0${nacional}`);
    valores.add(`+58${nacional}`);
    valores.add(`58${nacional}`);
  }
  return [...valores];
}

function permitirEnvio(telefono) {
  const ahora = Date.now();
  const previo = envios.get(telefono);
  if (!previo || previo.reinicia < ahora) {
    envios.set(telefono, { cantidad: 1, reinicia: ahora + 10 * 60 * 1000 });
    return true;
  }
  if (previo.cantidad >= 5) return false;
  previo.cantidad += 1;
  return true;
}

function detalleTwilio(error) {
  console.error(JSON.stringify({
    code: error && error.code,
    status: error && error.status,
    message: error && error.message,
    moreInfo: error && error.moreInfo
  }));
}

function mensajeTwilio(error) {
  const codigo = Number(error && error.code);
  switch (codigo) {
    case 60202:
      return 'Demasiados intentos. Solicita un código nuevo.';
    case 60203:
      return 'Espera unos minutos antes de pedir otro código.';
    case 60200:
    case 21211:
      return 'El número no es válido. Usa el formato internacional, por ejemplo +58412XXXXXXX.';
    case 20404:
      return 'El código expiró o no existe. Solicita uno nuevo.';
    case 60205:
      return 'Ese número no puede recibir SMS.';
    default:
      return 'No se pudo completar la verificación. Intenta de nuevo.';
  }
}

function valorPlano(valor) {
  if (valor == null) return valor;
  if (typeof valor.toDate === 'function') return valor.toDate().toISOString();
  if (Array.isArray(valor)) return valor.map(valorPlano);
  if (typeof valor === 'object') {
    if (typeof valor.latitude === 'number' && typeof valor.longitude === 'number') {
      return { latitude: valor.latitude, longitude: valor.longitude };
    }
    const salida = {};
    for (const [clave, item] of Object.entries(valor)) {
      salida[clave] = valorPlano(item);
    }
    return salida;
  }
  return valor;
}

async function serviceSid() {
  if (process.env.TWILIO_VERIFY_SERVICE_SID) {
    return process.env.TWILIO_VERIFY_SERVICE_SID;
  }
  const servicio = await twilioClient().verify.v2.services.create({
    friendlyName: 'Ringo App',
    codeLength: 6
  });
  process.env.TWILIO_VERIFY_SERVICE_SID = servicio.sid;
  fs.appendFileSync(
    path.join(__dirname, '..', '.env'),
    `\nTWILIO_VERIFY_SERVICE_SID=${servicio.sid}\n`
  );
  return servicio.sid;
}

async function buscarUsuario(telefono) {
  const valores = variantesTelefono(telefono);
  const consultas = [
    ['usuarios', 'telefono'],
    ['conductores', 'telefono'],
    ['usuarios', 'phone'],
    ['conductores', 'phone']
  ];

  for (const [coleccion, campo] of consultas) {
    const snap = await db.collection(coleccion).where(campo, 'in', valores).limit(1).get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      return {
        id: doc.id,
        coleccion,
        ...valorPlano(doc.data())
      };
    }
  }
  return null;
}

// POST /api/auth/sendVerificationCode
router.post('/sendVerificationCode', async (req, res) => {
  const client = twilioClient();
  if (!client) {
    return res.status(503).json({
      success: false,
      message: 'Twilio no está configurado en el servidor'
    });
  }

  const telefono = telefonoValido(req.body && req.body.phoneNumber);
  if (!telefono) {
    return res.status(400).json({
      success: false,
      message: 'Número inválido. Usa formato internacional, por ejemplo +58412XXXXXXX.'
    });
  }
  if (!permitirEnvio(telefono)) {
    return res.status(429).json({
      success: false,
      message: 'Demasiados intentos. Espera unos minutos.'
    });
  }

  try {
    const sid = await serviceSid();
    try {
      const verificacion = await client.verify.v2.services(sid).verifications.create({
        to: telefono,
        channel: 'whatsapp'
      });
      return res.json({ success: true, channel: 'whatsapp', status: verificacion.status });
    } catch (whatsappError) {
      console.error('WhatsApp Verify no disponible:');
      detalleTwilio(whatsappError);
      const verificacion = await client.verify.v2.services(sid).verifications.create({
        to: telefono,
        channel: 'sms'
      });
      return res.json({ success: true, channel: 'sms', status: verificacion.status });
    }
  } catch (error) {
    console.error('Fallo al enviar el código OTP:');
    detalleTwilio(error);
    return res.status(error.status && error.status < 500 ? error.status : 502).json({
      success: false,
      message: mensajeTwilio(error)
    });
  }
});

function datosRegistro(body) {
  const nombre = String((body && body.nombre) || '').trim();
  const email = String((body && body.email) || '').trim().toLowerCase();
  const password = String((body && body.password) || '');
  if (!nombre && !email && !password) return null;
  if (!nombre || nombre.length > 50) {
    const error = new Error('Ingresa un nombre válido.');
    error.statusCode = 400;
    throw error;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 80) {
    const error = new Error('El correo electrónico no es válido.');
    error.statusCode = 400;
    throw error;
  }
  if (password.length < 6 || password.length > 32) {
    const error = new Error('La contraseña debe tener entre 6 y 32 caracteres.');
    error.statusCode = 400;
    throw error;
  }
  return { nombre, email, password };
}

function mensajeAuth(error) {
  switch (error && error.code) {
    case 'auth/email-already-exists':
      return 'Ya existe una cuenta con ese correo. Prueba iniciar sesión.';
    case 'auth/phone-number-already-exists':
      return 'Ese teléfono ya está registrado. Prueba iniciar sesión.';
    case 'auth/invalid-password':
      return 'La contraseña es muy débil. Usa al menos 6 caracteres.';
    case 'auth/invalid-email':
      return 'El correo electrónico no es válido.';
    default:
      return 'No se pudo crear la cuenta.';
  }
}

async function sesionDe(uid, extra) {
  const token = await getAuth().createCustomToken(uid);
  return { id: uid, ...extra, token };
}

async function crearCuenta(telefono, registro) {
  const auth = getAuth();
  let record;
  try {
    record = await auth.createUser({
      email: registro.email,
      password: registro.password,
      displayName: registro.nombre,
      phoneNumber: telefono
    });
  } catch (error) {
    if (error.code === 'auth/phone-number-already-exists') {
      const existente = await auth.getUserByPhoneNumber(telefono);
      const sesion = await sesionDe(existente.uid, {
        coleccion: 'usuarios',
        nombre: existente.displayName || '',
        email: existente.email || '',
        telefono
      });
      return { isNewUser: false, ...sesion };
    }
    const fallo = new Error(mensajeAuth(error));
    fallo.statusCode = error.code === 'auth/email-already-exists' ? 409 : 400;
    throw fallo;
  }

  try {
    await db.collection('usuarios').doc(record.uid).set({
      nombre: registro.nombre,
      email: registro.email,
      telefono,
      telefonoVerificado: true,
      rol: 'cliente',
      ciudad: 'El Tigre',
      estado: 'Anzoátegui',
      createdAt: FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Perfil no guardado en Firestore:', error.message);
  }

  const sesion = await sesionDe(record.uid, {
    coleccion: 'usuarios',
    nombre: registro.nombre,
    email: registro.email,
    telefono,
    rol: 'cliente'
  });
  return { isNewUser: true, ...sesion };
}

// POST /api/auth/verifyCode
router.post('/verifyCode', async (req, res) => {
  const client = twilioClient();
  if (!client) {
    return res.status(503).json({
      success: false,
      message: 'Twilio no está configurado en el servidor'
    });
  }
  if (!db) {
    return res.status(503).json({
      success: false,
      message: 'Firebase no está configurado en el servidor'
    });
  }

  const telefono = telefonoValido(req.body && req.body.phoneNumber);
  const codigo = String((req.body && req.body.code) || '').trim();
  if (!telefono || !/^\d{6}$/.test(codigo)) {
    return res.status(400).json({
      success: false,
      message: 'Código o número inválido.'
    });
  }

  try {
    const sid = await serviceSid();
    const resultado = await client.verify.v2.services(sid).verificationChecks.create({
      to: telefono,
      code: codigo
    });
    if (resultado.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'El código no es correcto o ya expiró.'
      });
    }

    const user = await buscarUsuario(telefono);
    if (user) {
      let token = null;
      try {
        token = await getAuth().createCustomToken(user.id);
      } catch (error) {
        console.error('No se pudo crear la sesión:', error.message);
      }
      return res.json({
        success: true,
        isNewUser: false,
        user,
        token
      });
    }

    const registro = datosRegistro(req.body);
    if (!registro) {
      return res.json({ success: true, isNewUser: true });
    }

    const cuenta = await crearCuenta(telefono, registro);
    const { token, isNewUser, ...perfil } = cuenta;
    return res.json({
      success: true,
      isNewUser,
      user: perfil,
      token
    });
  } catch (error) {
    console.error('Fallo al comprobar el código OTP:');
    detalleTwilio(error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    if (error.status || error.code) {
      return res.status(error.status && error.status < 500 ? error.status : 502).json({
        success: false,
        message: mensajeTwilio(error)
      });
    }
    return res.status(500).json({
      success: false,
      message: 'No se pudo verificar el código.'
    });
  }
});

module.exports = router;
