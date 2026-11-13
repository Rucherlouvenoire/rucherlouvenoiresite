'use strict';
exports.handler = async function(event){
 if(event.httpMethod!=='GET')return {statusCode:405,body:'Méthode non autorisée'};
 if(!process.env.SUMUP_API_KEY||!process.env.SUMUP_MERCHANT_CODE)return {statusCode:503,body:JSON.stringify({status:'UNKNOWN'})};
 const ref=event.queryStringParameters?.ref||'';
 if(!/^RLN-[0-9a-f-]{12,48}$/i.test(ref))return {statusCode:400,body:JSON.stringify({status:'UNKNOWN'})};
 try{
   const res=await fetch('https://api.sumup.com/v0.1/checkouts?checkout_reference='+encodeURIComponent(ref),{headers:{Authorization:'Bearer '+process.env.SUMUP_API_KEY},signal:AbortSignal.timeout(10000)});
   if(!res.ok)throw Error('API '+res.status);
   const data=await res.json();
   const row=Array.isArray(data)?data.find(x=>x.checkout_reference===ref&&x.merchant_code===process.env.SUMUP_MERCHANT_CODE):null;
   const status=['PAID','PENDING','FAILED','EXPIRED'].includes(row?.status)?row.status:'UNKNOWN';
   return {statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({status})};
 }catch(err){console.error('Statut SumUp indisponible',err.message);return {statusCode:503,headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'UNKNOWN'})};}
};
