// generar-licencia.js
const crypto = require('crypto');

const SECRET_SALT = "_TORNEOS_LIFETIME_MP_2026";
const clubId = process.argv[2];

if (!clubId) {
  console.error("Error: Debes proporcionar un Club ID.");
  console.error("Uso: node generar-licencia.js <CLUB_ID>");
  process.exit(1);
}

const payload = clubId.toUpperCase().trim() + SECRET_SALT;
const hashHex = crypto.createHash('sha256').update(payload).digest('hex').toUpperCase();

const hash8 = hashHex.substring(0, 8);
const code = `TRN-${hash8.substring(0, 4)}-${hash8.substring(4, 8)}`;

console.log("=========================================");
console.log("GENERADOR DE LICENCIA VITALICIA - TORNEOS");
console.log(`Club ID: ${clubId.toUpperCase().trim()}`);
console.log(`Licencia: ${code}`);
console.log("Estado: VITALICIA (1 solo pago)");
console.log("=========================================");
