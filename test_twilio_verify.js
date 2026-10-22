require('dotenv').config();
const twilio = require('twilio');

function detalle(error) {
  console.error(JSON.stringify({
    code: error && error.code,
    status: error && error.status,
    message: error && error.message,
    moreInfo: error && error.moreInfo
  }, null, 2));
}

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
const destino = process.argv[2];

if (!accountSid || !authToken || !serviceSid) {
  console.error('Faltan TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN o TWILIO_VERIFY_SERVICE_SID');
  process.exit(1);
}

const client = twilio(accountSid, authToken);

async function intentar(channel) {
  const verificacion = await client.verify.v2.services(serviceSid).verifications.create({
    to: destino,
    channel
  });
  console.log(JSON.stringify({
    channel,
    status: verificacion.status,
    sid: verificacion.sid,
    to: verificacion.to
  }, null, 2));
}

(async () => {
  const servicio = await client.verify.v2.services(serviceSid).fetch();
  console.log(JSON.stringify({
    serviceSid: servicio.sid,
    friendlyName: servicio.friendlyName
  }, null, 2));

  if (!destino || !/^\+[1-9]\d{7,14}$/.test(destino)) {
    console.log('Pasa un número E.164 para enviar un código: node test_twilio_verify.js +58412XXXXXXX');
    return;
  }

  try {
    await intentar('whatsapp');
  } catch (error) {
    console.error('WhatsApp fallo:');
    detalle(error);
    try {
      await intentar('sms');
    } catch (smsError) {
      console.error('SMS fallo:');
      detalle(smsError);
      process.exit(1);
    }
  }
})().catch((error) => {
  console.error('Twilio fallo:');
  detalle(error);
  process.exit(1);
});
