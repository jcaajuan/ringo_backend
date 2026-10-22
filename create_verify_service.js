require('dotenv').config();
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.error('Faltan TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN en .env');
  process.exit(1);
}

twilio(accountSid, authToken)
  .verify.v2.services.create({ friendlyName: 'RingoApp', codeLength: 6 })
  .then((service) => {
    console.log(service.sid);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
