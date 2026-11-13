'use strict';
const MAX_POTS = 12;
const CATALOG = Object.freeze({
  printemps: {type:'miel', price:850},
  lavande: {type:'miel', price:850},
  montagne: {type:'miel', price:850},
  chataignier: {type:'miel', price:850},
  pate: {type:'gourmandise', price:600}
});
const SHIPPING = [
  {max: .25, price:549},{max:.5,price:759},{max:.75,price:929},
  {max:1,price:959},{max:2,price:1119},{max:5,price:1739},{max:10,price:2529}
];
function priceOrder(items, fulfillment){
  if(!['pickup','handoff','delivery'].includes(fulfillment) || !items || typeof items!=='object'|| Array.isArray(items)) throw Error('Choix de réception invalide');
  let qty=0,honeys=0,sub=0,weight=0;
  for(const [key,value] of Object.entries(items)){
    const p=CATALOG[key];
    if(!p || !Number.isSafeInteger(value) || value < 1 || value >MAX_POTS)throw Error('Quantités invalides');
    qty+=value;sub+=value*p.price;honeys+=p.type==='miel'?value:0;weight+=value*(p.type==='miel'?.725:.4);
  }
  if(!qty || qty>MAX_POTS)throw Error('Maximum 12 pots par commande');
  const discount=honeys===12?510:0;
  let shipping=0;
  if(fulfillment==='delivery'){
    weight+=qty<=2?.35:qty<=6?.55:.75;
    const tier=SHIPPING.find(row=>weight<=row.max);
    if(!tier)throw Error('Livraison à définir avec le rucher');
    shipping=tier.price;
  }
  return {count:qty,honeyCount:honeys,subtotalCents:sub,discountCents:discount,shippingCents:shipping,totalCents:sub-discount+shipping};
}
exports._priceOrder = priceOrder; // Export destiné aux tests unitaires, pas au navigateur.
exports.handler = async function(event){
  if(event.httpMethod!=='POST')return {statusCode:405,body:'Méthode non autorisée'};
  if(!(process.env.SUMUP_API_KEY && process.env.SUMUP_MERCHANT_CODE && process.env.SUMUP_AUTO_PAYMENTS==='true'))return {statusCode:503,headers:{'Content-Type':'application/json'},body:JSON.stringify({error:'Paiement automatique non configuré. Votre commande reste enregistrée ; un lien peut être envoyé par e-mail.'})};
  try{
    if((event.body||'').length>4000)throw Error('Requête trop volumineuse');
    const {orderRef,items,fulfillment}=JSON.parse(event.body||'{}');
    if(typeof orderRef!=='string'||!/^RLN-[0-9a-f-]{12,48}$/i.test(orderRef))throw Error('Référence de commande invalide');
    const amount=priceOrder(items,fulfillment);
    const origin='https://rucherdelalouvenoire.fr';
    const checkoutBody={
      checkout_reference:orderRef,
      amount:amount.totalCents/100,
      currency:'EUR',
      merchant_code:process.env.SUMUP_MERCHANT_CODE,
      description:'Rucher de la Louve Noire - commande '+orderRef.slice(-12),
      hosted_checkout:{enabled:true},
      redirect_url:origin+'/paiement.html?commande='+encodeURIComponent(orderRef)
    };
    const response=await fetch('https://api.sumup.com/v0.1/checkouts',{
      method:'POST',
      headers:{'Authorization':'Bearer '+process.env.SUMUP_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify(checkoutBody),signal:AbortSignal.timeout(12000)
    });
    const json=await response.json().catch(()=>({}));
    if(!response.ok){console.error('SumUp create erreur HTTP',response.status, json?.error_code||json?.type||'');throw Error('SumUp refuse temporairement le paiement. Veuillez attendre un lien envoyé par e-mail.');}
    if(typeof json.hosted_checkout_url!=='string'||!json.hosted_checkout_url.startsWith('https://checkout.sumup.com/'))throw Error('Réponse SumUp incomplète');
    return {statusCode:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify({url:json.hosted_checkout_url,reference:orderRef,amount:amount.totalCents/100})};
  }catch(err){
    console.error('Création SumUp impossible',err.message);
    return {statusCode:400,headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({error:'Paiement par carte indisponible pour le moment. La commande a bien été transmise et le rucher pourra vous envoyer un lien de paiement sécurisé.'})};
  }
};
