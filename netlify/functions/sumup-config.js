'use strict';
// La clé secrète est lue UNIQUEMENT depuis les variables d'environnement Netlify.
exports.handler = async function(event) {
  if(event.httpMethod !== 'GET') return { statusCode: 405, body: 'Méthode non autorisée' };
  const enabled = Boolean(process.env.SUMUP_API_KEY && process.env.SUMUP_MERCHANT_CODE && process.env.SUMUP_AUTO_PAYMENTS === 'true');
  return { statusCode: 200, headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}, body: JSON.stringify({enabled}) };
};
